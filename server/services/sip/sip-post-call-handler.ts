/**
 * SIP Post-Call Analysis Handler
 *
 * Creates a synthetic callSession for SIP calls and delegates to the full
 * runPostCallAnalysis pipeline (same as TeXML).  This ensures SIP calls get
 * identical treatment: deep analysis, disposition reanalysis, intelligence
 * logging, campaign outcome evaluation, potential-lead detection, etc.
 */

import { db } from '../../db';
<<<<<<< HEAD
import { leads, dialerCallAttempts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { buildPostCallTranscriptWithSummaryAsync } from '../post-call-transcript-summary';
import { recordTranscriptionResult } from '../transcription-monitor';
=======
import { leads, dialerCallAttempts, callSessions } from '@shared/schema';
import { eq } from 'drizzle-orm';
>>>>>>> f1f4cca39ca6bedcaffb09527e55f174ed564739

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
 *
 * Creates a synthetic callSession and then delegates to the SAME full
 * runPostCallAnalysis pipeline that TeXML uses.  This ensures SIP calls
 * get identical treatment: deep AI analysis, disposition auto-correction,
 * call intelligence logging, campaign outcome evaluation, potential-lead
 * detection, etc.
 */
export async function processSIPPostCallAnalysis(data: SIPPostCallData): Promise<void> {
  try {
    console.log(`${LOG_PREFIX} Starting post-call analysis for call attempt ${data.callAttemptId}`);

    // Build plain transcript from turns
    const plainTranscript = data.turnTranscript
      .map(t => `${t.speaker === 'agent' ? 'Agent' : 'Contact'}: ${t.text}`)
      .join('\n')
      .trim();

<<<<<<< HEAD
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
=======
    if (!plainTranscript) {
      console.log(`${LOG_PREFIX} No transcript content — skipping post-call analysis for ${data.callAttemptId}`);
      return;
    }

    // Step 1: Create a synthetic callSession so the full pipeline has a session to work with
    let callSessionId: string | null = null;
    try {
      const [attempt] = await db
        .select({
          phoneDialed: dialerCallAttempts.phoneDialed,
          contactId: dialerCallAttempts.contactId,
          callStartedAt: dialerCallAttempts.callStartedAt,
        })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, data.callAttemptId))
        .limit(1);

      const [session] = await db
        .insert(callSessions)
        .values({
          toNumberE164: attempt?.phoneDialed || 'unknown',
          fromNumber: 'sip',
          status: 'completed',
          agentType: 'ai',
          campaignId: data.campaignId || null,
          contactId: attempt?.contactId || null,
          startedAt: attempt?.callStartedAt || new Date(),
          endedAt: new Date(),
          durationSec: data.callDurationSeconds,
          aiTranscript: plainTranscript,
          aiDisposition: data.disposition,
        })
        .returning({ id: callSessions.id });

      callSessionId = session.id;

      // Link it back to the call attempt
      await db.update(dialerCallAttempts)
        .set({ callSessionId, fullTranscript: plainTranscript, updatedAt: new Date() })
        .where(eq(dialerCallAttempts.id, data.callAttemptId));

      console.log(`${LOG_PREFIX} Created synthetic callSession ${callSessionId} for SIP call ${data.callAttemptId}`);
    } catch (sessionErr) {
      console.warn(`${LOG_PREFIX} Failed to create synthetic callSession:`, sessionErr);
    }

    // Step 2: Save transcript to lead record
    try {
      const [leadByAttempt] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.callAttemptId, data.callAttemptId))
        .limit(1);

      if (leadByAttempt) {
        await db.update(leads)
          .set({ transcript: plainTranscript, updatedAt: new Date() })
          .where(eq(leads.id, leadByAttempt.id));
        console.log(`${LOG_PREFIX} Saved transcript to lead ${leadByAttempt.id}`);
      }
    } catch (leadErr) {
      console.warn(`${LOG_PREFIX} Failed to update lead transcript:`, leadErr);
    }

    // Step 3: Delegate to the FULL post-call analysis pipeline (same as TeXML)
    // This handles: deep AI analysis, quality scoring, disposition reanalysis,
    // auto-correction, call intelligence logging, campaign outcome evaluation, etc.
    if (callSessionId) {
      const { runPostCallAnalysis } = await import('../post-call-analyzer');
      const result = await runPostCallAnalysis(callSessionId, {
        callAttemptId: data.callAttemptId,
        campaignId: data.campaignId,
        contactId: data.leadId || undefined,
        callDurationSec: data.callDurationSeconds,
        disposition: data.disposition,
        geminiTranscript: plainTranscript,
      });

      if (result.success) {
        console.log(`${LOG_PREFIX} ✅ Full post-call analysis complete for ${data.callAttemptId} (via unified pipeline)`);
      } else {
        console.warn(`${LOG_PREFIX} Post-call analysis returned: ${result.error || 'unknown error'}`);
      }
    } else {
      console.warn(`${LOG_PREFIX} No callSession created — cannot run full post-call analysis for ${data.callAttemptId}`);
    }
>>>>>>> f1f4cca39ca6bedcaffb09527e55f174ed564739

    console.log(`${LOG_PREFIX} Post-call analysis complete for call attempt ${data.callAttemptId}`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} ❌ Error processing post-call analysis:`, error);
  }
}
<<<<<<< HEAD

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
=======
>>>>>>> f1f4cca39ca6bedcaffb09527e55f174ed564739
