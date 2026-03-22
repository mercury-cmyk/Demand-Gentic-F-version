/**
 * Disposition Reanalysis Routes
 *
 * API endpoints for bulk and single-call disposition reanalysis.
 * Allows admins to:
 *   1. View disposition statistics and potential misclassifications
 *   2. Preview (dry-run) what would change
 *   3. Analyze a single call in detail
 *   4. Apply disposition changes (single or batch)
 *   5. Manually override a disposition
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import { requireDataExportAuthority } from "../middleware/auth";
import {
  analyzeSingleCall,
  reanalyzeBatch,
  overrideSingleDisposition,
  getDispositionStats,
  type ReanalysisFilter,
} from "../services/bulk-disposition-reanalyzer";
import {
  deepAnalyzeSingleCall,
  deepReanalyzeBatch,
  pushCallsToQA,
  pushCallsToClient,
  pushCallsToDashboard,
  exportReanalysisData,
  getContactsByDisposition,
  validateCallsForClientSamples,
  type DeepReanalysisFilter,
  type DeepReanalysisCallDetail,
} from "../services/disposition-deep-reanalyzer";
import { getDispositionCache } from "../services/disposition-analysis-cache";
import {
  queueAnalysisJob,
  getJobStatus,
  getJobResult,
  cancelJob,
  getQueueStats,
  isQueueOperational,
} from "../services/disposition-job-queue";
import {
  streamResultsAsCSV,
  streamResultsAsJSON,
  streamResultsAsJSONL,
  getRecommendedExportFormat,
  estimateExportSize,
} from "../services/disposition-streaming-export";
import type { CanonicalDisposition } from "@shared/schema";

const router = Router();

const VALID_DISPOSITIONS: CanonicalDisposition[] = [
  "qualified_lead",
  "not_interested",
  "do_not_call",
  "voicemail",
  "no_answer",
  "invalid_data",
  "needs_review",
  "callback_requested",
];

// ============================================================================
// GET /stats - Disposition distribution statistics
// ============================================================================

router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId, dateFrom, dateTo } = req.query;

    const stats = await getDispositionStats(
      campaignId as string | undefined,
      dateFrom as string | undefined,
      dateTo as string | undefined
    );

    res.json(stats);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Stats error:", error);
    res.status(500).json({ error: `Failed to load stats: ${error.message}` });
  }
});

// ============================================================================
// GET /analyze/:callSessionId - Analyze a single call
// ============================================================================

router.get("/analyze/:callSessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;

    if (!callSessionId) {
      return res.status(400).json({ error: "callSessionId is required" });
    }

    const result = await analyzeSingleCall(callSessionId);

    if (!result) {
      return res.status(404).json({ error: `Call session ${callSessionId} not found` });
    }

    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Single call analysis error:", error);
    res.status(500).json({ error: `Analysis failed: ${error.message}` });
  }
});

// ============================================================================
// POST /preview - Dry-run batch reanalysis (preview changes)
// ============================================================================

router.post("/preview", requireAuth, async (req: Request, res: Response) => {
  try {
    const filters: ReanalysisFilter = {
      campaignId: req.body.campaignId,
      dispositions: req.body.dispositions,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
      minDurationSec: req.body.minDurationSec ?? 20, // Default to 20s minimum to reduce API load
      maxDurationSec: req.body.maxDurationSec,
      hasTranscript: req.body.hasTranscript ?? true,
      hasRecording: req.body.hasRecording,
      limit: Math.min(req.body.limit || 100, 500),
      offset: req.body.offset || 0,
    };

    const result = await reanalyzeBatch(filters, true /* dryRun */);

    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Preview error:", error);
    res.status(500).json({ error: `Preview failed: ${error.message}` });
  }
});

// ============================================================================
// POST /apply - Apply batch reanalysis changes (WRITE operation)
// ============================================================================

