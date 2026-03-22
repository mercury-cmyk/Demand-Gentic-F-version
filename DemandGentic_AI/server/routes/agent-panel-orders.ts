/**
 * Agent Panel Order Routes
 * API endpoints for AgentX order creation feature
 */

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { verifyToken } from "../auth";
import {
  clientAccounts,
  clientBusinessProfiles,
  agentExecutionPlans,
  clientOrganizationLinks,
  campaignOrganizations,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  analyzeGoal,
  calculatePricing,
  generatePlan,
  executePlan,
  type OrderConfiguration,
} from "../services/agent-order-service";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";

/**
 * Dual auth middleware - accepts both main app tokens and client portal tokens.
 * Sets req.clientUser for client portal users, or synthesizes one for main app users.
 */
function requireDualAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const token = authHeader.substring(7);

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }

  // Try client portal auth first (primary use case for orders)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.isClient) {
      (req as any).clientUser = {
        id: decoded.clientUserId,
        clientAccountId: decoded.clientAccountId,
        clientUserId: decoded.clientUserId,
        email: decoded.email,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        tenantId: decoded.tenantId,
        isClient: true,
      };
      return next();
    }
  } catch {
    // Not a valid client token, try main app auth
  }

  // Try main app auth
  const mainPayload = verifyToken(token);
  if (mainPayload) {
    req.user = mainPayload;
    // Synthesize clientUser context for internal admin users
    (req as any).clientUser = {
      id: mainPayload.userId,
      clientAccountId: mainPayload.tenantId || mainPayload.userId,
      clientUserId: mainPayload.userId,
      email: mainPayload.email || '',
      firstName: null,
      lastName: null,
      tenantId: mainPayload.tenantId,
      isClient: false,
    };
    return next();
  }

  return res.status(401).json({ success: false, message: "Invalid or expired token" });
}

// Apply dual auth to all routes
router.use(requireDualAuth);

/**
 * Get client context from request
 */
function getClientContext(req: Request) {
  const clientUser = (req as any).clientUser;
  return {
    clientAccountId: clientUser?.clientAccountId,
    clientUserId: clientUser?.id || clientUser?.clientUserId,
    tenantId: clientUser?.tenantId,
  };
}

/**
 * Analyze goal and generate AI recommendation
 * POST /api/agent-panel/orders/analyze-goal
 */
router.post("/analyze-goal", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);

    if (!context.clientAccountId) {
      return res.status(401).json({ success: false, message: "Client context required" });
    }

    const {
      goal,
      contextUrls = [],
      contextFiles = [],
      targetAccountFiles = [],
      suppressionFiles = [],
      templateFiles = [],
      sessionId,
      conversationId,
    } = req.body;

    if (!goal) {
      return res.status(400).json({ success: false, message: "Goal is required" });
    }

    console.log(`[Agent Order] Analyzing goal for client ${context.clientAccountId}`);

    // Fetch organization linked to this client
    const [orgLink] = await db
      .select({
        organizationId: clientOrganizationLinks.campaignOrganizationId,
      })
      .from(clientOrganizationLinks)
      .where(eq(clientOrganizationLinks.clientAccountId, context.clientAccountId))
      .limit(1);

    let orgIntel: any = null;
    if (orgLink?.organizationId) {
      const [org] = await db
        .select()
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.id, orgLink.organizationId))
        .limit(1);
      orgIntel = org;
    }

    // Fetch business profile
    const [businessProfile] = await db
      .select()
      .from(clientBusinessProfiles)
      .where(eq(clientBusinessProfiles.clientAccountId, context.clientAccountId))
      .limit(1);

    // Build organization context
    let organizationContext = "";
    if (orgIntel) {
      if (orgIntel.identity) {
        organizationContext += `Company: ${(orgIntel.identity as any).legalName || orgIntel.name || "N/A"}\n`;
        organizationContext += `Industry: ${(orgIntel.identity as any).industry || "N/A"}\n`;
      }
    }

    // Build targeting suggestions from ICP
    const targetingSuggestions: any = {};
    if (orgIntel?.icp) {
      const icp = orgIntel.icp as any;
      if (icp.industries) targetingSuggestions.industries = icp.industries;
      if (icp.personas) {
        targetingSuggestions.titles = icp.personas.map((p: any) => p.title).filter(Boolean);
      }
      if (icp.companySize) targetingSuggestions.companySize = icp.companySize;
    }

    // Generate recommendation
    const { recommendation, rationale } = await analyzeGoal({
      goal,
      contextUrls,
      contextFiles,
      organizationContext,
      organizationIntelligence: orgIntel
        ? {
            identity: orgIntel.identity,
            offerings: orgIntel.offerings,
            icp: orgIntel.icp,
            positioning: orgIntel.positioning,
          }
        : null,
      targetingSuggestions: Object.keys(targetingSuggestions).length > 0 ? targetingSuggestions : null,
      businessProfile: businessProfile
        ? {
            name: businessProfile.legalBusinessName,
            website: businessProfile.website,
          }
        : null,
      clientAccountId: context.clientAccountId,
    });

    // Calculate pricing
    const pricingBreakdown = await calculatePricing({
      clientAccountId: context.clientAccountId,
      campaignType: recommendation.campaignType,
      volume: recommendation.suggestedVolume,
      deliveryTimeline: recommendation.deliveryTimeline || "standard",
    });

    // Add estimated cost to recommendation
    recommendation.estimatedCost = pricingBreakdown.totalCost;
    recommendation.rationale = rationale;

    res.json({
      success: true,
      recommendation,
      pricingBreakdown,
      conversationId,
      message: {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `Based on your goal and organization profile, here's my recommended campaign strategy:`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Agent Order] Error analyzing goal:", error);
    res.status(500).json({
      success: false,
      message: "Failed to analyze goal",
      error: (error as Error).message,
    });
  }
});

