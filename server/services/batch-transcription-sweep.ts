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
import { eq, and, sql, gte } from "drizzle-orm";

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
export async function sweepUntranscribedCalls(): Promise<SweepResult> {
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
          sql`(${dialerCallAttempts.fullTranscript} IS NULL OR LENGTH(${dialerCallAttempts.fullTranscript}) < 20)`,
          // Has a recording somewhere
          sql`(${callSessions.recordingUrl} IS NOT NULL OR ${callSessions.recordingS3Key} IS NOT NULL)`,
          // Within lookback window
          gte(dialerCallAttempts.createdAt, lookbackDate),
          // Past grace period
          sql`${dialerCallAttempts.createdAt} < ${gracePeriod}`,
        )
      )
      .orderBy(sql`${dialerCallAttempts.createdAt} DESC`)
      .limit(SWEEP_BATCH_SIZE);

    if (untranscribedCalls.length === 0) {
      return result;
    }

    console.log(`${LOG_PREFIX} Found ${untranscribedCalls.length} untranscribed calls to process`);

    // Process in batches with controlled concurrency
    for (let i = 0; i < untranscribedCalls.length; i += SWEEP_CONCURRENCY) {
      const batch = untranscribedCalls.slice(i, i + SWEEP_CONCURRENCY);

      const batchResults = await Promise.allSettled(
        batch.map((call) => processOneCall(call))
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
export async function sweepUnanalyzedCalls(): Promise<SweepResult> {
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

    for (let i = 0; i < unanalyzedCalls.length; i += SWEEP_CONCURRENCY) {
      const batch = unanalyzedCalls.slice(i, i + SWEEP_CONCURRENCY);

      const batchResults = await Promise.allSettled(
        batch.map(async (call) => {
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
}): Promise<{ transcribed: boolean; analyzed: boolean; skipped: boolean }> {
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