router.post("/apply", requireAuth, async (req: Request, res: Response) => {
  try {
    const filters: ReanalysisFilter = {
      campaignId: req.body.campaignId,
      dispositions: req.body.dispositions,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
      minDurationSec: req.body.minDurationSec ?? 20, // Default to 20s minimum to reduce API load
      maxDurationSec: req.body.maxDurationSec,
      hasTranscript: req.body.hasTranscript ?? true,
      hasRecording: req.body.hasRecording,
      limit: Math.min(req.body.limit || 50, 200), // Lower limit for writes
      offset: req.body.offset || 0,
    };

    const result = await reanalyzeBatch(filters, false /* apply changes */);

    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Apply error:", error);
    res.status(500).json({ error: `Apply failed: ${error.message}` });
  }
});

// ============================================================================
// POST /override/:callSessionId - Manually override a single disposition
// ============================================================================

router.post("/override/:callSessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;
    const { newDisposition, reason } = req.body;

    if (!callSessionId) {
      return res.status(400).json({ error: "callSessionId is required" });
    }

    if (!newDisposition || !VALID_DISPOSITIONS.includes(newDisposition)) {
      return res.status(400).json({
        error: `Invalid disposition. Must be one of: ${VALID_DISPOSITIONS.join(", ")}`,
      });
    }

    // Get user ID from auth
    const userId = (req as any).user?.id || "system";

    const result = await overrideSingleDisposition(
      callSessionId,
      newDisposition as CanonicalDisposition,
      userId,
      reason
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Invalidate cache for this call (analysis is now stale)
    const cache = getDispositionCache();
    await cache.invalidateCall(callSessionId).catch(err => {
      console.warn("[DispositionReanalysis] Failed to invalidate cache:", err.message);
      // Still return success - cache invalidation is not critical
    });

    res.json({
      success: true,
      callSessionId,
      newDisposition,
      action: result.action,
    });
  } catch (error: any) {
    console.error("[DispositionReanalysis] Override error:", error);
    res.status(500).json({ error: `Override failed: ${error.message}` });
  }
});

// ============================================================================
// POST /bulk-override - Override multiple calls at once
// ============================================================================

