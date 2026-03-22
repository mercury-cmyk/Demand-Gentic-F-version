/**
 * No-Call-Left-Behind Sweep
 *
 * Comprehensive catch-all recovery job that ensures EVERY call from the last 3 days
 * has been fully processed through: transcription → disposition → analysis.
 *
 * This is the final safety net that runs after all other recovery jobs.
 * It finds calls that slipped through every other pipeline — regardless of
 * their current status — and enrolls them back into the full post-call pipeline.
 *
 * Three phases:
 *   Phase 1: Connected calls missing transcription (have recording, no transcript)
 *   Phase 2: Connected calls missing disposition (connected=true, NULL disposition)
 *   Phase 3: Calls with transcript but missing analysis (aiAnalysis IS NULL)
 *
 * Runs every 60 minutes via background-jobs.ts.
 * Also available as an admin API endpoint for manual trigger.
 */

import { db } from "../db";
import { dialerCallAttempts, callSessions } from "@shared/schema";
import { eq, and, sql, gte, isNull } from "drizzle-orm";

const LOG_PREFIX = "[NoCallLeftBehind]";
const LOOKBACK_DAYS = 3;
const BATCH_SIZE = 30; // Larger than other sweeps — this is the catch-all
const CONCURRENCY = 3;
const MIN_DURATION_SEC = 15; // Slightly lower threshold to catch borderline calls
// Grace period: don't touch calls from last 20 minutes (let normal pipeline finish)
const GRACE_PERIOD_MS = 20 * 60 * 1000;

export interface NoCallLeftBehindResult {
  phase1_untranscribed: { found: number; transcribed: number; failed: number };
  phase2_undispositioned: { found: number; dispositioned: number; failed: number };
  phase3_unanalyzed: { found: number; analyzed: number; failed: number };
  totalProcessed: number;
  totalRecovered: number;
}

/**
 * Run the full No-Call-Left-Behind sweep across all three phases.
 * Safe to call from background jobs or manual admin trigger.
 */
export async function runNoCallLeftBehindSweep(options?: {
  lookbackDays?: number;
  batchSize?: number;
  dryRun?: boolean;
}): Promise {
  const lookbackDays = options?.lookbackDays ?? LOOKBACK_DAYS;
  const batchSize = options?.batchSize ?? BATCH_SIZE;
  const dryRun = options?.dryRun ?? false;

  const lookbackDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const graceDate = new Date(Date.now() - GRACE_PERIOD_MS);

  const result: NoCallLeftBehindResult = {
    phase1_untranscribed: { found: 0, transcribed: 0, failed: 0 },
    phase2_undispositioned: { found: 0, dispositioned: 0, failed: 0 },
    phase3_unanalyzed: { found: 0, analyzed: 0, failed: 0 },
    totalProcessed: 0,
    totalRecovered: 0,
  };

  console.log(`${LOG_PREFIX} Starting sweep (lookback=${lookbackDays}d, batch=${batchSize}, dryRun=${dryRun})`);

  // ── Phase 1: Untranscribed connected calls ───────────────────────────
  try {
    await runPhase1Transcription(result, lookbackDate, graceDate, batchSize, dryRun);
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Phase 1 error:`, err.message);
  }

  // ── Phase 2: Undispositioned connected calls ─────────────────────────
  try {
    await runPhase2Disposition(result, lookbackDate, graceDate, batchSize, dryRun);
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Phase 2 error:`, err.message);
  }

  // ── Phase 3: Unanalyzed calls with transcripts ───────────────────────
  try {
    await runPhase3Analysis(result, lookbackDate, graceDate, batchSize, dryRun);
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Phase 3 error:`, err.message);
  }

  result.totalProcessed =
    result.phase1_untranscribed.found +
    result.phase2_undispositioned.found +
    result.phase3_unanalyzed.found;
  result.totalRecovered =
    result.phase1_untranscribed.transcribed +
    result.phase2_undispositioned.dispositioned +
    result.phase3_unanalyzed.analyzed;

  if (result.totalProcessed > 0) {
    console.log(
      `${LOG_PREFIX} Sweep complete: ` +
      `P1(transcription): ${result.phase1_untranscribed.transcribed}/${result.phase1_untranscribed.found} | ` +
      `P2(disposition): ${result.phase2_undispositioned.dispositioned}/${result.phase2_undispositioned.found} | ` +
      `P3(analysis): ${result.phase3_unanalyzed.analyzed}/${result.phase3_unanalyzed.found} | ` +
      `Total recovered: ${result.totalRecovered}/${result.totalProcessed}`
    );
  } else {
    console.log(`${LOG_PREFIX} Sweep complete — no missed calls found (all clear)`);
  }

  return result;
}

// ── Phase 1: Find connected calls that have a recording but no transcript ──

async function runPhase1Transcription(
  result: NoCallLeftBehindResult,
  lookbackDate: Date,
  graceDate: Date,
  batchSize: number,
  dryRun: boolean,
) {
  // Find attempts that are connected (or have duration > 0) with recording but no transcript
  const untranscribed = await db
    .select({
      attemptId: dialerCallAttempts.id,
      sessionId: dialerCallAttempts.callSessionId,
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
        // Connected or has meaningful duration
        sql`(${dialerCallAttempts.connected} = true OR COALESCE(${dialerCallAttempts.callDurationSeconds}, 0) >= ${MIN_DURATION_SEC})`,
        // Missing transcript
        sql`(${dialerCallAttempts.fullTranscript} IS NULL OR LENGTH(${dialerCallAttempts.fullTranscript})  {
        const sessionId = call.sessionId;
        if (!sessionId) return false;

        try {
          // Try full post-call analysis (handles recording resolution + transcription + analysis)
          const { runPostCallAnalysis } = await import("./post-call-analyzer");
          const analysisResult = await runPostCallAnalysis(sessionId, {
            callAttemptId: call.attemptId,
            campaignId: call.campaignId || undefined,
            contactId: call.contactId || undefined,
            callDurationSec: call.duration || undefined,
            disposition: (call.disposition || undefined) as string | undefined,
          });
          return analysisResult.success;
        } catch (err: any) {
          console.warn(`${LOG_PREFIX} [Phase 1] Failed for attempt ${call.attemptId?.substring(0, 8)}: ${err.message}`);
          return false;
        }
      })
    );

    for (const br of batchResults) {
      if (br.status === "fulfilled" && br.value) {
        result.phase1_untranscribed.transcribed++;
      } else {
        result.phase1_untranscribed.failed++;
      }
    }
  }
}

