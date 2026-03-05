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
import { leads, dialerCallAttempts, callSessions, callQualityRecords, campaigns } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { buildPostCallTranscriptWithSummaryAsync } from '../post-call-transcript-summary';
import { logCallIntelligence } from '../call-intelligence-logger';
import { recordTranscriptionResult } from '../transcription-monitor';
import {
  runLightweightDispositionTriage,
  runDeepAIAnalysis,
  type DeepAnalysisOutput,
} from '../disposition-deep-reanalyzer';
import { loadCampaignQualificationContext } from '../smart-disposition-analyzer';
import type { ConversationQualityAnalysis } from '../conversation-quality-analyzer';

const LOG_PREFIX = '[SIPPostCallHandler]';

export interface SIPTranscriptTurn {
  speaker: 'agent' | 'contact';
  text: string;
  timestamp?: number;
}

export interface SIPPostCallData {
  callAttemptId: string;
  leadId: string;
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

    if (!plainTranscript) {
      console.log(`${LOG_PREFIX} No transcript content — skipping post-call analysis for ${data.callAttemptId}`);
      return;
    }

    // Step 2: Generate call summary and description
    const { callSummary, callDescription } = await generateCallAnalysis(
      plainTranscript,
      data.turnTranscript,
      data.disposition,
      data.campaignId
    );