router.post("/bulk-override", requireAuth, async (req: Request, res: Response) => {
  try {
    const { overrides } = req.body;

    if (!Array.isArray(overrides) || overrides.length === 0) {
      return res.status(400).json({
        error: "overrides array is required. Format: [{ callSessionId, newDisposition, reason? }]",
      });
    }

    if (overrides.length > 100) {
      return res.status(400).json({ error: "Maximum 100 overrides per request" });
    }

    const userId = (req as any).user?.id || "system";
    const results: Array = [];

    for (const override of overrides) {
      if (!override.callSessionId || !override.newDisposition) {
        results.push({
          callSessionId: override.callSessionId || "unknown",
          success: false,
          error: "callSessionId and newDisposition are required",
        });
        continue;
      }

      if (!VALID_DISPOSITIONS.includes(override.newDisposition)) {
        results.push({
          callSessionId: override.callSessionId,
          success: false,
          error: `Invalid disposition: ${override.newDisposition}`,
        });
        continue;
      }

      const result = await overrideSingleDisposition(
        override.callSessionId,
        override.newDisposition as CanonicalDisposition,
        userId,
        override.reason
      );

      results.push({
        callSessionId: override.callSessionId,
        ...result,
      });
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    res.json({
      totalProcessed: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (error: any) {
    console.error("[DispositionReanalysis] Bulk override error:", error);
    res.status(500).json({ error: `Bulk override failed: ${error.message}` });
  }
});

// ============================================================================
// DEEP REANALYSIS ENDPOINTS (AI-powered with agent behavior & call quality)
// ============================================================================

// POST /deep/preview - Deep AI analysis preview (dry-run)
router.post("/deep/preview", requireAuth, async (req: Request, res: Response) => {
  // Extend timeout to 10 minutes for batch AI processing
  req.setTimeout(600000);
  res.setTimeout(600000);
  try {
    const filters: DeepReanalysisFilter = {
      campaignId: req.body.campaignId,
      dispositions: req.body.dispositions,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
      minDurationSec: req.body.minDurationSec,
      maxDurationSec: req.body.maxDurationSec,
      hasTranscript: req.body.hasTranscript ?? true,
      hasRecording: req.body.hasRecording,
      agentType: req.body.agentType || "all",
      confidenceThreshold: req.body.confidenceThreshold,
      minTurns: req.body.minTurns,
      maxTurns: req.body.maxTurns,
      cursor: req.body.cursor,
      snapshotBefore: req.body.snapshotBefore,
      skipDeepForObvious: req.body.skipDeepForObvious ?? true,
      limit: Math.min(req.body.limit || 100, 500),
      offset: req.body.offset || 0,
    };

    const result = await deepReanalyzeBatch(filters, true);
    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Deep preview error:", error);
    res.status(500).json({ error: `Deep preview failed: ${error.message}` });
  }
});

// POST /deep/apply - Deep AI analysis with actual changes
router.post("/deep/apply", requireAuth, async (req: Request, res: Response) => {
  // Extend timeout to 10 minutes for batch AI processing
  req.setTimeout(600000);
  res.setTimeout(600000);
  try {
    const filters: DeepReanalysisFilter = {
      campaignId: req.body.campaignId,
      dispositions: req.body.dispositions,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
      minDurationSec: req.body.minDurationSec,
      maxDurationSec: req.body.maxDurationSec,
      hasTranscript: req.body.hasTranscript ?? true,
      hasRecording: req.body.hasRecording,
      agentType: req.body.agentType || "all",
      confidenceThreshold: req.body.confidenceThreshold,
      minTurns: req.body.minTurns,
      maxTurns: req.body.maxTurns,
      cursor: req.body.cursor,
      snapshotBefore: req.body.snapshotBefore,
      skipDeepForObvious: req.body.skipDeepForObvious ?? true,
      limit: Math.min(req.body.limit || 100, 300),
      offset: req.body.offset || 0,
    };

    const result = await deepReanalyzeBatch(filters, false);
    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Deep apply error:", error);
    res.status(500).json({ error: `Deep apply failed: ${error.message}` });
  }
});

// GET /deep/analyze/:callSessionId - Deep single call analysis
router.get("/deep/analyze/:callSessionId", requireAuth, async (req: Request, res: Response) => {
  // Extend timeout to 2 minutes for single AI analysis
  req.setTimeout(120000);
  res.setTimeout(120000);
  try {
    const { callSessionId } = req.params;
    if (!callSessionId) {
      return res.status(400).json({ error: "callSessionId is required" });
    }

    const result = await deepAnalyzeSingleCall(callSessionId);
    if (!result) {
      return res.status(404).json({ error: `Call session ${callSessionId} not found` });
    }

    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Deep single analysis error:", error);
    res.status(500).json({ error: `Deep analysis failed: ${error.message}` });
  }
});

// POST /deep/push-to-qa - Push selected calls to QA queue
router.post("/deep/push-to-qa", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionIds } = req.body;
    if (!Array.isArray(callSessionIds) || callSessionIds.length === 0) {
      return res.status(400).json({ error: "callSessionIds array is required" });
    }
    if (callSessionIds.length > 100) {
      return res.status(400).json({ error: "Maximum 100 calls per request" });
    }

    const userId = (req as any).user?.id || "system";
    const result = await pushCallsToQA(callSessionIds, userId);
    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Push to QA error:", error);
    res.status(500).json({ error: `Push to QA failed: ${error.message}` });
  }
});

// POST /deep/push-to-client - Push selected calls to client
router.post("/deep/push-to-client", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionIds, clientNotes, samplePush } = req.body;
    if (!Array.isArray(callSessionIds) || callSessionIds.length === 0) {
      return res.status(400).json({ error: "callSessionIds array is required" });
    }
    if (callSessionIds.length > 100) {
      return res.status(400).json({ error: "Maximum 100 calls per request" });
    }

    const userId = (req as any).user?.id || "system";
    const result = await pushCallsToClient(callSessionIds, clientNotes || "", userId, !!samplePush);
    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Push to client error:", error);
    res.status(500).json({ error: `Push to client failed: ${error.message}` });
  }
});

