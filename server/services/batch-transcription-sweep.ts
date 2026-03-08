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
export async function sweepOrphanRecordingSessions(): Promise<SweepResult> {
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
        AND cs.created_at < ${gracePeriod}
        AND (cs.ai_transcript IS NULL OR LENGTH(cs.ai_transcript) < 20)
        AND NOT EXISTS (
          SELECT 1 FROM dialer_call_attempts ca WHERE ca.call_session_id = cs.id
        )
      ORDER BY cs.created_at DESC
      LIMIT ${SWEEP_BATCH_SIZE}
    `);

    const rows = (orphanSessions as any).rows || orphanSessions;
    if (!rows || rows.length === 0) return result;

    console.log(`${LOG_PREFIX} Found ${rows.length} orphan sessions with recordings to link`);

    for (const orphan of rows) {
      result.processed++;
      try {
        // Try to find matching attempt via campaign + contact + time window
        let attemptId: string | null = null;
        let attemptSessionId: string | null = null;

        if (orphan.campaign_id && orphan.contact_id) {
          const windowStart = new Date(new Date(orphan.started_at).getTime() - 120_000);
          const windowEnd = new Date(new Date(orphan.started_at).getTime() + 120_000);

          const [match] = await db
            .select({
              id: dialerCallAttempts.id,
              callSessionId: dialerCallAttempts.callSessionId,
              disposition: dialerCallAttempts.disposition,
              fullTranscript: dialerCallAttempts.fullTranscript,
            })
            .from(dialerCallAttempts)
            .where(
              and(
                eq(dialerCallAttempts.campaignId, orphan.campaign_id),
                eq(dialerCallAttempts.contactId, orphan.contact_id),
                sql`${dialerCallAttempts.createdAt} >= ${windowStart}`,
                sql`${dialerCallAttempts.createdAt} <= ${windowEnd}`,
              )
            )
            .limit(1);

          if (match) {
            attemptId = match.id;
            attemptSessionId = match.callSessionId;

            // Link the recording to the attempt's existing session if possible
            if (attemptSessionId) {
              // Copy recording URL to the linked session
              await db
                .update(callSessions)
                .set({
                  recordingUrl: orphan.recording_url,
                  recordingS3Key: orphan.recording_s3_key,
                  recordingDurationSec: orphan.duration_sec,
                  recordingStatus: 'stored',
                })
                .where(eq(callSessions.id, attemptSessionId));

              console.log(`${LOG_PREFIX} Linked orphan recording to existing session ${attemptSessionId} (attempt ${attemptId?.substring(0, 8)})`);
            } else {
              // Attempt has no session — link the orphan session directly
              await db
                .update(dialerCallAttempts)
                .set({ callSessionId: orphan.session_id, updatedAt: new Date() })
                .where(eq(dialerCallAttempts.id, attemptId));

              attemptSessionId = orphan.session_id;
              console.log(`${LOG_PREFIX} Linked orphan session ${orphan.session_id} to attempt ${attemptId?.substring(0, 8)}`);
            }

            // Now transcribe if missing
            const sessionToTranscribe = attemptSessionId || orphan.session_id;
            const recordingUrl = orphan.recording_url;

            if (recordingUrl && (!match.fullTranscript || match.fullTranscript.length < 20)) {
              try {
                const { transcribeRecording } = await import("./telnyx-transcription");
                const txResult = await transcribeRecording(recordingUrl);

                if (txResult.success && txResult.text.trim()) {
                  // Store on attempt
                  await db
                    .update(dialerCallAttempts)
                    .set({ fullTranscript: txResult.text, updatedAt: new Date() })
                    .where(eq(dialerCallAttempts.id, attemptId));

                  // Store on session
                  await db
                    .update(callSessions)
                    .set({ aiTranscript: txResult.text })
                    .where(eq(callSessions.id, sessionToTranscribe));

                  result.transcribed++;

                  // Run analysis
                  try {
                    const { runPostCallAnalysis } = await import("./post-call-analyzer");
                    const analysis = await runPostCallAnalysis(sessionToTranscribe, {
                      callAttemptId: attemptId,
                      campaignId: orphan.campaign_id || undefined,
                      contactId: orphan.contact_id || undefined,
                      callDurationSec: orphan.duration_sec || undefined,
                      disposition: (match.disposition || undefined) as string | undefined,
                      geminiTranscript: txResult.text,
                    });
                    if (analysis.success) result.analyzed++;
                  } catch (analysisErr: any) {
                    console.warn(`${LOG_PREFIX} Analysis error for orphan ${orphan.session_id}: ${analysisErr.message}`);
                  }
                }
              } catch (txErr: any) {
                console.warn(`${LOG_PREFIX} Transcription error for orphan ${orphan.session_id}: ${txErr.message}`);
                result.failed++;
              }
            } else {
              result.skipped++;
            }
          } else {
            result.skipped++;
          }
        } else {
          result.skipped++;
        }
      } catch (err: any) {
        console.warn(`${LOG_PREFIX} Error processing orphan ${orphan.session_id}: ${err.message}`);
        result.failed++;
      }
    }

    if (result.transcribed > 0 || result.failed > 0) {
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
 * Mark stale ring-out call attempts as 'no_answer'.
 * These are calls where the phone rang but nobody picked up — they have
 * NULL disposition, connected=false, 0 duration, and no call_ended_at.
 * The orchestrator sometimes doesn't finalize these.
 */
export async function sweepStaleRingOuts(): Promise<{ marked: number }> {
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
          sql`${dialerCallAttempts.createdAt} < ${staleThreshold}`,
          gte(dialerCallAttempts.createdAt, lookbackDate),
        )
      )
      .returning({ id: dialerCallAttempts.id });

    if (updated.length > 0) {
      console.log(`${LOG_PREFIX} Ring-out sweep: marked ${updated.length} stale ring-outs as no_answer`);
    }

    return { marked: updated.length };
  } catch (error) {
    console.error(`${LOG_PREFIX} Ring-out sweep error:`, error);
    return { marked: 0 };
  }
}