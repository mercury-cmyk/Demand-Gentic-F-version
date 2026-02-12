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
  exportReanalysisData,
  type DeepReanalysisFilter,
} from "../services/disposition-deep-reanalyzer";
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
      minDurationSec: req.body.minDurationSec,
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
      minDurationSec: req.body.minDurationSec,
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
    const results: Array<{
      callSessionId: string;
      success: boolean;
      action?: string;
      error?: string;
    }> = [];

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
      limit: Math.min(req.body.limit || 50, 200),
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
      limit: Math.min(req.body.limit || 30, 100),
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
    const { callSessionIds, clientNotes } = req.body;
    if (!Array.isArray(callSessionIds) || callSessionIds.length === 0) {
      return res.status(400).json({ error: "callSessionIds array is required" });
    }
    if (callSessionIds.length > 100) {
      return res.status(400).json({ error: "Maximum 100 calls per request" });
    }

    const userId = (req as any).user?.id || "system";
    const result = await pushCallsToClient(callSessionIds, clientNotes || "", userId);
    res.json(result);
  } catch (error: any) {
    console.error("[DispositionReanalysis] Push to client error:", error);
    res.status(500).json({ error: `Push to client failed: ${error.message}` });
  }
});

// POST /deep/export - Export reanalysis data as CSV or JSON
router.post("/deep/export", requireAuth, async (req: Request, res: Response) => {
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

export default router;