// POST /deep/validate-for-client - Validate calls before pushing as client samples
router.post("/deep/validate-for-client", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionIds } = req.body;
    if (!Array.isArray(callSessionIds) || callSessionIds.length === 0) {
      return res.status(400).json({ error: "callSessionIds array is required" });
    }
    if (callSessionIds.length > 200) {
      return res.status(400).json({ error: "Maximum 200 calls per validation request" });
    }

    const result = await validateCallsForClientSamples(callSessionIds);
    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Validate for client error:", error);
    res.status(500).json({ error: `Validation failed: ${error.message}` });
  }
});

// POST /deep/export - Export reanalysis data as CSV or JSON
router.post("/deep/export", requireAuth, requireDataExportAuthority, async (req: Request, res: Response) => {
  try {
    const { calls, format } = req.body;
    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({ error: "calls array is required" });
    }

    const exportFormat = format === "json" ? "json" : "csv";
    const data = await exportReanalysisData(calls, exportFormat);

    if (exportFormat === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=disposition-reanalysis-${new Date().toISOString().split("T")[0]}.csv`);
    } else {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=disposition-reanalysis-${new Date().toISOString().split("T")[0]}.json`);
    }

    res.send(data);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Export error:", error);
    res.status(500).json({ error: `Export failed: ${error.message}` });
  }
});

// ============================================================================
// GET /contacts-by-disposition/:disposition - Get contacts filtered by disposition
// ============================================================================

router.get("/contacts-by-disposition/:disposition", requireAuth, async (req: Request, res: Response) => {
  try {
    const { disposition } = req.params;
    const { campaignId, dateFrom, dateTo, limit, offset, search, transcriptText, minDurationSec, maxDurationSec, minTurns, maxTurns, accuracy, expectedDisposition, currentDisposition } = req.query;

    if (!disposition) {
      return res.status(400).json({ error: "disposition is required" });
    }

    const result = await getContactsByDisposition(disposition, {
      campaignId: campaignId as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      minDurationSec: minDurationSec ? parseInt(minDurationSec as string) : undefined,
      maxDurationSec: maxDurationSec ? parseInt(maxDurationSec as string) : undefined,
      minTurns: minTurns ? parseInt(minTurns as string) : undefined,
      maxTurns: maxTurns ? parseInt(maxTurns as string) : undefined,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
      search: search as string | undefined,
      transcriptText: transcriptText as string | undefined,
      accuracy: accuracy as 'accurate' | 'mismatch' | undefined,
      expectedDisposition: expectedDisposition as string | undefined,
      currentDisposition: currentDisposition as string | undefined,
    });

    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Contacts by disposition error:", error);
    res.status(500).json({ error: `Failed to load contacts: ${error.message}` });
  }
});

// ============================================================================
// POST /deep/push-to-dashboard - Push selected calls to main dashboard
// ============================================================================

router.post("/deep/push-to-dashboard", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionIds, notes } = req.body;
    if (!Array.isArray(callSessionIds) || callSessionIds.length === 0) {
      return res.status(400).json({ error: "callSessionIds array is required" });
    }
    if (callSessionIds.length > 100) {
      return res.status(400).json({ error: "Maximum 100 calls per request" });
    }

    const userId = (req as any).user?.id || "system";
    const result = await pushCallsToDashboard(callSessionIds, userId, notes);
    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Push to dashboard error:", error);
    res.status(500).json({ error: `Push to dashboard failed: ${error.message}` });
  }
});

// ============================================================================
// === BACKGROUND JOB QUEUE ENDPOINTS (Tier 2A) ===
// ============================================================================

