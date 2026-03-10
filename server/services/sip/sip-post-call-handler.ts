/**
 * SIP Post-Call Analysis Handler
 *
 * Creates a synthetic callSession for SIP calls and delegates to the full
 * runPostCallAnalysis pipeline (same as TeXML). This ensures SIP calls get
 * identical treatment: deep analysis, disposition reanalysis, intelligence
 * logging, campaign outcome evaluation, potential-lead detection, etc.
 */

import { eq } from 'drizzle-orm';

import { db } from '../../db';
import {
  callSessions,
  campaignTestCalls,
  dialerCallAttempts,
  leads,
  previewSimulationTranscripts,
  previewStudioSessions,
} from '@shared/schema';

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
  previewSessionId?: string | null;
  providerCallId?: string | null;
}

export function extractCampaignTestCallId(callAttemptId: string | null | undefined): string | null {
  if (!callAttemptId?.startsWith('test-attempt-')) {
    return null;
  }

  const testCallId = callAttemptId.slice('test-attempt-'.length).trim();
  return testCallId || null;
}

function mapCampaignTestTranscriptTurns(turns: SIPTranscriptTurn[]): Array<{ role: 'agent' | 'contact'; text: string; timestamp?: string }> {
  return turns
    .map((turn) => {
      const text = String(turn.text || '').trim();
      if (!text) {
        return null;
      }

      const payload: { role: 'agent' | 'contact'; text: string; timestamp?: string } = {
        role: turn.speaker,
        text,
      };

      if (typeof turn.timestamp === 'number' && Number.isFinite(turn.timestamp)) {
        payload.timestamp = new Date(turn.timestamp).toISOString();
      }

      return payload;
    })
    .filter((turn): turn is { role: 'agent' | 'contact'; text: string; timestamp?: string } => !!turn);
}

type SIPQualityAnalysis = {
  summary?: string | null;
  overallScore?: number | null;
  issues?: Array<{
    type?: string;
    severity?: 'low' | 'medium' | 'high';
    description?: string;
    recommendation?: string;
  }>;
  promptUpdates?: Array<{
    category?: string;
    change?: string;
    rationale?: string;
    priority?: 'low' | 'medium' | 'high';
  }>;
  dispositionReview?: Record<string, unknown> | null;
} | null;

function buildPreviewTranscriptRows(sessionId: string, turns: SIPTranscriptTurn[]): Array<{
  sessionId: string;
  role: 'assistant' | 'user';
  content: string;
  timestampMs: number;
  metadata: Record<string, unknown>;
}> {
  const cleanedTurns = turns
    .map((turn, index) => ({
      speaker: turn.speaker,
      text: String(turn.text || '').trim(),
      timestamp: typeof turn.timestamp === 'number' && Number.isFinite(turn.timestamp) ? turn.timestamp : undefined,
      index,
    }))
    .filter((turn) => !!turn.text);

  if (cleanedTurns.length === 0) {
    return [];
  }

  const baseTimestamp = cleanedTurns.find((turn) => typeof turn.timestamp === 'number')?.timestamp;

  return cleanedTurns.map((turn) => ({
    sessionId,
    role: turn.speaker === 'agent' ? 'assistant' : 'user',
    content: turn.text,
    timestampMs:
      typeof turn.timestamp === 'number' && typeof baseTimestamp === 'number'
        ? Math.max(0, Math.round(turn.timestamp - baseTimestamp))
        : turn.index * 1000,
    metadata: {
      source: 'sip_post_call_handler',
      speaker: turn.speaker,
    },
  }));
}

export function buildPreviewSessionUpdate(options: {
  existingMetadata?: Record<string, unknown> | null;
  callSessionId: string | null;
  callControlId?: string | null;
  disposition: string;
  callDurationSeconds: number;
  transcriptTurnCount: number;
  qualityAnalysis?: SIPQualityAnalysis;
}): Record<string, unknown> {
  const generatedAt = new Date().toISOString();
  const metadata = {
    ...((options.existingMetadata as Record<string, unknown>) || {}),
    callEngine: 'sip',
    finalDisposition: options.disposition,
    postCallAnalysisTranscriptCount: options.transcriptTurnCount,
    postCallReadyAt: generatedAt,
  } as Record<string, unknown>;

  if (options.callSessionId) {
    metadata.callSessionId = options.callSessionId;
  }
  if (options.callControlId) {
    metadata.callControlId = options.callControlId;
  }

  return {
    status: 'completed',
    endedAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      ...metadata,
      postCallAnalysis: {
        generatedAt,
        transcriptTurnCount: options.transcriptTurnCount,
        transcriptAvailable: options.transcriptTurnCount > 0,
        summary:
          options.qualityAnalysis?.summary ||
          (options.transcriptTurnCount > 0
            ? `Post-call analysis ready (${options.transcriptTurnCount} turns captured).`
            : 'Call ended. No transcript captured yet; showing provisional outcome.'),
        conversationQuality: null,
        voiceDialerAnalysis: options.qualityAnalysis
          ? {
              summary: options.qualityAnalysis.summary || null,
              overallScore: options.qualityAnalysis.overallScore ?? null,
              issues: options.qualityAnalysis.issues || [],
              promptUpdates: options.qualityAnalysis.promptUpdates || [],
              dispositionReview: options.qualityAnalysis.dispositionReview || null,
            }
          : null,
        dispositionSource: 'sip_post_call_handler',
        durationSeconds: options.callDurationSeconds,
      },
    },
  };
}

