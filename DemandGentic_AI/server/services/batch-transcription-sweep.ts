/**
 * Batch Transcription Sweep
 *
 * Automatic background job that finds calls with a callSession recording
 * (GCS or Telnyx) but no transcript, and processes them through the
 * transcription + post-call analysis pipeline.
 *
 * This is the safety net for calls that fell through all other pipelines:
 * - Server restarts (in-memory retry timers lost)
 * - Expired Telnyx URLs (recording arrived but transcription failed)
 * - Recording upload delays beyond the 18-min retry window
 * - Any other edge case that left a call untranscribed
 *
 * Runs every 30 minutes via background-jobs.ts.
 * Processes up to 20 calls per sweep with concurrency of 3 to avoid overloading.
 */

import { db } from "../db";
import {
  dialerCallAttempts,
  callSessions,
  leads,
} from "@shared/schema";
import { eq, and, sql, gte, isNull } from "drizzle-orm";

const LOG_PREFIX = "[BatchTranscriptionSweep]";
const SWEEP_BATCH_SIZE = 20;
const SWEEP_CONCURRENCY = 3;
const MIN_CALL_DURATION_SEC = 20;
// Only look back 7 days — older calls likely have permanently expired recordings
const LOOKBACK_DAYS = 7;

export interface SweepResult {
  processed: number;
  transcribed: number;
  analyzed: number;
  failed: number;
  skipped: number;
}

/**
 * Find and process untranscribed calls that have recordings available.
 * Called by the background job scheduler every 30 minutes.
 */
