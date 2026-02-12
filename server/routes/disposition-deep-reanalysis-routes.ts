/**
 * Disposition Deep Reanalysis Routes
 *
 * Enhanced API endpoints for AI-powered disposition reanalysis with:
 *   - Deep transcript analysis with agent behavior scoring
 *   - Call quality assessment vs campaign goals
 *   - Push-to-QA and push-to-client workflows
 *   - CSV/JSON export of reanalysis results
 *   - Full transcript access
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import {
  deepAnalyzeSingleCall,
  deepReanalyzeBatch,
  pushCallsToQA,
  pushCallsToClient,
  exportReanalysisData,
  type DeepReanalysisFilter,
} from "../services/disposition-deep-reanalyzer";
import {
  overrideSingleDisposition,
  getDispositionStats,
} from "../services/bulk-disposition-reanalyzer";
import type { CanonicalDisposition } from "@shared/schema";

const router = Router();

const VALID_DISPOSITIONS: CanonicalDisposition[] = [
  "qualified_lead", "not_interested", "do_not_call", "voicemail",
  "no_answer", "invalid_data", "needs_review", "callback_requested",
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
    console.error("[DeepReanalysis] Stats error:", error);
    res.status(500).json({ error: `Failed to load stats: ${error.message}` });
  }
});

// ============================================================================
// GET /deep-analyze/:callSessionId - Deep single call analysis
// ============================================================================

router.get("/deep-analyze/:callSessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;
    if (!callSessionId) return res.status(400).json({ error: "callSessionId is required" });

    const result = await deepAnalyzeSingleCall(callSessionId);
    if (!result) return res.status(404).json({ error: `Call session ${callSessionId} not found` });

    res.json(result);
  } catch (error: any) {
    console.error("[DeepReanalysis] Deep analyze error:", error);
    res.status(500).json({ error: `Deep analysis failed: ${error.message}` });
  }
});

// ============================================================================
// POST /deep-preview - Deep batch preview (dry-run with AI scoring)
// ============================================================================

router.post("/deep-preview", requireAuth, async (req: Request, res: Response) => {
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
      limit: Math.min(req.body.limit || 25, 100), // Lower default for deep analysis
      offset: req.body.offset || 0,
    };

    const result = await deepReanalyzeBatch(filters, true);
    res.json(result);
  } catch (error: any) {
    console.error("[DeepReanalysis] Deep preview error:", error);
    res.status(500).json({ error: `Deep preview failed: ${error.message}` });
  }
});

// ============================================================================
// POST /deep-apply - Apply deep reanalysis changes
// ============================================================================

router.post("/deep-apply", requireAuth, async (req: Request, res: Response) => {
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
      limit: Math.min(req.body.limit || 25, 50),
      offset: req.body.offset || 0,
    };

    const result = await deepReanalyzeBatch(filters, false);
    res.json(result);
  } catch (error: any) {
    console.error("[DeepReanalysis] Deep apply error:", error);
    res.status(500).json({ error: `Deep apply failed: ${error.message}` });
  }
});

// ============================================================================
// POST /push-to-qa - Push selected calls to QA queue
// ============================================================================

router.post("/push-to-qa", requireAuth, async (req: Request, res: Response) => {
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
    console.error("[DeepReanalysis] Push to QA error:", error);
    res.status(500).json({ error: `Push to QA failed: ${error.message}` });
  }
});

// ============================================================================
// POST /push-to-client - Push selected calls for client delivery
// ============================================================================

router.post("/push-to-client", requireAuth, async (req: Request, res: Response) => {
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
    console.error("[DeepReanalysis] Push to client error:", error);
    res.status(500).json({ error: `Push to client failed: ${error.message}` });
  }
});

// ============================================================================
// POST /export - Export reanalysis results as CSV or JSON
// ============================================================================

router.post("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const { calls, format = "csv" } = req.body;

    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({ error: "calls array is required" });
    }

    if (!["csv", "json"].includes(format)) {
      return res.status(400).json({ error: "format must be 'csv' or 'json'" });
    }

    const exported = await exportReanalysisData(calls, format);

    const contentType = format === "csv" ? "text/csv" : "application/json";
    const filename = `disposition-reanalysis-${new Date().toISOString().slice(0, 10)}.${format}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(exported);
  } catch (error: any) {
    console.error("[DeepReanalysis] Export error:", error);
    res.status(500).json({ error: `Export failed: ${error.message}` });
  }
});

// ============================================================================
// POST /override/:callSessionId - Manual single override (reuse existing)
// ============================================================================

router.post("/override/:callSessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;
    const { newDisposition, reason } = req.body;

    if (!callSessionId) return res.status(400).json({ error: "callSessionId is required" });
    if (!newDisposition || !VALID_DISPOSITIONS.includes(newDisposition)) {
      return res.status(400).json({
        error: `Invalid disposition. Must be one of: ${VALID_DISPOSITIONS.join(", ")}`,
      });
    }

    const userId = (req as any).user?.id || "system";
    const result = await overrideSingleDisposition(
      callSessionId,
      newDisposition as CanonicalDisposition,
      userId,
      reason
    );

    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, callSessionId, newDisposition, action: result.action });
  } catch (error: any) {
    console.error("[DeepReanalysis] Override error:", error);
    res.status(500).json({ error: `Override failed: ${error.message}` });
  }
});

// ============================================================================
// POST /bulk-override - Override multiple calls at once (reuse existing)
// ============================================================================

router.post("/bulk-override", requireAuth, async (req: Request, res: Response) => {
  try {
    const { overrides } = req.body;
    if (!Array.isArray(overrides) || overrides.length === 0) {
      return res.status(400).json({ error: "overrides array is required" });
    }
    if (overrides.length > 100) {
      return res.status(400).json({ error: "Maximum 100 overrides per request" });
    }

    const userId = (req as any).user?.id || "system";
    const results: Array<{ callSessionId: string; success: boolean; action?: string; error?: string }> = [];

    for (const override of overrides) {
      if (!override.callSessionId || !override.newDisposition) {
        results.push({ callSessionId: override.callSessionId || "unknown", success: false, error: "Missing fields" });
        continue;
      }
      if (!VALID_DISPOSITIONS.includes(override.newDisposition)) {
        results.push({ callSessionId: override.callSessionId, success: false, error: `Invalid: ${override.newDisposition}` });
        continue;
      }

      const result = await overrideSingleDisposition(
        override.callSessionId,
        override.newDisposition as CanonicalDisposition,
        userId,
        override.reason
      );
      results.push({ callSessionId: override.callSessionId, ...result });
    }

    res.json({
      totalProcessed: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  } catch (error: any) {
    console.error("[DeepReanalysis] Bulk override error:", error);
    res.status(500).json({ error: `Bulk override failed: ${error.message}` });
  }
});

export default router;