    // Step 3: Save transcript to lead record if one exists for this call attempt
    // For SIP calls, leadId may actually be a contactId — look up the real lead
    let resolvedLeadId: string | null = null;
    if (data.leadId) {
      // First try: look for a lead linked to this call attempt
      const [leadByAttempt] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.callAttemptId, data.callAttemptId))
        .limit(1);

      if (leadByAttempt) {
        resolvedLeadId = leadByAttempt.id;
      } else {
        // Second try: check if the passed leadId is actually a valid lead
        const [leadById] = await db
          .select({ id: leads.id })
          .from(leads)
          .where(eq(leads.id, data.leadId))
          .limit(1);

        if (leadById) {
          resolvedLeadId = leadById.id;
        }
      }
    }

    if (resolvedLeadId) {
      await saveLeadCallData(resolvedLeadId, plainTranscript, callSummary, callDescription);
    } else {
      console.log(`${LOG_PREFIX} No lead record found for call attempt ${data.callAttemptId} — skipping lead update (transcript saved to call attempt)`);
    }

    // Step 4: Update call attempt with transcript summary
    await updateCallAttemptWithTranscript(
      data.callAttemptId,
      plainTranscript,
      callSummary
    );

    // Step 5: Record transcription result + calculate metrics
    const turnMetrics = calculateTurnMetrics(data.turnTranscript);
    try {
      recordTranscriptionResult(data.callAttemptId, 'realtime_native', data.callAttemptId);
    } catch (metricErr) {
      console.warn(`${LOG_PREFIX} Failed to record transcription result:`, metricErr);
    }

    // Step 6: Run conversation quality analysis (triage + deep analysis)
    // Create a synthetic callSession so quality records can be stored
    let callSessionId: string | null = null;
    try {
      // Look up the call attempt to get phone/from info
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
        .set({ callSessionId, updatedAt: new Date() })
        .where(eq(dialerCallAttempts.id, data.callAttemptId));

      console.log(`${LOG_PREFIX} Created synthetic callSession ${callSessionId} for SIP call ${data.callAttemptId}`);
    } catch (sessionErr) {
      console.warn(`${LOG_PREFIX} Failed to create synthetic callSession:`, sessionErr);
    }

    // Step 7: Run quality analysis (lightweight triage + deep AI analysis)
    let qualityAnalysis: ConversationQualityAnalysis | null = null;
    try {
      qualityAnalysis = await runSIPQualityAnalysis(
        plainTranscript,
        data.disposition,
        data.callDurationSeconds,
        data.campaignId,
      );
      if (qualityAnalysis) {
        qualityAnalysis.metadata.transcriptLength = plainTranscript.length;
        console.log(`${LOG_PREFIX} Quality analysis: score=${qualityAnalysis.overallScore}`);
      }
    } catch (qaErr) {
      console.warn(`${LOG_PREFIX} Quality analysis failed:`, qaErr);
    }

    // Step 8: Log to call intelligence (quality records)
    if (callSessionId && qualityAnalysis) {
      try {
        const result = await logCallIntelligence({
          callSessionId,
          dialerCallAttemptId: data.callAttemptId,
          campaignId: data.campaignId,
          contactId: resolvedLeadId || data.leadId || undefined,
          qualityAnalysis,
          fullTranscript: plainTranscript,
        });
        if (result.success) {
          console.log(`${LOG_PREFIX} Call intelligence logged: ${result.recordId}`);
        }
      } catch (logErr) {
        console.warn(`${LOG_PREFIX} Failed to log call intelligence:`, logErr);
      }

      // Store quality analysis on the callSession
      try {
        await db.update(callSessions)
          .set({
            aiAnalysis: {
              postCallAnalysis: {
                analyzedAt: new Date().toISOString(),
                qualityScore: qualityAnalysis.overallScore,
                summary: qualityAnalysis.summary,
                disposition: data.disposition,
                dispositionReview: qualityAnalysis.dispositionReview,
                campaignAlignment: qualityAnalysis.campaignAlignment,
              },
              conversationQuality: {
                overallScore: qualityAnalysis.overallScore,
                summary: qualityAnalysis.summary,
                qualityDimensions: qualityAnalysis.qualityDimensions,
                campaignAlignment: qualityAnalysis.campaignAlignment,
                dispositionReview: qualityAnalysis.dispositionReview,
                issues: qualityAnalysis.issues,
                recommendations: qualityAnalysis.recommendations,
                breakdowns: qualityAnalysis.breakdowns,
                performanceGaps: qualityAnalysis.performanceGaps,
                flowCompliance: qualityAnalysis.flowCompliance,
                learningSignals: qualityAnalysis.learningSignals,
                nextBestActions: qualityAnalysis.nextBestActions,
                metadata: qualityAnalysis.metadata,
              },
            } as any,
          })
          .where(eq(callSessions.id, callSessionId));
      } catch (storeErr) {
        console.warn(`${LOG_PREFIX} Failed to store quality analysis on session:`, storeErr);
      }
    }

    console.log(`${LOG_PREFIX} Post-call analysis complete for call attempt ${data.callAttemptId}`);
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

  // Generate summary using AI
  const summaryResult = await buildPostCallTranscriptWithSummaryAsync(plainTranscript, turns, {
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
        transcriptSummary: summary || null,
        transcriptDescription: description || null,
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
/**
 * Run conversation quality analysis for SIP calls.
 * Uses lightweight triage for obvious cases (voicemail, no_answer) and
 * deep AI analysis for substantive conversations.
 */
async function runSIPQualityAnalysis(
  transcript: string,
  disposition: string,
  callDurationSec: number,
  campaignId?: string,
): Promise<ConversationQualityAnalysis | null> {
  // 1. Run lightweight triage first
  let triageResult: ReturnType<typeof runLightweightDispositionTriage> = null;
  let triageOnly = false;

  try {
    triageResult = runLightweightDispositionTriage(transcript, disposition || 'needs_review', callDurationSec);
    if (triageResult && triageResult.confidence >= 0.85) {
      triageOnly = true;
      console.log(`${LOG_PREFIX} Lightweight triage: ${triageResult.suggestedDisposition} (confidence: ${triageResult.confidence.toFixed(2)}) — skipping AI analysis`);
    }
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Lightweight triage failed: ${err.message}`);
  }

  // 2. For triage-only cases, build minimal quality analysis
  if (triageOnly) {
    return buildMinimalQuality(triageResult, disposition, callDurationSec);
  }

  // 3. Load campaign context for deep analysis
  let campaignContext: Awaited<ReturnType<typeof loadCampaignQualificationContext>> | null = null;
  let campaignData: { objective: string | null; qaParameters: any; talkingPoints: any; objections: any } | null = null;

  if (campaignId) {
    try {
      campaignContext = await loadCampaignQualificationContext(campaignId);
      const [campaign] = await db
        .select({
          objective: campaigns.campaignObjective,
          qaParameters: campaigns.qaParameters,
          talkingPoints: campaigns.talkingPoints,
          aiAgentSettings: campaigns.aiAgentSettings,
        })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (campaign) {
        const aiSettings = campaign.aiAgentSettings as Record<string, any> | null;
        campaignData = {
          objective: campaign.objective,
          qaParameters: campaign.qaParameters,
          talkingPoints: campaign.talkingPoints,
          objections: aiSettings?.objections || aiSettings?.commonObjections || null,
        };
      }
    } catch (ctxErr: any) {
      console.warn(`${LOG_PREFIX} Failed to load campaign context: ${ctxErr.message}`);
    }
  }

  // 4. Run deep AI analysis
  let deepAnalysis: DeepAnalysisOutput | null = null;
  try {
    const { output } = await runDeepAIAnalysis(
      transcript,
      campaignContext,
      campaignId || null,
      disposition || 'needs_review',
      callDurationSec,
      campaignData?.objective || null,
      campaignData?.qaParameters || null,
      campaignData?.talkingPoints || null,
      campaignData?.objections || null,
    );
    deepAnalysis = output;
    console.log(`${LOG_PREFIX} Deep analysis completed: agent=${deepAnalysis.agentBehavior.overallScore}, disposition=${deepAnalysis.dispositionAssessment.suggestedDisposition}`);
  } catch (deepErr: any) {
    console.error(`${LOG_PREFIX} Deep analysis failed: ${deepErr.message}`);
  }

  // 5. Map to ConversationQualityAnalysis
  if (deepAnalysis) {
    return mapDeepToQuality(deepAnalysis, disposition, callDurationSec);
  }

  // Fallback to minimal from triage
  return buildMinimalQuality(triageResult, disposition, callDurationSec);
}

/** Map DeepAnalysisOutput to ConversationQualityAnalysis */
function mapDeepToQuality(
  deep: DeepAnalysisOutput,
  disposition: string | null,
  callDurationSec: number,
): ConversationQualityAnalysis {
  const { agentBehavior, callQuality, dispositionAssessment } = deep;

  const breakdowns = (callQuality.keyMoments || []).map((km) => ({
    type: km.impact === 'negative' ? 'Issue' : km.impact === 'positive' ? 'Strength' : 'Observation',
    description: km.description,
    moment: km.timestamp,
    recommendation: undefined,
  }));

  const issues = (agentBehavior.weaknesses || []).map((w) => ({
    type: 'Performance Gap',
    severity: 'medium' as const,
    description: w,
    evidence: undefined,
    recommendation: undefined,
  }));

  const recommendations = (agentBehavior.weaknesses || []).map((w) => ({
    category: 'other' as const,
    currentBehavior: w,
    suggestedChange: agentBehavior.coachingNotes || 'Review coaching notes',
    expectedImpact: 'Improved call quality',
  }));

  const sentimentMap: Record<string, 'positive' | 'neutral' | 'negative'> = {
    positive: 'positive', negative: 'negative', neutral: 'neutral', mixed: 'neutral',
  };
  const engagementLevel = agentBehavior.engagementScore >= 70 ? 'high'
    : agentBehavior.engagementScore >= 40 ? 'medium' : 'low';

  const summaryParts: string[] = [];
  if (dispositionAssessment.reasoning) summaryParts.push(dispositionAssessment.reasoning);
  if (agentBehavior.coachingNotes) summaryParts.push(`Coaching: ${agentBehavior.coachingNotes}`);

  return {
    status: 'ok',
    overallScore: agentBehavior.overallScore,
    summary: summaryParts.join(' ') || 'Analysis completed via SIP deep analysis.',
    qualityDimensions: {
      engagement: agentBehavior.engagementScore,
      clarity: agentBehavior.scriptAdherenceScore,
      empathy: agentBehavior.empathyScore,
      objectionHandling: agentBehavior.objectionHandlingScore,
      qualification: agentBehavior.qualificationScore,
      closing: agentBehavior.closingScore,
    },
    campaignAlignment: {
      objectiveAdherence: callQuality.campaignAlignmentScore,
      contextUsage: Math.round(callQuality.campaignAlignmentScore * 0.85),
      talkingPointsCoverage: callQuality.talkingPointsCoverage,
      missedTalkingPoints: callQuality.missedTalkingPoints || [],
      notes: dispositionAssessment.positiveSignals.length > 0
        ? [`Positive signals: ${dispositionAssessment.positiveSignals.join(', ')}`] : [],
    },
    flowCompliance: { score: agentBehavior.scriptAdherenceScore, missedSteps: [], deviations: [] },
    dispositionReview: {
      assignedDisposition: disposition || undefined,
      expectedDisposition: dispositionAssessment.suggestedDisposition,
      isAccurate: !dispositionAssessment.shouldOverride,
      notes: [dispositionAssessment.reasoning].filter(Boolean),
    },
    qualificationAssessment: {
      metCriteria: callQuality.qualificationMet,
      successIndicators: dispositionAssessment.positiveSignals || [],
      missingIndicators: dispositionAssessment.negativeSignals || [],
      deviations: [],
    },
    breakdowns,
    issues,
    performanceGaps: agentBehavior.weaknesses || [],
    recommendations,
    promptUpdates: [],
    nextBestActions: agentBehavior.coachingNotes ? [agentBehavior.coachingNotes] : [],
    learningSignals: {
      sentiment: sentimentMap[callQuality.sentimentProgression] || 'neutral',
      engagementLevel,
      timePressure: false,
      outcome: dispositionAssessment.suggestedDisposition,
    },
    metadata: {
      model: 'sip-deep-analysis',
      analyzedAt: new Date().toISOString(),
      interactionType: 'live_call',
      analysisStage: 'post_call',
      transcriptLength: 0,
      truncated: false,
    },
  };
}

/** Build minimal quality analysis for triage-only cases */
function buildMinimalQuality(
  triageResult: ReturnType<typeof runLightweightDispositionTriage>,
  disposition: string | null,
  callDurationSec: number,
): ConversationQualityAnalysis {
  const suggested = triageResult?.suggestedDisposition || disposition || 'needs_review';
  return {
    status: 'ok',
    overallScore: 0,
    summary: triageResult?.reasoning || `Call classified as ${suggested} via lightweight triage.`,
    qualityDimensions: { engagement: 0, clarity: 0, empathy: 0, objectionHandling: 0, qualification: 0, closing: 0 },
    campaignAlignment: {
      objectiveAdherence: 0, contextUsage: 0, talkingPointsCoverage: 0,
      missedTalkingPoints: [],
      notes: [triageResult?.reasoning || 'No real conversation'].filter(Boolean),
    },
    flowCompliance: { score: 0, missedSteps: [], deviations: [] },
    dispositionReview: {
      assignedDisposition: disposition || undefined,
      expectedDisposition: suggested,
      isAccurate: !triageResult?.shouldOverride,
      notes: triageResult ? [triageResult.reasoning] : [],
    },
    qualificationAssessment: { metCriteria: false, successIndicators: [], missingIndicators: [], deviations: [] },
    breakdowns: [],
    issues: [],
    performanceGaps: [],
    recommendations: [],
    promptUpdates: [],
    nextBestActions: [],
    learningSignals: { sentiment: 'neutral', engagementLevel: 'low', timePressure: false, outcome: suggested },
    metadata: {
      model: 'sip-lightweight-triage',
      analyzedAt: new Date().toISOString(),
      interactionType: 'live_call',
      analysisStage: 'post_call',
      transcriptLength: 0,
      truncated: false,
    },
  };
}

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