export async function sweepUntranscribedCalls(): Promise {
  const result: SweepResult = { processed: 0, transcribed: 0, analyzed: 0, failed: 0, skipped: 0 };

  try {
    const lookbackDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    // Grace period: don't process calls from last 5 minutes (let normal pipeline handle them)
    const gracePeriod = new Date(Date.now() - 5 * 60 * 1000);

    const untranscribedCalls = await db
      .select({
        callAttemptId: dialerCallAttempts.id,
        callSessionId: dialerCallAttempts.callSessionId,
        campaignId: dialerCallAttempts.campaignId,
        contactId: dialerCallAttempts.contactId,
        duration: dialerCallAttempts.callDurationSeconds,
        disposition: dialerCallAttempts.disposition,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
      })
      .from(dialerCallAttempts)
      .innerJoin(callSessions, eq(callSessions.id, dialerCallAttempts.callSessionId))
      .where(
        and(
          sql`${dialerCallAttempts.callDurationSeconds} >= ${MIN_CALL_DURATION_SEC}`,
          // No transcript or very short (error markers)
          sql`(${dialerCallAttempts.fullTranscript} IS NULL OR LENGTH(${dialerCallAttempts.fullTranscript})  processOneCall(call))
      );

      for (const batchResult of batchResults) {
        result.processed++;
        if (batchResult.status === "fulfilled") {
          if (batchResult.value.transcribed) result.transcribed++;
          if (batchResult.value.analyzed) result.analyzed++;
          if (batchResult.value.skipped) result.skipped++;
          if (!batchResult.value.transcribed && !batchResult.value.skipped) result.failed++;
        } else {
          result.failed++;
        }
      }
    }

    if (result.transcribed > 0 || result.failed > 0) {
      console.log(
        `${LOG_PREFIX} Sweep complete: ${result.transcribed} transcribed, ${result.analyzed} analyzed, ${result.failed} failed, ${result.skipped} skipped`
      );
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Sweep error:`, error);
  }

  return result;
}

/**
 * Find and run post-call analysis on calls that have transcripts but no ai_analysis.
 * This catches calls recovered by external scripts (e.g. recover-needs-review.mjs)
 * that were transcribed but never went through the full analysis pipeline.
 */
export async function sweepUnanalyzedCalls(): Promise {
  const result: SweepResult = { processed: 0, transcribed: 0, analyzed: 0, failed: 0, skipped: 0 };

  try {
    const unanalyzedCalls = await db
      .select({
        callAttemptId: dialerCallAttempts.id,
        callSessionId: dialerCallAttempts.callSessionId,
        campaignId: dialerCallAttempts.campaignId,
        contactId: dialerCallAttempts.contactId,
        duration: dialerCallAttempts.callDurationSeconds,
        disposition: dialerCallAttempts.disposition,
        transcript: callSessions.aiTranscript,
        recordingUrl: callSessions.recordingUrl,
      })
      .from(dialerCallAttempts)
      .innerJoin(callSessions, eq(callSessions.id, dialerCallAttempts.callSessionId))
      .where(
        and(
          sql`${dialerCallAttempts.callDurationSeconds} >= ${MIN_CALL_DURATION_SEC}`,
          // Has a transcript
          sql`${callSessions.aiTranscript} IS NOT NULL AND LENGTH(${callSessions.aiTranscript}) >= 30`,
          // No analysis yet
          sql`${callSessions.aiAnalysis} IS NULL`,
          // Not already completed (prevent re-processing)
          sql`(${callSessions.analysisStatus} IS NULL OR ${callSessions.analysisStatus} NOT IN ('completed', 'processing'))`,
          // Has a recording (needed for Deepgram turn-by-turn)
          sql`(${callSessions.recordingUrl} IS NOT NULL OR ${callSessions.recordingS3Key} IS NOT NULL)`,
        )
      )
      .orderBy(sql`${dialerCallAttempts.createdAt} DESC`)
      .limit(SWEEP_BATCH_SIZE);

    if (unanalyzedCalls.length === 0) {
      return result;
    }

    console.log(`${LOG_PREFIX} Found ${unanalyzedCalls.length} transcribed-but-unanalyzed calls to process`);

    for (let i = 0; i  {
          if (!call.callSessionId || !call.transcript) return { analyzed: false };
          try {
            const { runPostCallAnalysis } = await import("./post-call-analyzer");
            const analysisResult = await runPostCallAnalysis(call.callSessionId, {
              callAttemptId: call.callAttemptId,
              campaignId: call.campaignId || undefined,
              contactId: call.contactId || undefined,
              callDurationSec: call.duration || undefined,
              disposition: (call.disposition || undefined) as string | undefined,
              geminiTranscript: call.transcript,
            });
            return { analyzed: analysisResult.success };
          } catch (err: any) {
            console.warn(`${LOG_PREFIX} Analysis error for ${call.callAttemptId}: ${err.message}`);
            return { analyzed: false };
          }
        })
      );

      for (const batchResult of batchResults) {
        result.processed++;
        if (batchResult.status === "fulfilled" && batchResult.value.analyzed) {
          result.analyzed++;
        } else {
          result.failed++;
        }
      }
    }

    if (result.analyzed > 0 || result.failed > 0) {
      console.log(
        `${LOG_PREFIX} Analysis sweep complete: ${result.analyzed} analyzed, ${result.failed} failed out of ${result.processed}`
      );
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Analysis sweep error:`, error);
  }

  return result;
}

async function processOneCall(call: {
  callAttemptId: string;
  callSessionId: string | null;
  campaignId: string | null;
  contactId: string | null;
  duration: number | null;
  disposition: string | null;
  recordingUrl: string | null;
  recordingS3Key: string | null;
}): Promise {
  const { callAttemptId, callSessionId } = call;

  // Step 1: Resolve a valid recording URL
  let recordingUrl = call.recordingUrl;

  if (call.recordingS3Key) {
    try {
      const { getCallSessionRecordingUrl } = await import("./recording-storage");
      const gcsUrl = await getCallSessionRecordingUrl(callSessionId || callAttemptId);
      if (gcsUrl) recordingUrl = gcsUrl;
    } catch {
      // Fall through to original URL
    }
  }

  if (!recordingUrl) {
    try {
      const { getPlayableRecordingLink } = await import("./recording-link-resolver");
      const resolved = await getPlayableRecordingLink(callSessionId || callAttemptId);
      if (resolved?.url) recordingUrl = resolved.url;
    } catch {
      // No recording available
    }
  }

  if (!recordingUrl) {
    return { transcribed: false, analyzed: false, skipped: true };
  }

  // Step 2: Transcribe
  let transcriptText = "";
  try {
    const { transcribeRecording } = await import("./telnyx-transcription");
    const transcriptionResult = await transcribeRecording(recordingUrl);

    if (!transcriptionResult.success || !transcriptionResult.text.trim()) {
      return { transcribed: false, analyzed: false, skipped: false };
    }

    transcriptText = transcriptionResult.text;

    // Store transcript
    await db
      .update(dialerCallAttempts)
      .set({ fullTranscript: transcriptText, updatedAt: new Date() })
      .where(eq(dialerCallAttempts.id, callAttemptId));

    if (callSessionId) {
      await db
        .update(callSessions)
        .set({ aiTranscript: transcriptText })
        .where(eq(callSessions.id, callSessionId));
    }

    // Update linked lead
    try {
      const [leadRow] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.callAttemptId, callAttemptId))
        .limit(1);

      if (leadRow) {
        await db
          .update(leads)
          .set({ transcript: transcriptText, transcriptionStatus: "completed", updatedAt: new Date() })
          .where(eq(leads.id, leadRow.id));
      }
    } catch {
      // Non-critical
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Transcription error for ${callAttemptId}:`, err.message);
    return { transcribed: false, analyzed: false, skipped: false };
  }

  // Step 3: Run post-call analysis
  let analyzed = false;
  if (callSessionId && transcriptText) {
    try {
      const { runPostCallAnalysis } = await import("./post-call-analyzer");
      const analysisResult = await runPostCallAnalysis(callSessionId, {
        callAttemptId,
        campaignId: call.campaignId || undefined,
        contactId: call.contactId || undefined,
        callDurationSec: call.duration || undefined,
        disposition: (call.disposition || undefined) as string | undefined,
        geminiTranscript: transcriptText,
      });
      analyzed = analysisResult.success;
    } catch (err: any) {
      console.warn(`${LOG_PREFIX} Analysis error for ${callAttemptId}: ${err.message}`);
    }
  }

  return { transcribed: true, analyzed, skipped: false };
}