export function buildCampaignTestCallUpdate(options: {
  callSessionId: string | null;
  disposition: string;
  callDurationSeconds: number;
  plainTranscript: string;
  turnTranscript: SIPTranscriptTurn[];
  qualityAnalysis?: SIPQualityAnalysis;
}): Record<string, unknown> {
  const transcriptTurns = mapCampaignTestTranscriptTurns(options.turnTranscript);
  const detectedIssues = (options.qualityAnalysis?.issues || [])
    .filter((issue) => issue?.type && issue?.description)
    .map((issue) => ({
      type: String(issue.type),
      severity: issue.severity || 'medium',
      description: String(issue.description),
      suggestion: issue.recommendation ? String(issue.recommendation) : undefined,
    }));
  const promptImprovementSuggestions = (options.qualityAnalysis?.promptUpdates || [])
    .filter((update) => update?.change && update?.rationale)
    .map((update) => ({
      category: update.category || 'other',
      currentBehavior: '',
      suggestedChange: String(update.change),
      expectedImprovement: String(update.rationale),
      priority: update.priority || 'medium',
    }));

  const update: Record<string, unknown> = {
    status: 'completed',
    endedAt: new Date(),
    durationSeconds: options.callDurationSeconds,
    disposition: options.disposition,
    updatedAt: new Date(),
  };

  if (options.callSessionId) {
    update.callSessionId = options.callSessionId;
  }
  if (options.plainTranscript) {
    update.fullTranscript = options.plainTranscript;
  }
  if (transcriptTurns.length > 0) {
    update.transcriptTurns = transcriptTurns;
  }
  if (options.qualityAnalysis?.summary) {
    update.callSummary = options.qualityAnalysis.summary;
  }
  if (detectedIssues.length > 0) {
    update.detectedIssues = detectedIssues;
  }
  if (promptImprovementSuggestions.length > 0) {
    update.promptImprovementSuggestions = promptImprovementSuggestions;
  }

  return update;
}

