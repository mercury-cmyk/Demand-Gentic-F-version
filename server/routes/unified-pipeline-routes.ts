/**
 * Unified Pipeline Routes
 *
 * API endpoints for the unified account-based pipeline product.
 * Mounted at /api/unified-pipelines
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import { campaignOrganizations, clientAccounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  createUnifiedPipeline,
  getUnifiedPipeline,
  listUnifiedPipelines,
  updateUnifiedPipeline,
  addCampaignToPipeline,
  getPipelineCampaigns,
  enrollAccountsInPipeline,
  getPipelineAccounts,
  getPipelineAccountDetail,
  updatePipelineAccount,
  getPipelineDashboard,
  createPipelineAction,
  getPipelineAnalytics,
  listPipelineActions,
} from "../services/unified-pipeline-engine";
import {
  generatePipelineStrategy,
  autoCreateCampaignsFromStrategy,
  autoEnrollTargetAccounts,
} from "../services/ai-unified-pipeline-planner";
import { analyzePipelineInboxOpportunities } from "../services/unified-pipeline-inbox-analyzer";

const router = Router();

// ─── Pipeline CRUD ───────────────────────────────────────────────────────────

/**
 * POST /api/unified-pipelines
 * Create a new unified pipeline
 */
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    let { organizationId, clientAccountId, name, description, objective } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // Auto-resolve organizationId and clientAccountId for admin users
    if (!organizationId) {
      const [firstOrg] = await db.select({ id: campaignOrganizations.id }).from(campaignOrganizations).limit(1);
      if (firstOrg) organizationId = firstOrg.id;
    }
    if (!clientAccountId) {
      const [firstClient] = await db.select({ id: clientAccounts.id }).from(clientAccounts).limit(1);
      if (firstClient) clientAccountId = firstClient.id;
    }

    if (!organizationId || !clientAccountId) {
      return res.status(400).json({ error: "Could not resolve organizationId or clientAccountId. Create an organization and client account first." });
    }

    const result = await createUnifiedPipeline({
      organizationId,
      clientAccountId,
      name,
      description,
      objective,
      createdBy: (req as any).user?.id,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Create failed:", error);
    res.status(500).json({ error: error.message || "Failed to create pipeline" });
  }
});

/**
 * GET /api/unified-pipelines
 * List pipelines, optionally filtered by clientAccountId or organizationId
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientAccountId, organizationId, status, limit, offset } = req.query;

    const pipelines = await listUnifiedPipelines({
      clientAccountId: clientAccountId as string,
      organizationId: organizationId as string,
      status: status as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(pipelines);
  } catch (error: any) {
    console.error("[UnifiedPipeline] List failed:", error);
    res.status(500).json({ error: error.message || "Failed to list pipelines" });
  }
});

/**
 * GET /api/unified-pipelines/:id
 * Get pipeline with dashboard metrics
 */
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const dashboard = await getPipelineDashboard(req.params.id);
    if (!dashboard) {
      return res.status(404).json({ error: "Pipeline not found" });
    }
    res.json(dashboard);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Get failed:", error);
    res.status(500).json({ error: error.message || "Failed to get pipeline" });
  }
});

/**
 * PATCH /api/unified-pipelines/:id
 * Update pipeline
 */
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const updated = await updateUnifiedPipeline(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Pipeline not found" });
    }
    res.json(updated);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Update failed:", error);
    res.status(500).json({ error: error.message || "Failed to update pipeline" });
  }
});

// ─── AI Strategy ─────────────────────────────────────────────────────────────

/**
 * POST /api/unified-pipelines/:id/generate-strategy
 * AI-generate pipeline strategy from Organization Intelligence
 */