// POST /queue/preview - Queue a preview job (non-blocking)
// Returns immediately with job ID
router.post("/queue/preview", requireAuth, async (req: Request, res: Response) => {
  try {
    // Check if queue is available
    if (!isQueueOperational()) {
      console.warn("[DispositionReanalysis] Queue not operational, using synchronous preview");
      // Fall back to synchronous if queue unavailable
      const filters: DeepReanalysisFilter = {
        campaignId: req.body.campaignId,
        dispositions: req.body.dispositions,
        dateFrom: req.body.dateFrom,
        dateTo: req.body.dateTo,
        minDurationSec: req.body.minDurationSec ?? 20, // Default to 20s minimum to reduce API load
        maxDurationSec: req.body.maxDurationSec,
        hasTranscript: req.body.hasTranscript ?? true,
        hasRecording: req.body.hasRecording,
        limit: Math.min(req.body.limit || 100, 500),
        offset: req.body.offset || 0,
      };
      const result = await deepReanalyzeBatch(filters, true /* dryRun */);
      return res.json({ result });
    }

    const userId = (req as any).user?.id || "system";
    const filters: DeepReanalysisFilter = {
      campaignId: req.body.campaignId,
      dispositions: req.body.dispositions,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
      minDurationSec: req.body.minDurationSec ?? 20, // Default to 20s minimum to reduce API load
      maxDurationSec: req.body.maxDurationSec,
      hasTranscript: req.body.hasTranscript ?? true,
      hasRecording: req.body.hasRecording,
      skipDeepForObvious: req.body.skipDeepForObvious ?? true, // Enable lightweight triage
      limit: Math.min(req.body.limit || 100, 500),
      offset: req.body.offset || 0,
    };

    const { jobId, estimatedSeconds } = await queueAnalysisJob(filters, true, userId);

    res.json({
      status: "queued",
      jobId,
      estimatedSeconds,
      pollUrl: `/api/disposition-reanalysis/queue/job/${jobId}/status`,
      resultUrl: `/api/disposition-reanalysis/queue/job/${jobId}/result`,
    });
  } catch (error: any) {
    console.error("[DispositionReanalysis] Queue preview error:", error);
    res.status(500).json({ error: `Failed to queue preview: ${error.message}` });
  }
});

// POST /queue/apply - Queue an apply job (non-blocking)
// Returns immediately with job ID
router.post("/queue/apply", requireAuth, async (req: Request, res: Response) => {
  try {
    // Check if queue is available
    if (!isQueueOperational()) {
      console.warn("[DispositionReanalysis] Queue not operational, using synchronous apply");
      // Fall back to synchronous if queue unavailable
      const filters: DeepReanalysisFilter = {
        campaignId: req.body.campaignId,
        dispositions: req.body.dispositions,
        dateFrom: req.body.dateFrom,
        dateTo: req.body.dateTo,
        minDurationSec: req.body.minDurationSec ?? 20, // Default to 20s minimum to reduce API load
        maxDurationSec: req.body.maxDurationSec,
        hasTranscript: req.body.hasTranscript ?? true,
        hasRecording: req.body.hasRecording,
        limit: Math.min(req.body.limit || 50, 200),
        offset: req.body.offset || 0,
      };
      const result = await deepReanalyzeBatch(filters, false /* apply */);
      return res.json({ result });
    }

    const userId = (req as any).user?.id || "system";
    const filters: DeepReanalysisFilter = {
      campaignId: req.body.campaignId,
      dispositions: req.body.dispositions,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
      minDurationSec: req.body.minDurationSec ?? 20, // Default to 20s minimum to reduce API load
      maxDurationSec: req.body.maxDurationSec,
      hasTranscript: req.body.hasTranscript ?? true,
      hasRecording: req.body.hasRecording,
      skipDeepForObvious: req.body.skipDeepForObvious ?? true,
      limit: Math.min(req.body.limit || 50, 200),
      offset: req.body.offset || 0,
    };

    const { jobId, estimatedSeconds } = await queueAnalysisJob(filters, false, userId);

    res.json({
      status: "queued",
      jobId,
      estimatedSeconds,
      pollUrl: `/api/disposition-reanalysis/queue/job/${jobId}/status`,
      resultUrl: `/api/disposition-reanalysis/queue/job/${jobId}/result`,
    });
  } catch (error: any) {
    console.error("[DispositionReanalysis] Queue apply error:", error);
    res.status(500).json({ error: `Failed to queue apply: ${error.message}` });
  }
});