/**
 * Generate execution plan for order
 * POST /api/agent-panel/orders/generate-plan
 */
router.post("/generate-plan", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);

    if (!context.clientAccountId) {
      return res.status(401).json({ success: false, message: "Client context required" });
    }

    const {
      configuration,
      contextUrls = [],
      contextFiles = [],
      targetAccountFiles = [],
      suppressionFiles = [],
      templateFiles = [],
      conversationId,
    } = req.body;

    if (!configuration) {
      return res.status(400).json({ success: false, message: "Configuration is required" });
    }

    console.log(`[Agent Order] Generating plan for client ${context.clientAccountId}`);

    // Calculate pricing
    const pricingBreakdown = await calculatePricing({
      clientAccountId: context.clientAccountId,
      campaignType: configuration.campaignType,
      volume: configuration.volume,
      deliveryTimeline: configuration.deliveryTimeline || "standard",
    });

    // Generate plan
    const { plan } = await generatePlan({
      configuration: configuration as OrderConfiguration,
      context: {
        contextUrls,
        contextFiles,
        targetAccountFiles,
        suppressionFiles,
        templateFiles,
      },
      pricingBreakdown,
      clientAccountId: context.clientAccountId,
      clientUserId: context.clientUserId,
      conversationId,
    });

    res.json({
      success: true,
      plan,
      pricingBreakdown,
    });
  } catch (error) {
    console.error("[Agent Order] Error generating plan:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate plan",
      error: (error as Error).message,
    });
  }
});

/**
 * Execute approved order plan
 * POST /api/agent-panel/orders/execute-plan/:planId
 */
router.post("/execute-plan/:planId", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const { planId } = req.params;

    if (!context.clientAccountId || !context.tenantId) {
      return res.status(401).json({ success: false, message: "Client context required" });
    }

    const { configuration, pricingBreakdown } = req.body;

    if (!configuration) {
      return res.status(400).json({ success: false, message: "Configuration is required" });
    }

    console.log(`[Agent Order] Executing plan ${planId} for client ${context.clientAccountId}`);

    // Execute the plan
    const result = await executePlan({
      planId,
      configuration: configuration as OrderConfiguration,
      context: req.body.context || {},
      pricingBreakdown,
      clientAccountId: context.clientAccountId,
      clientUserId: context.clientUserId,
      tenantId: context.tenantId,
    });

    if (result.success) {
      res.json({
        success: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        projectId: result.projectId,
        executedSteps: [
          { stepId: "validate_targeting", status: "completed" },
          { stepId: "calculate_pricing", status: "completed" },
          { stepId: "create_order", status: "completed", result: result.orderNumber },
          { stepId: "create_project", status: "completed" },
          { stepId: "send_notification", status: "completed" },
        ],
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || "Failed to execute plan",
      });
    }
  } catch (error) {
    console.error("[Agent Order] Error executing plan:", error);
    res.status(500).json({
      success: false,
      message: "Failed to execute plan",
      error: (error as Error).message,
    });
  }
});

/**
 * Get plan status
 * GET /api/agent-panel/orders/plan/:planId
 */
router.get("/plan/:planId", async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;

    const [plan] = await db
      .select()
      .from(agentExecutionPlans)
      .where(eq(agentExecutionPlans.id, planId))
      .limit(1);

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    res.json({
      success: true,
      plan: {
        id: plan.id,
        steps: plan.plannedSteps,
        riskLevel: plan.riskLevel,
        status: plan.status,
        executedSteps: plan.executedSteps,
      },
    });
  } catch (error) {
    console.error("[Agent Order] Error getting plan:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get plan",
      error: (error as Error).message,
    });
  }
});

/**
 * Calculate pricing estimate
 * POST /api/agent-panel/orders/estimate-pricing
 */
router.post("/estimate-pricing", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);

    if (!context.clientAccountId) {
      return res.status(401).json({ success: false, message: "Client context required" });
    }

    const { campaignType, volume, deliveryTimeline } = req.body;

    const pricingBreakdown = await calculatePricing({
      clientAccountId: context.clientAccountId,
      campaignType: campaignType || "high_quality_leads",
      volume: volume || 100,
      deliveryTimeline: deliveryTimeline || "standard",
    });

    res.json({
      success: true,
      pricingBreakdown,
    });
  } catch (error) {
    console.error("[Agent Order] Error estimating pricing:", error);
    res.status(500).json({
      success: false,
      message: "Failed to estimate pricing",
      error: (error as Error).message,
    });
  }
});

export default router;