router.post("/:id/generate-strategy", requireAuth, async (req: Request, res: Response) => {
  try {
    const pipeline = await getUnifiedPipeline(req.params.id);
    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }
    if (!pipeline.organizationId) {
      return res.status(400).json({ error: "Pipeline has no linked organization for OI" });
    }

    const { objective, targetBudget, preferredChannels, estimatedDuration, additionalContext } = req.body;

    const result = await generatePipelineStrategy(pipeline.organizationId, {
      objective: objective || pipeline.objective,
      targetBudget,
      preferredChannels,
      estimatedDuration,
      additionalContext,
    });

    // Save strategy to pipeline
    await updateUnifiedPipeline(req.params.id, {
      objective: result.strategy.objective,
      targetAccountCriteria: result.strategy.targetCriteria,
      channelStrategy: result.strategy.channelStrategy,
      funnelStrategy: result.strategy.funnelStrategy,
    });

    // Auto-populate target accounts from ICP criteria so the funnel
    // starts with a visible "Target" stage before outreach begins.
    let enrollment = { enrolled: 0, matched: 0 };
    if (result.strategy.targetCriteria) {
      try {
        enrollment = await autoEnrollTargetAccounts(
          req.params.id,
          result.strategy.targetCriteria,
        );
        console.log(`[UnifiedPipeline] Auto-enrolled ${enrollment.enrolled} target accounts after strategy generation`);
      } catch (enrollErr: any) {
        console.warn("[UnifiedPipeline] Auto-enrollment after strategy failed (non-fatal):", enrollErr.message);
      }
    }

    res.json({
      strategy: result.strategy,
      thinking: result.thinking,
      oiSummary: result.oiSummary,
      model: result.model,
      durationMs: result.durationMs,
      enrollment,
    });
  } catch (error: any) {
    console.error("[UnifiedPipeline] Strategy generation failed:", error);
    res.status(500).json({ error: error.message || "Failed to generate strategy" });
  }
});

/**
 * POST /api/unified-pipelines/:id/create-campaigns
 * Auto-create draft campaigns from the pipeline strategy
 */
router.post("/:id/create-campaigns", requireAuth, async (req: Request, res: Response) => {
  try {
    const pipeline = await getUnifiedPipeline(req.params.id);
    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }
    if (!pipeline.channelStrategy) {
      return res.status(400).json({ error: "Pipeline has no channel strategy. Generate strategy first." });
    }
    if (!pipeline.clientAccountId) {
      return res.status(400).json({ error: "Pipeline has no client account" });
    }

    const strategy = {
      objective: pipeline.objective || '',
      channelStrategy: pipeline.channelStrategy,
      funnelStrategy: pipeline.funnelStrategy,
      targetCriteria: pipeline.targetAccountCriteria,
    } as any;

    const result = await autoCreateCampaignsFromStrategy(
      pipeline.id,
      strategy,
      pipeline.clientAccountId,
      (req as any).user?.id
    );

    res.json(result);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Campaign creation failed:", error);
    res.status(500).json({ error: error.message || "Failed to create campaigns" });
  }
});

// ─── Account Enrollment ──────────────────────────────────────────────────────

/**
 * POST /api/unified-pipelines/:id/analyze-inbox
 * Analyze recent primary inbox threads and convert opportunity-like email
 * engagement into pipeline accounts, contacts, and follow-up actions.
 */
router.post("/:id/analyze-inbox", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await analyzePipelineInboxOpportunities({
      pipelineId: req.params.id,
      userId: (req as any).user?.userId,
      lookbackMonths: Number(req.body?.lookbackMonths) || 6,
      limitConversations: Number(req.body?.limitConversations) || 200,
      createFollowUps: req.body?.createFollowUps !== false,
    });

    res.json(result);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Inbox analysis failed:", error);
    res.status(500).json({ error: error.message || "Failed to analyze inbox opportunities" });
  }
});

/**
 * POST /api/unified-pipelines/:id/enroll-accounts
 * Bulk-enroll target accounts into the pipeline
 */
router.post("/:id/enroll-accounts", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accountIds, useCriteria } = req.body;

    if (useCriteria) {
      // Auto-enroll from ICP criteria
      const pipeline = await getUnifiedPipeline(req.params.id);
      if (!pipeline?.targetAccountCriteria) {
        return res.status(400).json({ error: "No target criteria set. Generate strategy first." });
      }
      const result = await autoEnrollTargetAccounts(
        req.params.id,
        pipeline.targetAccountCriteria as any
      );
      return res.json(result);
    }

    if (!accountIds?.length) {
      return res.status(400).json({ error: "accountIds array required, or set useCriteria: true" });
    }

    const result = await enrollAccountsInPipeline(req.params.id, accountIds);
    res.json(result);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Enrollment failed:", error);
    res.status(500).json({ error: error.message || "Failed to enroll accounts" });
  }
});

// ─── Pipeline Accounts ───────────────────────────────────────────────────────

/**
 * GET /api/unified-pipelines/:id/accounts
 * List accounts in the pipeline with funnel stages
 */
