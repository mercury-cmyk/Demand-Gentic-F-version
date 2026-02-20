/**
 * Queue Intelligence Routes
 *
 * API endpoints for AI-powered queue prioritization:
 * scoring, overview, segment analysis, and contact scores.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import OpenAI from "openai";
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

// ============================================================================
// POST /api/queue-intelligence/generate-config
// AI-generates queue intelligence routing config from campaign context
// ============================================================================
router.post("/api/queue-intelligence/generate-config", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignObjective, productServiceInfo, targetAudienceDescription, successCriteria, talkingPoints } = req.body;

    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const contextSummary = [
      campaignObjective && `Campaign Objective: ${campaignObjective}`,
      productServiceInfo && `Product/Service: ${productServiceInfo}`,
      targetAudienceDescription && `Target Audience: ${targetAudienceDescription}`,
      successCriteria && `Success Criteria: ${successCriteria}`,
      talkingPoints?.length > 0 && `Key Talking Points: ${talkingPoints.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a B2B sales campaign expert. Based on the campaign context provided, generate a queue intelligence routing configuration that will prioritize the right contacts for human follow-up. Return ONLY a valid JSON object with no markdown or explanation.`,
        },
        {
          role: "user",
          content: `Generate queue intelligence routing rules for this campaign:\n\n${contextSummary}\n\nReturn a JSON object with these exact fields:\n{\n  "exact": "Title1|score\\nTitle2|score",\n  "titleKeywords": "keyword1|score\\nkeyword2|score",\n  "industryKeywords": "industry1|score\\nindustry2|score",\n  "problemKeywords": "keyword1\\nkeyword2",\n  "solutionKeywords": "keyword1\\nkeyword2",\n  "titleWeight": 1.0,\n  "industryWeight": 1.0,\n  "accountFitWeight": 1.0,\n  "problemSolutionWeight": 1.2,\n  "recentOutcomeWeight": 1.0,\n  "routingThreshold": 800\n}\n\nUse realistic job titles, industry terms, problem keywords, and solution keywords that match the campaign context. Higher scores (200-400) for best fits, lower (50-150) for decent fits. Negative scores for poor fits.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    // Strip markdown code blocks if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const config = JSON.parse(jsonStr);

    res.json({ config });
  } catch (error: any) {
    console.error("[QueueIntelligence] Generate config error:", error);
    res.status(500).json({ error: error.message || "Failed to generate config" });
  }
});

export default router;
