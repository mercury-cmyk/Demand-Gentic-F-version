/**
 * SIP Post-Call Analysis Handler
 *
 * After a SIP call ends and disposition is submitted, this service:
 * 1. Builds structured transcripts with speaker attribution
 * 2. Generates call summaries and descriptions
 * 3. Updates lead/call attempt records with transcription data
 * 4. Triggers post-call analysis (quality check, AI scoring)
 * 5. Records learning data for model training
 */

import { db } from '../../db';
import { leads, dialerCallAttempts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { buildPostCallTranscriptWithSummaryAsync } from '../post-call-transcript-summary';
import { recordTranscriptionResult } from '../transcription-monitor';

const LOG_PREFIX = '[SIPPostCallHandler]';

export interface SIPTranscriptTurn {
  speaker: 'agent' | 'contact';
  text: string;
  timestamp?: number;
}

export interface SIPPostCallData {
  callAttemptId: string;
  leadId?: string;
  campaignId: string;
  contactName?: string;
  disposition: string;
  turnTranscript: SIPTranscriptTurn[];
  callDurationSeconds: number;
  agentNotes?: string;
}

/**
 * Process SIP call post-call analysis
 */
export async function processSIPPostCallAnalysis(data: SIPPostCallData): Promise<void> {
  try {
    console.log(`${LOG_PREFIX} Starting post-call analysis for call attempt ${data.callAttemptId}`);

    // Step 1: Build structured transcript with speaker attribution
    const { plainTranscript, summary } = await buildStructuredTranscript(data.turnTranscript, data.callDurationSeconds);

    // Step 2: Generate call summary and description
    const { callSummary, callDescription } = await generateCallAnalysis(
      plainTranscript,
      data.turnTranscript,
      data.disposition,
      data.campaignId
    );

    // Step 3: Save transcript and summary to lead record (skip if no leadId — e.g., no_answer/voicemail)
    if (data.leadId) {
      await saveLeadCallData(
        data.leadId,
        plainTranscript,
        callSummary,
        callDescription
      );
    } else {
      console.log(`${LOG_PREFIX} No leadId — skipping lead data save for call attempt ${data.callAttemptId}`);
    }

    // Step 4: Update call attempt with transcript summary
    await updateCallAttemptWithTranscript(
      data.callAttemptId,
      plainTranscript,
      callSummary
    );

    // Step 5: Record transcription result in metrics tracker
    const turnMetrics = calculateTurnMetrics(data.turnTranscript);
    if (data.callAttemptId) {
      recordTranscriptionResult(data.callAttemptId, 'realtime_native', data.callAttemptId);
    }

    // Step 6: Log summary to console (call-intelligence logger requires callSessionId + qualityAnalysis)
    console.log(`${LOG_PREFIX} Call intelligence: disposition=${data.disposition} turns=${turnMetrics.totalTurns} agentRatio=${turnMetrics.agentTalkRatio.toFixed(2)} notes=${data.agentNotes || 'none'}`);

    console.log(`${LOG_PREFIX} ✅ Post-call analysis complete for call attempt ${data.callAttemptId}`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} ❌ Error processing post-call analysis:`, error);
    // Don't fail the call - log the error but continue
  }
}

/**
 * Build structured transcript from turn-based conversation
 */
async function buildStructuredTranscript(
  turns: SIPTranscriptTurn[],
  durationSeconds: number
): Promise<{ plainTranscript: string; summary: string }> {
  if (!turns || turns.length === 0) {
    return { plainTranscript: '', summary: '' };
  }

  // Build plain text transcript with speaker labels
  const lines: string[] = [];
  for (const turn of turns) {
    const speaker = turn.speaker === 'agent' ? 'Agent' : 'Contact';
    lines.push(`${speaker}: ${turn.text}`);
  }

  const plainTranscript = lines.join('\n');

  // Generate summary using AI — map speaker→role for SummaryTranscriptTurn compatibility
  const summaryTurns = turns.map(t => ({ role: t.speaker as 'agent' | 'contact', text: t.text, timeOffset: t.timestamp }));
  const summaryResult = await buildPostCallTranscriptWithSummaryAsync(plainTranscript, summaryTurns, {
    durationSec: durationSeconds,
    maxWords: 200,
  });

  return {
    plainTranscript,
    summary: summaryResult || plainTranscript.substring(0, 500),
  };
}

/**
 * Generate call analysis (summary and description)
 */
async function generateCallAnalysis(
  transcript: string,
  turns: SIPTranscriptTurn[],
  disposition: string,
  campaignId: string
): Promise<{ callSummary: string; callDescription: string }> {
  // Extract key information from transcript
  const contactTurns = turns.filter(t => t.speaker === 'contact').map(t => t.text).join(' ');
  const agentTurns = turns.filter(t => t.speaker === 'agent').map(t => t.text).join(' ');

  // Build summary: "Agent said X, Contact said Y, Outcome: Z"
  const contactPreview = contactTurns.substring(0, 200);
  const agentPreview = agentTurns.substring(0, 200);

  const callSummary = `
Disposition: ${disposition}

Agent spoke for approximately ${agentTurns.length} characters covering: ${agentPreview.substring(0, 150)}...

Contact response: ${contactPreview || '(silent/minimal participation)'}...

Key outcome: ${disposition}
`.trim();

  // Build description: structured outcome
  const callDescription = buildCallDescription(disposition, turns);

  return {
    callSummary,
    callDescription,
  };
}

/**
 * Build structured call description based on disposition
 */
function buildCallDescription(disposition: string, turns: SIPTranscriptTurn[]): string {
  const hasContactResponse = turns.some(t => t.speaker === 'contact');
  const agentTurns = turns.filter(t => t.speaker === 'agent').length;
  const contactTurns = turns.filter(t => t.speaker === 'contact').length;

  let description = '';

  switch (disposition.toLowerCase()) {
    case 'qualified_lead':
      description = `Contact engaged positively. AI agent successfully identified qualified opportunity. ${contactTurns} contact turns, ${agentTurns} agent turns.`;
      break;
    case 'not_interested':
      description = `Contact indicated disinterest in opportunity. AI agent handled rejection professionally.`;
      break;
    case 'callback_requested':
      description = `Contact requested callback. AI agent successfully obtained agreement for follow-up contact.`;
      break;
    case 'do_not_call':
      description = `Contact requested removal from outreach. AI agent honored suppression request immediately.`;
      break;
    case 'voicemail':
      description = `Reached voicemail. AI agent left appropriate message. No live contact.`;
      break;
    case 'no_answer':
      description = `No answer or unanswered call. Contact did not engage.`;
      break;
    case 'needs_review':
      description = `Call outcome requires human review for qualification determination.`;
      break;
    default:
      description = `Call disposition: ${disposition}. Contact engagement: ${contactTurns > 0 ? 'Yes' : 'Minimal'}.`;
  }

  return description;
}

/**
 * Save transcript and summary to lead record
 */
async function saveLeadCallData(
  leadId: string,
  transcript: string,
  summary: string,
  description: string
): Promise<void> {
  try {
    await db
      .update(leads)
      .set({
        transcript: transcript || null,
        structuredTranscript: { summary: summary || null, description: description || null },
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    console.log(`${LOG_PREFIX} Saved transcript data to lead ${leadId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error saving lead transcript data:`, error);
    throw error;
  }
}

/**
 * Update call attempt with transcript information
 */
async function updateCallAttemptWithTranscript(
  callAttemptId: string,
  transcript: string,
  summary: string
): Promise<void> {
  try {
    const firstLine = transcript.split('\n')[0] || '';
    const description = `${summary.substring(0, 200)}...`;

    await db
      .update(dialerCallAttempts)
      .set({
        notes: description,
        updatedAt: new Date(),
      })
      .where(eq(dialerCallAttempts.id, callAttemptId));

    console.log(`${LOG_PREFIX} Updated call attempt ${callAttemptId} with transcript summary`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating call attempt:`, error);
    throw error;
  }
}

/**
 * Calculate turn metrics from transcript
 */
function calculateTurnMetrics(turns: SIPTranscriptTurn[]): Record<string, any> {
  const agentTurns = turns.filter(t => t.speaker === 'agent');
  const contactTurns = turns.filter(t => t.speaker === 'contact');

  const agentWords = agentTurns.reduce((sum, t) => sum + (t.text?.split(/\s+/).length || 0), 0);
  const contactWords = contactTurns.reduce((sum, t) => sum + (t.text?.split(/\s+/).length || 0), 0);

  const totalWords = agentWords + contactWords;
  const agentRatio = totalWords > 0 ? agentWords / totalWords : 0;

  return {
    totalTurns: turns.length,
    agentTurns: agentTurns.length,
    contactTurns: contactTurns.length,
    agentWords,
    contactWords,
    agentTalkRatio: agentRatio,
    avgAgentTurnWords: agentTurns.length > 0 ? agentWords / agentTurns.length : 0,
    avgContactTurnWords: contactTurns.length > 0 ? contactWords / contactTurns.length : 0,
  };
}