router.get("/:id/accounts", requireAuth, async (req: Request, res: Response) => {
  try {
    const { funnelStage, assignedAeId, search, limit, offset } = req.query;
    const accounts = await getPipelineAccounts(req.params.id, {
      funnelStage: funnelStage as string,
      assignedAeId: assignedAeId as string,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json(accounts);
  } catch (error: any) {
    console.error("[UnifiedPipeline] List accounts failed:", error);
    res.status(500).json({ error: error.message || "Failed to list accounts" });
  }
});

/**
 * GET /api/unified-pipelines/:id/accounts/:accountId
 * Get detailed account view with contacts and timeline
 */
router.get("/:id/accounts/:accountId", requireAuth, async (req: Request, res: Response) => {
  try {
    const detail = await getPipelineAccountDetail(req.params.accountId);
    if (!detail) {
      return res.status(404).json({ error: "Pipeline account not found" });
    }
    res.json(detail);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Account detail failed:", error);
    res.status(500).json({ error: error.message || "Failed to get account detail" });
  }
});

/**
 * PATCH /api/unified-pipelines/:id/accounts/:accountId
 * Update account stage, assignment, or priority
 */
router.patch("/:id/accounts/:accountId", requireAuth, async (req: Request, res: Response) => {
  try {
    const updated = await updatePipelineAccount(req.params.accountId, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Pipeline account not found" });
    }
    res.json(updated);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Account update failed:", error);
    res.status(500).json({ error: error.message || "Failed to update account" });
  }
});

/**
 * POST /api/unified-pipelines/:id/accounts/:accountId/actions
 * Create a follow-up action for an account
 */
router.post("/:id/accounts/:accountId/actions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { actionType, title, description, scheduledAt, contactId } = req.body;

    if (!actionType) {
      return res.status(400).json({ error: "actionType is required" });
    }

    const action = await createPipelineAction({
      pipelineAccountId: req.params.accountId,
      pipelineId: req.params.id,
      contactId,
      actionType,
      title,
      description,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      createdBy: (req as any).user?.id,
    });

    res.status(201).json(action);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Create action failed:", error);
    res.status(500).json({ error: error.message || "Failed to create action" });
  }
});

// ─── Pipeline Actions List ────────────────────────────────────────────────────

/**
 * GET /api/unified-pipelines/:id/actions
 * List all actions for this pipeline with status filtering and pagination
 */
router.get("/:id/actions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, page, pageSize } = req.query;
    const result = await listPipelineActions(req.params.id, {
      status: status as string,
      page: page ? parseInt(page as string, 10) : 1,
      pageSize: pageSize ? Math.min(parseInt(pageSize as string, 10), 100) : 20,
    });
    res.json(result);
  } catch (error: any) {
    console.error("[UnifiedPipeline] List actions failed:", error);
    res.status(500).json({ error: error.message || "Failed to list actions" });
  }
});

// ─── Analytics ───────────────────────────────────────────────────────────────

/**
 * GET /api/unified-pipelines/:id/analytics
 * Full pipeline analytics with funnel, actions, and progression
 */
router.get("/:id/analytics", requireAuth, async (req: Request, res: Response) => {
  try {
    const analytics = await getPipelineAnalytics(req.params.id);
    if (!analytics) {
      return res.status(404).json({ error: "Pipeline not found" });
    }
    res.json(analytics);
  } catch (error: any) {
    console.error("[UnifiedPipeline] Analytics failed:", error);
    res.status(500).json({ error: error.message || "Failed to get analytics" });
  }
});

// ─── Campaign Management ─────────────────────────────────────────────────────

/**
 * GET /api/unified-pipelines/:id/campaigns
 * List campaigns linked to this pipeline
 */
router.get("/:id/campaigns", requireAuth, async (req: Request, res: Response) => {
  try {
    const pipelineCampaigns = await getPipelineCampaigns(req.params.id);
    res.json(pipelineCampaigns);
  } catch (error: any) {
    console.error("[UnifiedPipeline] List campaigns failed:", error);
    res.status(500).json({ error: error.message || "Failed to list campaigns" });
  }
});

/**
 * POST /api/unified-pipelines/:id/campaigns/:campaignId
 * Link an existing campaign to this pipeline
 */
router.post("/:id/campaigns/:campaignId", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await addCampaignToPipeline(req.params.id, req.params.campaignId);
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("[UnifiedPipeline] Link campaign failed:", error);
    res.status(500).json({ error: error.message || "Failed to link campaign" });
  }
});

export default router;
