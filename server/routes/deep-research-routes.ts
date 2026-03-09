/**
 * Deep Research API Routes
 *
 * Provides research and analysis endpoints powered by Kimi Platform API.
 * Used by AgentX, agentic reports, and campaign planning.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import {
  executeResearch,
  executeCodeAssist,
  researchConversation,
  isDeepResearchAvailable,
  type ResearchDepth,
  type ResearchDomain,
} from "../services/ai-deep-research";
import { getKimiStatus } from "../services/kimi-client";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";

/**
 * Dual auth — accepts main app or client portal tokens.
 */
function requireDualAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.substring(7);
  if (!token || token === "null" || token === "undefined") {
    return res.status(401).json({ error: "Invalid token" });
  }

  // Try main app auth
  const { verifyToken } = require("../auth");
  const mainPayload = verifyToken(token);
  if (mainPayload) {
    req.user = mainPayload;
    return next();
  }

  // Try client portal auth
  try {
    const clientPayload = jwt.verify(token, JWT_SECRET) as any;
    if (clientPayload.isClient) {
      req.user = {
        userId: clientPayload.clientUserId,
        role: "client",
        email: clientPayload.email,
        tenantId: clientPayload.clientAccountId,
      } as any;
      return next();
    }
  } catch {}

  return res.status(401).json({ error: "Invalid or expired token" });
}

router.use(requireDualAuth);

// ==================== Status ====================

/**
 * GET /api/deep-research/status
 * Check if deep research is available and configured.
 */
router.get("/status", (_req: Request, res: Response) => {
  const available = isDeepResearchAvailable();
  const kimiStatus = getKimiStatus();

  res.json({
    available,
    provider: "kimi",
    ...kimiStatus,
  });
});

// ==================== Research ====================

const VALID_DEPTHS: ResearchDepth[] = ["quick", "standard", "deep"];
const VALID_DOMAINS: ResearchDomain[] = [
  "market_analysis", "competitive_intelligence", "account_research",
  "campaign_strategy", "lead_analysis", "industry_trends",
  "code_review", "general",
];

/**
 * POST /api/deep-research/analyze
 * Execute a research query.
 *
 * Body: {
 *   query: string,
 *   depth?: "quick" | "standard" | "deep",
 *   domain?: ResearchDomain,
 *   organizationId?: string,
 *   additionalContext?: string,
 *   maxTokens?: number
 * }
 */
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { query, depth, domain, organizationId, additionalContext, maxTokens } = req.body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "query is required" });
    }

    if (!isDeepResearchAvailable()) {
      return res.status(503).json({
        error: "Deep research is not available. KIMI_API_KEY is not configured.",
      });
    }

    const researchDepth: ResearchDepth = VALID_DEPTHS.includes(depth) ? depth : "standard";
    const researchDomain: ResearchDomain = VALID_DOMAINS.includes(domain) ? domain : "general";

    const result = await executeResearch({
      query: query.trim(),
      depth: researchDepth,
      domain: researchDomain,
      organizationId,
      additionalContext,
      maxTokens,
    });

    res.json(result);
  } catch (error: any) {
    console.error("[DeepResearch] Analysis error:", error);
    res.status(500).json({ error: "Research failed: " + error.message });
  }
});

/**
 * POST /api/deep-research/code-assist
 * Code generation and review.
 *
 * Body: {
 *   task: string,
 *   codeContext?: string,
 *   language?: string,
 *   framework?: string
 * }
 */
router.post("/code-assist", async (req: Request, res: Response) => {
  try {
    const { task, codeContext, language, framework } = req.body;

    if (!task || typeof task !== "string") {
      return res.status(400).json({ error: "task is required" });
    }

    if (!isDeepResearchAvailable()) {
      return res.status(503).json({
        error: "Code assist is not available. KIMI_API_KEY is not configured.",
      });
    }

    const result = await executeCodeAssist({ task, codeContext, language, framework });
    res.json(result);
  } catch (error: any) {
    console.error("[DeepResearch] Code assist error:", error);
    res.status(500).json({ error: "Code assist failed: " + error.message });
  }
});

/**
 * POST /api/deep-research/conversation
 * Multi-turn research conversation.
 *
 * Body: {
 *   systemContext: string,
 *   messages: Array<{ role: "user" | "assistant", content: string }>,
 *   depth?: "quick" | "standard" | "deep"
 * }
 */
router.post("/conversation", async (req: Request, res: Response) => {
  try {
    const { systemContext, messages, depth } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    if (!isDeepResearchAvailable()) {
      return res.status(503).json({
        error: "Research conversation is not available. KIMI_API_KEY is not configured.",
      });
    }

    const researchDepth: ResearchDepth = VALID_DEPTHS.includes(depth) ? depth : "standard";

    const answer = await researchConversation(
      systemContext || "You are a helpful research assistant.",
      messages,
      researchDepth
    );

    res.json({ answer, depth: researchDepth, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error("[DeepResearch] Conversation error:", error);
    res.status(500).json({ error: "Research conversation failed: " + error.message });
  }
});

export default router;