/**
 * Sweep for orphan call_sessions that have recordings but aren't linked to any
 * dialer_call_attempt via call_session_id. This happens with SIP calls where
 * the Telnyx recording sync creates a new session instead of updating the
 * existing linked one.
 *
 * Strategy: Find orphan sessions with recordings, try to match them to attempts
 * via campaign_id + contact_id + time window, then link them and queue for
 * transcription.
 */
export async function sweepOrphanRecordingSessions(): Promise {
  const result: SweepResult = { processed: 0, transcribed: 0, analyzed: 0, failed: 0, skipped: 0 };

  try {
    const lookbackDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const gracePeriod = new Date(Date.now() - 10 * 60 * 1000); // 10 min grace

    // Find orphan sessions: have recording, >20s, not linked to any attempt
    const orphanSessions = await db.execute(sql`
      SELECT cs.id as session_id, cs.recording_url, cs.recording_s3_key,
             cs.duration_sec, cs.campaign_id, cs.contact_id,
             cs.to_number_e164, cs.started_at
      FROM call_sessions cs
      WHERE cs.recording_url IS NOT NULL
        AND cs.duration_sec >= ${MIN_CALL_DURATION_SEC}
        AND cs.created_at >= ${lookbackDate}
        AND cs.created_at = ${windowStart}`,
                sql`${dialerCallAttempts.createdAt}  0 || result.failed > 0) {
      console.log(
        `${LOG_PREFIX} Orphan sweep: ${result.transcribed} transcribed, ${result.analyzed} analyzed, ${result.failed} failed, ${result.skipped} skipped out of ${result.processed}`
      );
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Orphan sweep error:`, error);
  }

  return result;
}

