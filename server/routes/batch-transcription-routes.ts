/**
 * Batch Transcription & Reanalysis Routes
 *
 * High-throughput endpoint for transcribing untranscribed calls and feeding
 * them into the post-call analysis pipeline. Processes calls in parallel
 * with configurable concurrency, progress tracking, and smart recording
 * URL resolution.
 */

import { Router } from "express";
import { db } from "../db";
import {
  dialerCallAttempts,
  callSessions,
  leads,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();
const LOG_PREFIX = "[BatchTranscription]";

// In-memory job tracking
interface BatchJob {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  total: number;
  transcribed: number;
  analyzed: number;
  failed: number;
  skipped: number;
  errors: Array<{ callAttemptId: string; error: string }>;
  currentBatch: number;
  totalBatches: number;
}

const activeJobs = new Map<string, BatchJob>();
const CALL_ORDER_BY = sql`COALESCE(${dialerCallAttempts.callStartedAt}, ${dialerCallAttempts.createdAt}) DESC`;

/**
 * POST /api/batch-transcription/preview
 * Dry-run: shows how many calls need transcription without processing them.
 */
router.post("/preview", requireAuth, async (req, res) => {
  try {
    const {
      campaignId,
      minDurationSec = 20,
      dateFrom,
      dateTo,
      includeFailedTranscriptions = true,
      limit = 1000,
    } = req.body;

    const calls = await getCallsToProcess({
      campaignId,
      minDurationSec,
      dateFrom,
      dateTo,
      includeFailedTranscriptions,
      limit,
    });

    // Group by campaign for overview
    const byCampaign: Record<string, number> = {};
    const byDisposition: Record<string, number> = {};
    for (const call of calls) {
      byCampaign[call.campaignId || "unknown"] = (byCampaign[call.campaignId || "unknown"] || 0) + 1;
      byDisposition[call.disposition || "unknown"] = (byDisposition[call.disposition || "unknown"] || 0) + 1;
    }

    res.json({
      success: true,
      count: calls.length,
      byCampaign,
      byDisposition,
      sample: calls.slice(0, 10).map((c) => ({
        callAttemptId: c.callAttemptId,
        duration: c.duration,
        disposition: c.disposition,
        hasRecording: c.hasAttemptRecordingUrl || c.hasSessionRecordingUrl || c.hasS3Key,
        createdAt: c.createdAt,
      })),
    });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Preview error:`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/batch-transcription/run
 * Execute batch transcription + analysis. Non-blocking — returns a jobId immediately.
 * Poll /api/batch-transcription/job/:jobId for progress.
 */
router.post("/run", requireAuth, async (req, res) => {
  try {
    const {
      campaignId,
      minDurationSec = 20,
      dateFrom,
      dateTo,
      includeFailedTranscriptions = true,
      limit = 500,
      concurrency = 5,
      skipAnalysis = false,
    } = req.body;

    // Check for existing running job
    for (const [, job] of activeJobs) {
      if (job.status === "running") {
        return res.status(409).json({
          error: "A batch job is already running",
          jobId: job.id,
          progress: `${job.transcribed + job.failed + job.skipped}/${job.total}`,
        });
      }
    }

    const calls = await getCallsToProcess({
      campaignId,
      minDurationSec,
      dateFrom,
      dateTo,
      includeFailedTranscriptions,
      limit,
    });

    if (calls.length === 0) {
      return res.json({ success: true, message: "No calls need transcription", count: 0 });
    }

    // Create job
    const jobId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const batchSize = concurrency;
    const job: BatchJob = {
      id: jobId,
      status: "running",
      startedAt: new Date(),
      total: calls.length,
      transcribed: 0,
      analyzed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      currentBatch: 0,
      totalBatches: Math.ceil(calls.length / batchSize),
    };
    activeJobs.set(jobId, job);

    // Clean up old jobs (keep last 10)
    const jobIds = Array.from(activeJobs.keys());
    if (jobIds.length > 10) {
      for (const oldId of jobIds.slice(0, jobIds.length - 10)) {
        activeJobs.delete(oldId);
      }
    }

    console.log(`${LOG_PREFIX} Starting batch job ${jobId}: ${calls.length} calls, concurrency=${batchSize}, skipAnalysis=${skipAnalysis}`);

    // Process in background
    void processBatchJob(job, calls, batchSize, skipAnalysis);

    res.json({
      success: true,
      jobId,
      total: calls.length,
      message: `Batch job started. Poll GET /api/batch-transcription/job/${jobId} for progress.`,
    });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Run error:`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/batch-transcription/job/:jobId
 * Get progress of a batch job.
 */
router.get("/job/:jobId", requireAuth, async (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  const elapsed = Date.now() - job.startedAt.getTime();
  const processed = job.transcribed + job.failed + job.skipped;
  const ratePerSec = processed > 0 ? (processed / (elapsed / 1000)).toFixed(2) : "0";
  const etaMs = processed > 0 ? ((job.total - processed) / (processed / elapsed)) : 0;

  res.json({
    ...job,
    processed,
    elapsedMs: elapsed,
    ratePerSec,
    etaMs: Math.round(etaMs),
    etaHuman: etaMs > 0 ? formatDuration(etaMs) : "calculating...",
    recentErrors: job.errors.slice(-5),
  });
});

/**
 * GET /api/batch-transcription/jobs
 * List all batch jobs.
 */
router.get("/jobs", requireAuth, async (_req, res) => {
  const jobs = Array.from(activeJobs.values()).map((j) => ({
    id: j.id,
    status: j.status,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    total: j.total,
    transcribed: j.transcribed,
    analyzed: j.analyzed,
    failed: j.failed,
    skipped: j.skipped,
  }));
  res.json({ jobs });
});

/**
 * POST /api/batch-transcription/sweep-orphans
 * Manually trigger the orphan recording session sweep.
 * Finds call_sessions with recordings but not linked to any dialer_call_attempt,
 * matches them to attempts, and transcribes + analyzes.
 */
router.post("/sweep-orphans", requireAuth, async (_req, res) => {
  try {
    const { sweepOrphanRecordingSessions } = await import("../services/batch-transcription-sweep");
    const result = await sweepOrphanRecordingSessions();
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Orphan sweep error:`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/batch-transcription/sweep-ringouts
 * Manually trigger the stale ring-out cleanup.
 * Marks 0-duration, non-connected calls with NULL disposition as no_answer.
 */
router.post("/sweep-ringouts", requireAuth, async (_req, res) => {
  try {
    const { sweepStaleRingOuts } = await import("../services/batch-transcription-sweep");
    const result = await sweepStaleRingOuts();
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Ring-out sweep error:`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/batch-transcription/sweep-sessions
 * Manually trigger direct call_sessions transcription sweep.
 * Processes sessions with recordings but no transcript, even without dialer_call_attempts.
 */
router.post("/sweep-sessions", requireAuth, async (_req, res) => {
  try {
    const { sweepCallSessionsDirect } = await import("../services/batch-transcription-sweep");
    const result = await sweepCallSessionsDirect();
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Direct session sweep error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== BATCH PROCESSING ENGINE ====================

interface CallToProcess {
  callAttemptId: string;
  callSessionId: string | null;
  campaignId: string | null;
  contactId: string | null;
  duration: number | null;
  disposition: string | null;
  recordingUrl: string | null;
  recordingS3Key: string | null;
}

interface CallToPreview extends CallToProcess {
  hasAttemptRecordingUrl: boolean;
  hasSessionRecordingUrl: boolean;
  hasS3Key: boolean;
  createdAt: Date;
}

async function processBatchJob(
  job: BatchJob,
  calls: CallToProcess[],
  concurrency: number,
  skipAnalysis: boolean
): Promise<void> {
  try {
    // Process in batches with controlled concurrency
    for (let i = 0; i < calls.length; i += concurrency) {
      job.currentBatch = Math.floor(i / concurrency) + 1;
      const batch = calls.slice(i, i + concurrency);

      const results = await Promise.allSettled(
        batch.map((call) => processOneCall(call, skipAnalysis))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const call = batch[j];

        if (result.status === "fulfilled") {
          if (result.value.transcribed) job.transcribed++;
          if (result.value.analyzed) job.analyzed++;
          if (result.value.skipped) job.skipped++;
        } else {
          job.failed++;
          job.errors.push({
            callAttemptId: call.callAttemptId,
            error: result.reason?.message || "Unknown error",
          });
        }
      }

      // Log progress every batch
      const processed = job.transcribed + job.failed + job.skipped;
      console.log(
        `${LOG_PREFIX} [${job.id}] Batch ${job.currentBatch}/${job.totalBatches} | ${processed}/${job.total} processed | ${job.transcribed} transcribed, ${job.analyzed} analyzed, ${job.failed} failed, ${job.skipped} skipped`
      );
    }

    job.status = "completed";
    job.completedAt = new Date();
    const elapsed = job.completedAt.getTime() - job.startedAt.getTime();
    console.log(
      `${LOG_PREFIX} Job ${job.id} completed in ${formatDuration(elapsed)} | ${job.transcribed} transcribed, ${job.analyzed} analyzed, ${job.failed} failed, ${job.skipped} skipped`
    );
  } catch (error: any) {
    job.status = "failed";
    job.completedAt = new Date();
    console.error(`${LOG_PREFIX} Job ${job.id} failed:`, error);
  }
}

async function processOneCall(
  call: CallToProcess,
  skipAnalysis: boolean
): Promise<{ transcribed: boolean; analyzed: boolean; skipped: boolean }> {
  const { callAttemptId, callSessionId, campaignId, contactId, duration, disposition } = call;

  // Step 1: Resolve recording URL (prefer GCS permanent URL over Telnyx expiring URL)
  let recordingUrl = call.recordingUrl;
  if (call.recordingS3Key) {
    try {
      const { getCallSessionRecordingUrl } = await import("../services/recording-storage");
      const gcsUrl = await getCallSessionRecordingUrl(callSessionId || callAttemptId);
      if (gcsUrl) recordingUrl = gcsUrl;
    } catch {
      // Fall through to original URL
    }
  }

  if (!recordingUrl) {
    // Try resolving via recording link resolver (searches sessions, leads, attempts, Telnyx API)
    try {
      const { getPlayableRecordingLink } = await import("../services/recording-link-resolver");
      const resolved = await getPlayableRecordingLink(callSessionId || callAttemptId);
      if (resolved?.url) recordingUrl = resolved.url;
    } catch {
      // No recording available
    }
  }

  if (!recordingUrl) {
    return { transcribed: false, analyzed: false, skipped: true };
  }

  // Step 2: Transcribe the recording
  let transcriptText = "";
  try {
    const { transcribeRecording } = await import("../services/telnyx-transcription");
    const result = await transcribeRecording(recordingUrl);

    if (!result.success || !result.text.trim()) {
      console.warn(`${LOG_PREFIX} Transcription failed for ${callAttemptId}: ${result.error || "empty"}`);
      return { transcribed: false, analyzed: false, skipped: false };
    }

    transcriptText = result.text;

    // Store transcript on call attempt
    await db
      .update(dialerCallAttempts)
      .set({
        fullTranscript: transcriptText,
        updatedAt: new Date(),
      })
      .where(eq(dialerCallAttempts.id, callAttemptId));

    // Also store on session
    if (callSessionId) {
      await db
        .update(callSessions)
        .set({ aiTranscript: transcriptText })
        .where(eq(callSessions.id, callSessionId));
    }

    // Also store on lead if linked
    try {
      const [leadRow] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.callAttemptId, callAttemptId))
        .limit(1);

      if (leadRow) {
        await db
          .update(leads)
          .set({
            transcript: transcriptText,
            transcriptionStatus: "completed",
            updatedAt: new Date(),
          })
          .where(eq(leads.id, leadRow.id));
      }
    } catch {
      // Non-critical
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Transcription error for ${callAttemptId}:`, err.message);
    return { transcribed: false, analyzed: false, skipped: false };
  }

  // Step 3: Feed into post-call analysis pipeline
  let analyzed = false;
  if (!skipAnalysis && callSessionId && transcriptText) {
    try {
      const { runPostCallAnalysis } = await import("../services/post-call-analyzer");
      const analysisResult = await runPostCallAnalysis(callSessionId, {
        callAttemptId,
        campaignId: campaignId || undefined,
        contactId: contactId || undefined,
        callDurationSec: duration || undefined,
        disposition: (disposition || undefined) as string | undefined,
        geminiTranscript: transcriptText,
      });

      analyzed = analysisResult.success;
      if (!analysisResult.success) {
        console.warn(`${LOG_PREFIX} Analysis incomplete for ${callAttemptId}: ${analysisResult.error || analysisResult.skipReason}`);
      }
    } catch (err: any) {
      console.warn(`${LOG_PREFIX} Analysis error for ${callAttemptId}: ${err.message}`);
    }
  }

  return { transcribed: true, analyzed, skipped: false };
}

// ==================== HELPERS ====================

function buildFilterConditions(filters: {
  campaignId?: string;
  minDurationSec: number;
  dateFrom?: string;
  dateTo?: string;
  includeFailedTranscriptions: boolean;
}) {
  const conditions = [
    sql`${dialerCallAttempts.callDurationSeconds} >= ${filters.minDurationSec}`,
    // Must have a recording somewhere
    sql`(
      ${dialerCallAttempts.recordingUrl} IS NOT NULL
      OR ${callSessions.recordingUrl} IS NOT NULL
      OR ${callSessions.recordingS3Key} IS NOT NULL
    )`,
  ];

  // No transcript (or failed transcription)
  if (filters.includeFailedTranscriptions) {
    conditions.push(
      sql`(
        (${dialerCallAttempts.fullTranscript} IS NULL OR LENGTH(${dialerCallAttempts.fullTranscript}) < 20)
        AND (${dialerCallAttempts.aiTranscript} IS NULL OR LENGTH(${dialerCallAttempts.aiTranscript}) < 20)
      )`
    );
  } else {
    conditions.push(
      sql`(
        (${dialerCallAttempts.fullTranscript} IS NULL OR ${dialerCallAttempts.fullTranscript} = '')
        AND (${dialerCallAttempts.aiTranscript} IS NULL OR ${dialerCallAttempts.aiTranscript} = '')
      )`
    );
  }

  if (filters.campaignId) {
    conditions.push(eq(dialerCallAttempts.campaignId, filters.campaignId));
  }

  if (filters.dateFrom) {
    conditions.push(
      sql`COALESCE(${dialerCallAttempts.callStartedAt}, ${dialerCallAttempts.createdAt}) >= ${normalizeFilterDate(filters.dateFrom, "start")}`
    );
  }

  if (filters.dateTo) {
    conditions.push(
      sql`COALESCE(${dialerCallAttempts.callStartedAt}, ${dialerCallAttempts.createdAt}) <= ${normalizeFilterDate(filters.dateTo, "end")}`
    );
  }

  return conditions;
}

async function getCallsToProcess(filters: {
  campaignId?: string;
  minDurationSec: number;
  dateFrom?: string;
  dateTo?: string;
  includeFailedTranscriptions: boolean;
  limit: number;
}): Promise<CallToPreview[]> {
  const conditions = buildFilterConditions(filters);
  const rows = await db
    .select({
      callAttemptId: dialerCallAttempts.id,
      callSessionId: dialerCallAttempts.callSessionId,
      campaignId: dialerCallAttempts.campaignId,
      contactId: dialerCallAttempts.contactId,
      duration: dialerCallAttempts.callDurationSeconds,
      disposition: dialerCallAttempts.disposition,
      attemptRecordingUrl: dialerCallAttempts.recordingUrl,
      sessionRecordingUrl: callSessions.recordingUrl,
      recordingS3Key: callSessions.recordingS3Key,
      hasAttemptRecordingUrl: sql<boolean>`${dialerCallAttempts.recordingUrl} IS NOT NULL`,
      hasSessionRecordingUrl: sql<boolean>`${callSessions.recordingUrl} IS NOT NULL`,
      hasS3Key: sql<boolean>`${callSessions.recordingS3Key} IS NOT NULL`,
      createdAt: sql<Date>`COALESCE(${dialerCallAttempts.callStartedAt}, ${dialerCallAttempts.createdAt})`,
    })
    .from(dialerCallAttempts)
    .leftJoin(callSessions, eq(callSessions.id, dialerCallAttempts.callSessionId))
    .where(and(...conditions))
    .orderBy(CALL_ORDER_BY)
    .limit(filters.limit);

  return rows.map((row) => ({
    callAttemptId: row.callAttemptId,
    callSessionId: row.callSessionId,
    campaignId: row.campaignId,
    contactId: row.contactId,
    duration: row.duration,
    disposition: row.disposition,
    recordingUrl: row.sessionRecordingUrl || row.attemptRecordingUrl,
    recordingS3Key: row.recordingS3Key,
    hasAttemptRecordingUrl: row.hasAttemptRecordingUrl,
    hasSessionRecordingUrl: row.hasSessionRecordingUrl,
    hasS3Key: row.hasS3Key,
    createdAt: row.createdAt,
  }));
}

function normalizeFilterDate(value: string, boundary: "start" | "end"): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    return new Date(`${value}${suffix}`);
  }

  return new Date(value);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h ${remainMin}m`;
}

export default router;