// ── Phase 2: Connected calls with NULL disposition ──────────────────────

async function runPhase2Disposition(
  result: NoCallLeftBehindResult,
  lookbackDate: Date,
  graceDate: Date,
  batchSize: number,
  dryRun: boolean,
) {
  // Find connected calls (duration >= threshold) that have NULL disposition
  // Exclude calls already marked as no_answer by ring-out sweep
  const undispositioned = await db
    .select({
      attemptId: dialerCallAttempts.id,
      sessionId: dialerCallAttempts.callSessionId,
      campaignId: dialerCallAttempts.campaignId,
      contactId: dialerCallAttempts.contactId,
      duration: dialerCallAttempts.callDurationSeconds,
      connected: dialerCallAttempts.connected,
      fullTranscript: dialerCallAttempts.fullTranscript,
      sessionTranscript: callSessions.aiTranscript,
      sessionAnalysis: callSessions.aiAnalysis,
      sessionDisposition: callSessions.aiDisposition,
    })
    .from(dialerCallAttempts)
    .leftJoin(callSessions, eq(callSessions.id, dialerCallAttempts.callSessionId))
    .where(
      and(
        isNull(dialerCallAttempts.disposition),
        // Must be a real connected call with meaningful duration
        eq(dialerCallAttempts.connected, true),
        sql`COALESCE(${dialerCallAttempts.callDurationSeconds}, 0) >= ${MIN_DURATION_SEC}`,
        // Within lookback window
        gte(dialerCallAttempts.createdAt, lookbackDate),
        sql`${dialerCallAttempts.createdAt} = 30)
          OR (${dialerCallAttempts.fullTranscript} IS NOT NULL AND LENGTH(${dialerCallAttempts.fullTranscript}) >= 30)
        )`,
        // No analysis on the session
        sql`${callSessions.aiAnalysis} IS NULL`,
        // Not currently being processed or already completed (avoid conflicts and re-processing)
        sql`(${callSessions.analysisStatus} IS NULL OR ${callSessions.analysisStatus} NOT IN ('processing', 'completed'))`,
        // Within lookback window
        gte(dialerCallAttempts.createdAt, lookbackDate),
        sql`${dialerCallAttempts.createdAt}  {
        if (!call.sessionId) return false;
        const transcript = call.transcript || call.attemptTranscript;

        try {
          const { runPostCallAnalysis } = await import("./post-call-analyzer");
          const analysisResult = await runPostCallAnalysis(call.sessionId, {
            callAttemptId: call.attemptId,
            campaignId: call.campaignId || undefined,
            contactId: call.contactId || undefined,
            callDurationSec: call.duration || undefined,
            disposition: (call.disposition || undefined) as string | undefined,
            geminiTranscript: transcript || undefined,
          });
          return analysisResult.success;
        } catch (err: any) {
          console.warn(`${LOG_PREFIX} [Phase 3] Failed for attempt ${call.attemptId?.substring(0, 8)}: ${err.message}`);
          return false;
        }
      })
    );

    for (const br of batchResults) {
      if (br.status === "fulfilled" && br.value) {
        result.phase3_unanalyzed.analyzed++;
      } else {
        result.phase3_unanalyzed.failed++;
      }
    }
  }
}

/**
 * Quick diagnostic: count how many calls from last N days are missing
 * transcription, disposition, or analysis — without processing them.
 */
export async function diagnoseCallGaps(lookbackDays?: number): Promise {
  const days = lookbackDays ?? LOOKBACK_DAYS;
  const lookbackDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [counts] = await db.execute(sql`
    SELECT
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (
        WHERE (dca.full_transcript IS NULL OR LENGTH(dca.full_transcript) = ${MIN_DURATION_SEC})
      ) AS untranscribed,
      COUNT(*) FILTER (
        WHERE dca.disposition IS NULL
          AND dca.connected = true
          AND COALESCE(dca.call_duration_seconds, 0) >= ${MIN_DURATION_SEC}
      ) AS undispositioned,
      COUNT(*) FILTER (
        WHERE cs.ai_analysis IS NULL
          AND (cs.ai_transcript IS NOT NULL AND LENGTH(cs.ai_transcript) >= 30
               OR dca.full_transcript IS NOT NULL AND LENGTH(dca.full_transcript) >= 30)
      ) AS unanalyzed
    FROM dialer_call_attempts dca
    LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE dca.created_at >= ${lookbackDate}
  `);

  const row = (counts as any)?.rows?.[0] || counts;

  return {
    totalCalls: Number(row?.total_calls ?? 0),
    untranscribed: Number(row?.untranscribed ?? 0),
    undispositioned: Number(row?.undispositioned ?? 0),
    unanalyzed: Number(row?.unanalyzed ?? 0),
    lookbackDays: days,
  };
}