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
import {
  formatTranscriptTurns,
  normalizeTranscriptTurns,
  type StructuredTranscriptTurn,
} from '../transcript-structuring';

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

function mapCampaignTestTranscriptTurns(turns: SIPTranscriptTurn[]): Array {
  return normalizeTranscriptTurns(
    turns.map((turn) => ({
      role: turn.speaker,
      text: turn.text,
      timestamp: turn.timestamp,
    }))
  ).map((turn) => ({
    role: turn.role,
    text: turn.text,
    ...(turn.timestamp ? { timestamp: turn.timestamp } : {}),
  }));
}

type SIPQualityAnalysis = {
  summary?: string | null;
  overallScore?: number | null;
  issues?: Array;
  promptUpdates?: Array;
  dispositionReview?: Record | null;
} | null;

function buildPreviewTranscriptRows(sessionId: string, turns: SIPTranscriptTurn[]): Array;
}> {
  const cleanedTurns = normalizeTranscriptTurns(
    turns.map((turn) => ({
      role: turn.speaker,
      text: turn.text,
      timestamp: turn.timestamp,
    }))
  ).map((turn, index) => ({
    role: turn.role,
    text: turn.text,
    timestampMs: turn.timestamp ? Date.parse(turn.timestamp) : undefined,
    index,
  }));

  if (cleanedTurns.length === 0) {
    return [];
  }

  const baseTimestamp = cleanedTurns.find((turn) => typeof turn.timestampMs === 'number')?.timestampMs;

  return cleanedTurns.map((turn) => ({
    sessionId,
    role: turn.role === 'agent' ? 'assistant' : 'user',
    content: turn.text,
    timestampMs:
      typeof turn.timestampMs === 'number' && typeof baseTimestamp === 'number'
        ? Math.max(0, Math.round(turn.timestampMs - baseTimestamp))
        : turn.index * 1000,
    metadata: {
      source: 'sip_post_call_handler',
      speaker: turn.role,
    },
  }));
}

function normalizeSipTurns(turns: SIPTranscriptTurn[]): StructuredTranscriptTurn[] {
  return normalizeTranscriptTurns(
    turns.map((turn) => ({
      role: turn.speaker,
      text: turn.text,
      timestamp: turn.timestamp,
    }))
  );
}

function mapStructuredTurnsToSipTurns(turns: StructuredTranscriptTurn[]): SIPTranscriptTurn[] {
  return turns.map((turn) => ({
    speaker: turn.role,
    text: turn.text,
    timestamp: turn.timestamp ? Date.parse(turn.timestamp) : undefined,
  }));
}

function buildProvisionalAiAnalysis(turns: StructuredTranscriptTurn[]): Record {
  return {
    transcriptLifecycle: {
      status: 'provisional',
      source: 'sip_media_bridge_live',
      needsRecordingTranscription: true,
      structuredTurnCount: turns.length,
      updatedAt: new Date().toISOString(),
    },
    provisionalTranscript: {
      generatedAt: new Date().toISOString(),
      turnCount: turns.length,
      turns: turns.map((turn) => ({
        role: turn.role,
        text: turn.text,
        timestamp: turn.timestamp,
        timeOffsetSec: turn.timeOffsetSec,
        startSec: turn.startSec,
        endSec: turn.endSec,
      })),
    },
  };
}

export function buildPreviewSessionUpdate(options: {
  existingMetadata?: Record | null;
  callSessionId: string | null;
  callControlId?: string | null;
  disposition: string;
  callDurationSeconds: number;
  transcriptTurnCount: number;
  qualityAnalysis?: SIPQualityAnalysis;
}): Record {
  const generatedAt = new Date().toISOString();
  const metadata = {
    ...((options.existingMetadata as Record) || {}),
    callEngine: 'sip',
    finalDisposition: options.disposition,
    postCallAnalysisTranscriptCount: options.transcriptTurnCount,
    postCallReadyAt: generatedAt,
  } as Record;

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
}): Record {
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

  const update: Record = {
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

export async function processSIPPostCallAnalysis(data: SIPPostCallData): Promise {
  try {
    console.log(`${LOG_PREFIX} Starting post-call analysis for call attempt ${data.callAttemptId}`);
    const campaignTestCallId = extractCampaignTestCallId(data.callAttemptId);
    const previewSessionId = data.previewSessionId || null;
    const normalizedTurns = normalizeSipTurns(data.turnTranscript);
    const normalizedSipTurns = mapStructuredTurnsToSipTurns(normalizedTurns);

    const plainTranscript = formatTranscriptTurns(normalizedTurns);
    const previewTranscriptRows = previewSessionId
      ? buildPreviewTranscriptRows(previewSessionId, normalizedSipTurns)
      : [];
    const provisionalAiAnalysis = buildProvisionalAiAnalysis(normalizedTurns);

    if (!plainTranscript) {
      console.log(`${LOG_PREFIX} No transcript content - creating synthetic callSession without transcript for ${data.callAttemptId}`);
    }

    let callSessionId: string | null = null;
    let contactId: string | null = null;
    let resolvedCampaignId: string | null = data.campaignId || null;
    let callControlId: string | null = data.providerCallId || null;
    let previewSessionMetadata: Record | null = null;
    let previewSessionPhoneNumber: string | null = null;
    let previewSessionStartedAt: Date | null = null;
    let hasPersistedAttempt = false;
    const shouldAwaitRecordingBasedTranscription = normalizedTurns.length > 0 && !campaignTestCallId && !previewSessionId;

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
          previewSessionMetadata = (previewSession.metadata as Record) || {};
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
        const [existingSession] = await db
          .select({ aiAnalysis: callSessions.aiAnalysis })
          .from(callSessions)
          .where(eq(callSessions.id, callSessionId))
          .limit(1);
        const existingAiAnalysis = (existingSession?.aiAnalysis as Record | null) || {};
        const nextAiAnalysis = {
          ...existingAiAnalysis,
          ...provisionalAiAnalysis,
          transcriptLifecycle: {
            ...(((existingAiAnalysis as any).transcriptLifecycle as Record | undefined) || {}),
            ...((provisionalAiAnalysis.transcriptLifecycle as Record) || {}),
          },
        };

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
            aiAnalysis: nextAiAnalysis as any,
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
            aiAnalysis: provisionalAiAnalysis as any,
            aiDisposition: data.disposition,
          })
          .returning({ id: callSessions.id });

        callSessionId = session?.id || null;
      }

      const attemptUpdate: Record = {
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
            aiAnalysis: provisionalAiAnalysis as any,
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
              turnTranscript: normalizedSipTurns,
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
    if (callSessionId && plainTranscript && !shouldAwaitRecordingBasedTranscription) {
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
                  turnTranscript: normalizedSipTurns,
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
    } else if (shouldAwaitRecordingBasedTranscription) {
      console.log(`${LOG_PREFIX} Stored provisional SIP transcript for ${data.callAttemptId}; waiting for recording-based transcription to finalize turn detection`);
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