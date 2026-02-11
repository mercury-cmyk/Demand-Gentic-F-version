/**
 * Queue Intelligence Routes
 *
 * API endpoints for AI-powered queue prioritization:
 * scoring, overview, segment analysis, and contact scores.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import {
  scoreQueueContacts,
  getQueueIntelligenceOverview,
  getSegmentAnalysis,
  getContactScores,
} from "../services/queue-intelligence-service";

const router = Router();

// ============================================================================
// POST /api/queue-intelligence/:campaignId/score
// Trigger AI scoring for all queued contacts in a campaign
// ============================================================================
router.post("/api/queue-intelligence/:campaignId/score", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const tenantId = (req as any).user?.tenantId || (req as any).user?.id;

    if (!campaignId) {
      return res.status(400).json({ error: "campaignId is required" });
    }

    const result = await scoreQueueContacts(campaignId, tenantId);
    res.json(result);
  } catch (error: any) {
    console.error("[QueueIntelligence] Score error:", error);
    res.status(500).json({ error: error.message || "Failed to score queue" });
  }
});

// ============================================================================
// GET /api/queue-intelligence/:campaignId/overview
// Score distribution, tier breakdown, top contacts
// ============================================================================
router.get("/api/queue-intelligence/:campaignId/overview", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const tenantId = (req as any).user?.tenantId || (req as any).user?.id;

    const data = await getQueueIntelligenceOverview(campaignId, tenantId);
    res.json(data);
  } catch (error: any) {
    console.error("[QueueIntelligence] Overview error:", error);
    res.status(500).json({ error: error.message || "Failed to get overview" });
  }
});

// ============================================================================
// GET /api/queue-intelligence/:campaignId/segment-analysis
// Detailed tier breakdown with industry/role distribution
// ============================================================================
router.get("/api/queue-intelligence/:campaignId/segment-analysis", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const tenantId = (req as any).user?.tenantId || (req as any).user?.id;

    const data = await getSegmentAnalysis(campaignId, tenantId);
    res.json(data);
  } catch (error: any) {
    console.error("[QueueIntelligence] Segment analysis error:", error);
    res.status(500).json({ error: error.message || "Failed to get segment analysis" });
  }
});

// ============================================================================
// GET /api/queue-intelligence/:campaignId/contact-scores
// Paginated, sortable contact list with AI scores
// ============================================================================
router.get("/api/queue-intelligence/:campaignId/contact-scores", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const tenantId = (req as any).user?.tenantId || (req as any).user?.id;

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const sortBy = (req.query.sortBy as string) || "score";
    const tier = req.query.tier as string | undefined;

    const data = await getContactScores(campaignId, tenantId, { page, limit, sortBy, tier });
    res.json(data);
  } catch (error: any) {
    console.error("[QueueIntelligence] Contact scores error:", error);
    res.status(500).json({ error: error.message || "Failed to get contact scores" });
  }
});

export default router;