export async function processSIPPostCallAnalysis(data: SIPPostCallData): Promise<void> {
  try {
    console.log(`${LOG_PREFIX} Starting post-call analysis for call attempt ${data.callAttemptId}`);
    const campaignTestCallId = extractCampaignTestCallId(data.callAttemptId);
    const previewSessionId = data.previewSessionId || null;

    const plainTranscript = data.turnTranscript
      .map((turn) => `${turn.speaker === 'agent' ? 'Agent' : 'Contact'}: ${String(turn.text || '').trim()}`)
      .filter((line) => !line.endsWith(':'))
      .join('\n')
      .trim();
    const previewTranscriptRows = previewSessionId
      ? buildPreviewTranscriptRows(previewSessionId, data.turnTranscript)
      : [];

    if (!plainTranscript) {
      console.log(`${LOG_PREFIX} No transcript content - creating synthetic callSession without transcript for ${data.callAttemptId}`);
    }

    let callSessionId: string | null = null;
    let contactId: string | null = null;
    let resolvedCampaignId: string | null = data.campaignId || null;
    let callControlId: string | null = data.providerCallId || null;
    let previewSessionMetadata: Record<string, unknown> | null = null;
    let previewSessionPhoneNumber: string | null = null;
    let previewSessionStartedAt: Date | null = null;
    let hasPersistedAttempt = false;

    if (previewSessionId) {
      try {
        const [previewSession] = await db
          .select({
            id: previewStudioSessions.id,
            campaignId: previewStudioSessions.campaignId,
            contactId: previewStudioSessions.contactId,
            createdAt: previewStudioSessions.createdAt,
            metadata: previewStudioSessions.metadata,
          })
          .from(previewStudioSessions)
          .where(eq(previewStudioSessions.id, previewSessionId))
          .limit(1);

        if (previewSession) {
          previewSessionMetadata = (previewSession.metadata as Record<string, unknown>) || {};
          previewSessionPhoneNumber = typeof previewSessionMetadata.testPhoneNumber === 'string'
            ? previewSessionMetadata.testPhoneNumber
            : null;
          previewSessionStartedAt = previewSession.createdAt || null;
          contactId = previewSession.contactId || null;
          resolvedCampaignId = resolvedCampaignId || previewSession.campaignId || null;
          callControlId = callControlId || (typeof previewSessionMetadata.callControlId === 'string' ? previewSessionMetadata.callControlId : null);
        }
      } catch (previewLookupErr) {
        console.warn(`${LOG_PREFIX} Failed to load preview session ${previewSessionId}:`, previewLookupErr);
      }
    }

    try {
      const [attempt] = await db
        .select({
          callSessionId: dialerCallAttempts.callSessionId,
          campaignId: dialerCallAttempts.campaignId,
          phoneDialed: dialerCallAttempts.phoneDialed,
          contactId: dialerCallAttempts.contactId,
          callStartedAt: dialerCallAttempts.callStartedAt,
          telnyxCallId: dialerCallAttempts.telnyxCallId,
        })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, data.callAttemptId))
        .limit(1);

      hasPersistedAttempt = !!attempt;
      contactId = attempt?.contactId || contactId || null;
      resolvedCampaignId = attempt?.campaignId || resolvedCampaignId || null;
      callControlId = attempt?.telnyxCallId || callControlId || null;

      if (attempt?.callSessionId) {
        callSessionId = attempt.callSessionId;

        await db
          .update(callSessions)
          .set({
            telnyxCallId: callControlId,
            campaignId: resolvedCampaignId,
            contactId,
            endedAt: new Date(),
            durationSec: data.callDurationSeconds,
            aiDisposition: data.disposition,
            ...(plainTranscript ? { aiTranscript: plainTranscript } : {}),
          } as any)
          .where(eq(callSessions.id, callSessionId));
      } else {
        const [session] = await db
          .insert(callSessions)
          .values({
            telnyxCallId: callControlId,
            providerCallId: callControlId,
            toNumberE164: attempt?.phoneDialed || previewSessionPhoneNumber || 'unknown',
            fromNumber: 'sip',
            status: 'completed',
            agentType: 'ai',
            campaignId: resolvedCampaignId,
            contactId,
            startedAt: attempt?.callStartedAt || previewSessionStartedAt || new Date(),
            endedAt: new Date(),
            durationSec: data.callDurationSeconds,
            aiTranscript: plainTranscript || null,
            aiDisposition: data.disposition,
          })
          .returning({ id: callSessions.id });

        callSessionId = session?.id || null;
      }

      const attemptUpdate: Record<string, unknown> = {
        callSessionId,
        updatedAt: new Date(),
      };
      if (plainTranscript) {
        attemptUpdate.fullTranscript = plainTranscript;
      }

      await db
        .update(dialerCallAttempts)
        .set(attemptUpdate as any)
        .where(eq(dialerCallAttempts.id, data.callAttemptId));

      if (callSessionId) {
        console.log(`${LOG_PREFIX} Linked SIP call ${data.callAttemptId} to synthetic callSession ${callSessionId}`);
      } else {
        console.warn(`${LOG_PREFIX} Synthetic callSession insert returned no id for ${data.callAttemptId}`);
      }
    } catch (sessionErr) {
      console.warn(`${LOG_PREFIX} Failed to create synthetic callSession from attempt row:`, sessionErr);
    }

    if (!callSessionId) {
      try {
        const [session] = await db
          .insert(callSessions)
          .values({
            telnyxCallId: callControlId,
            providerCallId: callControlId,
            toNumberE164: previewSessionPhoneNumber || 'unknown',
            fromNumber: 'sip',
            status: 'completed',
            agentType: 'ai',
            campaignId: resolvedCampaignId,
            contactId,
            startedAt: previewSessionStartedAt || new Date(),
            endedAt: new Date(),
            durationSec: data.callDurationSeconds,
            aiTranscript: plainTranscript || null,
            aiDisposition: data.disposition,
          })
          .returning({ id: callSessions.id });

        callSessionId = session?.id || null;
      } catch (fallbackSessionErr) {
        console.warn(`${LOG_PREFIX} Failed to create fallback synthetic callSession:`, fallbackSessionErr);
      }
    }

    if (previewSessionId) {
      try {
        await db
          .delete(previewSimulationTranscripts)
          .where(eq(previewSimulationTranscripts.sessionId, previewSessionId));

        if (previewTranscriptRows.length > 0) {
          await db
            .insert(previewSimulationTranscripts)
            .values(previewTranscriptRows as any);
        }
      } catch (previewTranscriptErr) {
        console.warn(`${LOG_PREFIX} Failed to persist preview SIP transcripts:`, previewTranscriptErr);
      }
    }

    if (campaignTestCallId) {
      try {
        await db
          .update(campaignTestCalls)
          .set(
            buildCampaignTestCallUpdate({
              callSessionId,
              disposition: data.disposition,
              callDurationSeconds: data.callDurationSeconds,
              plainTranscript,
              turnTranscript: data.turnTranscript,
            }) as any
          )
          .where(eq(campaignTestCalls.id, campaignTestCallId));
      } catch (testCallUpdateErr) {
        console.warn(`${LOG_PREFIX} Failed to save SIP test-call transcript payload:`, testCallUpdateErr);
      }
    }

    if (plainTranscript) {
      try {
      let leadId = data.leadId;

      if (!leadId && hasPersistedAttempt) {
        const [leadByAttempt] = await db
          .select({ id: leads.id })
          .from(leads)
          .where(eq(leads.callAttemptId, data.callAttemptId))
          .limit(1);
        leadId = leadByAttempt?.id;
      }

      if (leadId) {
        await db
          .update(leads)
          .set({
            transcript: plainTranscript,
            updatedAt: new Date(),
          })
          .where(eq(leads.id, leadId));

        console.log(`${LOG_PREFIX} Saved transcript to lead ${leadId}`);
      }
      } catch (leadErr) {
        console.warn(`${LOG_PREFIX} Failed to update lead transcript:`, leadErr);
      }
    }

    let previewQualityAnalysis: SIPQualityAnalysis = null;
    if (callSessionId && plainTranscript) {
      const { runPostCallAnalysis } = await import('../post-call-analyzer');
      const result = await runPostCallAnalysis(callSessionId, {
        callAttemptId: hasPersistedAttempt ? data.callAttemptId : undefined,
        campaignId: resolvedCampaignId || undefined,
        contactId: contactId || undefined,
        callDurationSec: data.callDurationSeconds,
        disposition: data.disposition,
        geminiTranscript: plainTranscript,
      });

      if (result.success) {
        previewQualityAnalysis = result.qualityAnalysis;
        console.log(`${LOG_PREFIX} Full post-call analysis complete for ${data.callAttemptId} (via unified pipeline)`);
        if (campaignTestCallId) {
          try {
            await db
              .update(campaignTestCalls)
              .set(
                buildCampaignTestCallUpdate({
                  callSessionId,
                  disposition: data.disposition,
                  callDurationSeconds: data.callDurationSeconds,
                  plainTranscript,
                  turnTranscript: data.turnTranscript,
                  qualityAnalysis: result.qualityAnalysis,
                }) as any
              )
              .where(eq(campaignTestCalls.id, campaignTestCallId));
          } catch (testCallAnalysisErr) {
            console.warn(`${LOG_PREFIX} Failed to save SIP test-call analysis payload:`, testCallAnalysisErr);
          }
        }
      } else {
        console.warn(`${LOG_PREFIX} Post-call analysis returned: ${result.error || 'unknown error'}`);
      }
    } else if (callSessionId) {
      console.log(`${LOG_PREFIX} Created callSession ${callSessionId} without transcript; waiting for recording/transcription fallback`);
    } else {
      console.warn(`${LOG_PREFIX} No callSession created - cannot run full post-call analysis for ${data.callAttemptId}`);
    }

    if (previewSessionId) {
      try {
        await db
          .update(previewStudioSessions)
          .set(
            buildPreviewSessionUpdate({
              existingMetadata: previewSessionMetadata,
              callSessionId,
              callControlId,
              disposition: data.disposition,
              callDurationSeconds: data.callDurationSeconds,
              transcriptTurnCount: previewTranscriptRows.length,
              qualityAnalysis: previewQualityAnalysis,
            }) as any
          )
          .where(eq(previewStudioSessions.id, previewSessionId));
      } catch (previewUpdateErr) {
        console.warn(`${LOG_PREFIX} Failed to save Preview Studio SIP post-call payload:`, previewUpdateErr);
      }
    }

    console.log(`${LOG_PREFIX} Post-call analysis complete for call attempt ${data.callAttemptId}`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error processing post-call analysis:`, error);
  }
}