// GET /queue/job/:jobId/status - Get job status and progress
router.get("/queue/job/:jobId/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const status = await getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({ error: `Job ${jobId} not found` });
    }

    res.json({
      jobId,
      ...status,
      // Add retry logic hint for client
      pollIntervalMs: status.status === "processing" ? 1000 : 500,
    });
  } catch (error: any) {
    console.error("[DispositionReanalysis] Status error:", error);
    res.status(500).json({ error: `Failed to get status: ${error.message}` });
  }
});

// GET /queue/job/:jobId/result - Get completed job result
router.get("/queue/job/:jobId/result", requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const result = await getJobResult(jobId);

    if (!result) {
      return res.status(404).json({ error: `Job ${jobId} not found or still processing` });
    }

    if (result.status === "failed") {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Result error:", error);
    res.status(500).json({ error: `Failed to get result: ${error.message}` });
  }
});

// DELETE /queue/job/:jobId - Cancel a job
router.delete("/queue/job/:jobId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const cancelled = await cancelJob(jobId);

    if (!cancelled) {
      return res.status(404).json({ error: `Job ${jobId} not found or already completed` });
    }

    res.json({
      jobId,
      success: true,
      message: "Job cancelled",
    });
  } catch (error: any) {
    console.error("[DispositionReanalysis] Cancel error:", error);
    res.status(500).json({ error: `Failed to cancel job: ${error.message}` });
  }
});

// GET /queue/stats - Get queue statistics (admin only)
router.get("/queue/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = await getQueueStats();
    res.json({
      operational: isQueueOperational(),
      ...stats,
    });
  } catch (error: any) {
    console.error("[DispositionReanalysis] Stats error:", error);
    res.status(500).json({ error: `Failed to get queue stats: ${error.message}` });
  }
});

// ============================================================================
// === STREAMING EXPORT ENDPOINTS (Tier 2B) ===
// ============================================================================

// GET /queue/job/:jobId/result/export - Stream results in various formats
router.get("/queue/job/:jobId/result/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { format = "csv", includeTranscript, includeScores, includeQuality } = req.query;

    const result = await getJobResult(jobId);

    if (!result || result.status !== "completed" || !result.result) {
      return res.status(404).json({ error: `Job ${jobId} not found or not completed` });
    }

    const calls = result.result.calls as DeepReanalysisCallDetail[];
    const exportFormat = (format as string || "csv") as "csv" | "json" | "jsonl";
    const options = {
      format: exportFormat,
      includeTranscript: includeTranscript === "true",
      includeAgentScores: includeScores === "true",
      includeCallQuality: includeQuality === "true",
    };

    // Stream based on format
    switch (exportFormat) {
      case "csv":
        await streamResultsAsCSV(calls, options, res);
        break;
      case "json":
        await streamResultsAsJSON(calls, options, res);
        break;
      case "jsonl":
        await streamResultsAsJSONL(calls, options, res);
        break;
      default:
        res.status(400).json({ error: "Invalid format. Use: csv, json, or jsonl" });
    }
  } catch (error: any) {
    console.error("[DispositionReanalysis] Export error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: `Export failed: ${error.message}` });
    }
  }
});

// GET /export-estimate - Estimate export file size
router.post("/export-estimate", requireAuth, async (req: Request, res: Response) => {
  try {
    const { resultCount, format = "csv" } = req.body;

    if (!resultCount || typeof resultCount !== "number" || resultCount < 0) {
      return res.status(400).json({ error: "resultCount must be a positive number" });
    }

    const recommended = getRecommendedExportFormat(resultCount);
    const estimates = {
      recommended,
      csv: estimateExportSize(resultCount, "csv"),
      json: estimateExportSize(resultCount, "json"),
      jsonl: estimateExportSize(resultCount, "jsonl"),
    };

    res.json(estimates);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Export estimate error:", error);
    res.status(500).json({ error: `Failed to estimate: ${error.message}` });
  }
});

export default router;