/**
 * Sweep call_sessions directly (without requiring dialer_call_attempts).
 * This catches bulk-imported calls or sessions where no attempt record was linked.
 */
export async function sweepCallSessionsDirect(): Promise {
  const result: SweepResult = { processed: 0, transcribed: 0, analyzed: 0, failed: 0, skipped: 0 };

  try {
    const lookbackDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const gracePeriod = new Date(Date.now() - 5 * 60 * 1000);

    const untranscribedSessions = await db
      .select({
        id: callSessions.id,
        campaignId: callSessions.campaignId,
        contactId: callSessions.contactId,
        durationSec: callSessions.durationSec,
        aiDisposition: callSessions.aiDisposition,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
      })
      .from(callSessions)
      .where(
        and(
          sql`${callSessions.durationSec} >= ${MIN_CALL_DURATION_SEC}`,
          sql`(${callSessions.aiTranscript} IS NULL OR LENGTH(${callSessions.aiTranscript})  {
          try {
            const { runPostCallAnalysis } = await import("./post-call-analyzer");
            const analysisResult = await runPostCallAnalysis(session.id, {
              campaignId: session.campaignId || undefined,
              contactId: session.contactId || undefined,
              callDurationSec: session.durationSec || undefined,
              disposition: session.aiDisposition || undefined,
            });
            return { transcribed: analysisResult.success && !analysisResult.skipped, analyzed: analysisResult.success };
          } catch (err: any) {
            console.error(`${LOG_PREFIX} [DirectSweep] Error processing session ${session.id}: ${err.message}`);
            return { transcribed: false, analyzed: false };
          }
        })
      );

      for (const batchResult of batchResults) {
        result.processed++;
        if (batchResult.status === "fulfilled") {
          if (batchResult.value.transcribed) result.transcribed++;
          if (batchResult.value.analyzed) result.analyzed++;
          if (!batchResult.value.transcribed) result.failed++;
        } else {
          result.failed++;
        }
      }
    }

    if (result.transcribed > 0 || result.failed > 0) {
      console.log(
        `${LOG_PREFIX} [DirectSweep] Complete: ${result.transcribed} transcribed, ${result.analyzed} analyzed, ${result.failed} failed out of ${result.processed}`
      );
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} [DirectSweep] Error:`, error);
  }

  return result;
}

/**
 * Mark stale ring-out call attempts as 'no_answer'.
 * These are calls where the phone rang but nobody picked up — they have
 * NULL disposition, connected=false, 0 duration, and no call_ended_at.
 * The orchestrator sometimes doesn't finalize these.
 */
export async function sweepStaleRingOuts(): Promise {
  try {
    // Only process calls older than 30 minutes (give normal pipeline time to finalize)
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000);
    // Don't go back more than 3 days
    const lookbackDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const updated = await db
      .update(dialerCallAttempts)
      .set({
        disposition: 'no_answer',
        dispositionProcessed: true,
        callEndedAt: sql`created_at`, // Use created_at as approximate end time
        updatedAt: new Date(),
      })
      .where(
        and(
          isNull(dialerCallAttempts.disposition),
          eq(dialerCallAttempts.connected, false),
          sql`${dialerCallAttempts.callDurationSeconds} = 0 OR ${dialerCallAttempts.callDurationSeconds} IS NULL`,
          sql`${dialerCallAttempts.createdAt}  0) {
      console.log(`${LOG_PREFIX} Ring-out sweep: marked ${updated.length} stale ring-outs as no_answer`);
    }

    return { marked: updated.length };
  } catch (error) {
    console.error(`${LOG_PREFIX} Ring-out sweep error:`, error);
    return { marked: 0 };
  }
}