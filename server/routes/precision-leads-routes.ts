/**
 * Precision Leads Routes
 *
 * API endpoints for the dual-model (Kimi + DeepSeek) precision lead analysis engine.
 * Provides:
 *   - GET  /api/precision-leads           — List precision-analyzed leads (deduped, intent-aware)
 *   - GET  /api/precision-leads/stats     — Aggregate stats and diagnostics
 *   - POST /api/precision-leads/analyze   — Trigger analysis for a specific call session
 *   - POST /api/precision-leads/autopilot — Manually trigger autopilot batch
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import {
  precisionLeadAnalyses,
  callSessions,
  campaigns,
  contacts,
  accounts,
} from "@shared/schema";
import { eq, and, desc, asc, sql, gte, lte, like, or, inArray } from "drizzle-orm";
import {
  analyzePrecisionLead,
  runPrecisionAutopilot,
} from "../services/ai-precision-lead-analyzer";
import {
  runQualificationBridge,
  getLearningStats,
} from "../services/precision-lead-qualification-bridge";

const router = Router();

// ═══════════════════════════════════════════════
// GET /api/precision-leads — List precision leads
// ═══════════════════════════════════════════════
router.get("/api/precision-leads", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      campaignId,
      verdict,
      search,
      minConfidence,
      minIntent,
      recommendedAction,
      page = "1",
      limit = "50",
      sortBy = "priority",
      sortOrder = "asc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    // Build filters
    const conditions: any[] = [];

    if (campaignId && campaignId !== "all") {
      conditions.push(eq(precisionLeadAnalyses.campaignId, campaignId as string));
    }

    if (verdict && verdict !== "all") {
      const verdicts = (verdict as string).split(",");
      if (verdicts.length === 1) {
        conditions.push(eq(precisionLeadAnalyses.verdict, verdicts[0] as any));
      } else {
        conditions.push(inArray(precisionLeadAnalyses.verdict, verdicts as any));
      }
    }

    if (minConfidence) {
      conditions.push(gte(precisionLeadAnalyses.consensusConfidence, parseInt(minConfidence as string, 10)));
    }

    if (minIntent) {
      conditions.push(gte(precisionLeadAnalyses.consensusIntentScore, parseInt(minIntent as string, 10)));
    }

    if (recommendedAction && recommendedAction !== "all") {
      conditions.push(eq(precisionLeadAnalyses.recommendedAction, recommendedAction as string));
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          like(contacts.firstName, pattern),
          like(contacts.lastName, pattern),
          like(contacts.email, pattern),
          like(accounts.name, pattern),
          like(precisionLeadAnalyses.consensusReasoning, pattern),
        ),
      );
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    // Count
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(precisionLeadAnalyses)
      .leftJoin(contacts, eq(precisionLeadAnalyses.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(whereClause);

    const total = Number(countRow?.count || 0);

    // Sort — always fall back to processedAt desc so nulls in priorityRank don't hide rows
    let orderClause: any;
    switch (sortBy) {
      case "confidence":
        orderClause = sortOrder === "asc"
          ? [asc(precisionLeadAnalyses.consensusConfidence), desc(precisionLeadAnalyses.processedAt)]
          : [desc(precisionLeadAnalyses.consensusConfidence), desc(precisionLeadAnalyses.processedAt)];
        break;
      case "intent":
        orderClause = sortOrder === "asc"
          ? [asc(precisionLeadAnalyses.consensusIntentScore), desc(precisionLeadAnalyses.processedAt)]
          : [desc(precisionLeadAnalyses.consensusIntentScore), desc(precisionLeadAnalyses.processedAt)];
        break;
      case "date":
        orderClause = sortOrder === "asc"
          ? [asc(precisionLeadAnalyses.processedAt)]
          : [desc(precisionLeadAnalyses.processedAt)];
        break;
      case "priority":
      default:
        // priorityRank may be null — COALESCE to high value so nulls sort last
        orderClause = [
          asc(sql`COALESCE(${precisionLeadAnalyses.priorityRank}, 99999)`),
          desc(precisionLeadAnalyses.consensusIntentScore),
          desc(precisionLeadAnalyses.processedAt),
        ];
        break;
    }

    // Query
    const rows = await db
      .select({
        id: precisionLeadAnalyses.id,
        callSessionId: precisionLeadAnalyses.callSessionId,
        campaignId: precisionLeadAnalyses.campaignId,
        contactId: precisionLeadAnalyses.contactId,
        verdict: precisionLeadAnalyses.verdict,
        consensusConfidence: precisionLeadAnalyses.consensusConfidence,
        consensusIntentScore: precisionLeadAnalyses.consensusIntentScore,
        consensusCampaignFit: precisionLeadAnalyses.consensusCampaignFit,
        consensusReasoning: precisionLeadAnalyses.consensusReasoning,
        kimiVerdict: precisionLeadAnalyses.kimiVerdict,
        kimiConfidence: precisionLeadAnalyses.kimiConfidence,
        deepseekVerdict: precisionLeadAnalyses.deepseekVerdict,
        deepseekConfidence: precisionLeadAnalyses.deepseekConfidence,
        intentSignals: precisionLeadAnalyses.intentSignals,
        engagementIndicators: precisionLeadAnalyses.engagementIndicators,
        missingFields: precisionLeadAnalyses.missingFields,
        dataCompleteness: precisionLeadAnalyses.dataCompleteness,
        overrideDisposition: precisionLeadAnalyses.overrideDisposition,
        suggestedDisposition: precisionLeadAnalyses.suggestedDisposition,
        originalDisposition: precisionLeadAnalyses.originalDisposition,
        campaignObjective: precisionLeadAnalyses.campaignObjective,
        recommendedAction: precisionLeadAnalyses.recommendedAction,
        actionReason: precisionLeadAnalyses.actionReason,
        priorityRank: precisionLeadAnalyses.priorityRank,
        processedAt: precisionLeadAnalyses.processedAt,
        processingDurationMs: precisionLeadAnalyses.processingDurationMs,
        autopilotRun: precisionLeadAnalyses.autopilotRun,
        // Joined fields
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        contactPhone: contacts.phone,
        companyName: accounts.name,
        campaignName: campaigns.name,
        callDuration: callSessions.durationSec,
        callStatus: callSessions.status,
      })
      .from(precisionLeadAnalyses)
      .leftJoin(contacts, eq(precisionLeadAnalyses.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(precisionLeadAnalyses.campaignId, campaigns.id))
      .leftJoin(callSessions, eq(precisionLeadAnalyses.callSessionId, callSessions.id))
      .where(whereClause)
      .orderBy(...(Array.isArray(orderClause) ? orderClause : [orderClause]))
      .limit(limitNum)
      .offset(offset);

    const items = rows.map((r) => ({
      id: r.id,
      callSessionId: r.callSessionId,
      campaignId: r.campaignId,
      contactId: r.contactId,
      contactName: [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ") || "Unknown",
      contactEmail: r.contactEmail,
      contactPhone: r.contactPhone,
      companyName: r.companyName || "Unknown",
      campaignName: r.campaignName || "Unknown Campaign",
      callDuration: r.callDuration,
      callStatus: r.callStatus,
      // Verdict
      verdict: r.verdict,
      consensusConfidence: r.consensusConfidence,
      consensusIntentScore: r.consensusIntentScore,
      consensusCampaignFit: r.consensusCampaignFit,
      consensusReasoning: r.consensusReasoning,
      // Model details
      kimiVerdict: r.kimiVerdict,
      kimiConfidence: r.kimiConfidence,
      deepseekVerdict: r.deepseekVerdict,
      deepseekConfidence: r.deepseekConfidence,
      // Intent & engagement
      intentSignals: r.intentSignals || [],
      engagementIndicators: r.engagementIndicators || [],
      missingFields: r.missingFields || [],
      dataCompleteness: r.dataCompleteness,
      // Disposition
      overrideDisposition: r.overrideDisposition,
      suggestedDisposition: r.suggestedDisposition,
      originalDisposition: r.originalDisposition,
      // Action
      campaignObjective: r.campaignObjective,
      recommendedAction: r.recommendedAction,
      actionReason: r.actionReason,
      priorityRank: r.priorityRank,
      // Meta
      processedAt: r.processedAt?.toISOString(),
      processingDurationMs: r.processingDurationMs,
      autopilotRun: r.autopilotRun,
    }));

    res.json({
      success: true,
      total,
      items,
      meta: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error("[Precision Leads] List error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════
// GET /api/precision-leads/stats — Aggregate stats
// ═══════════════════════════════════════════════
router.get("/api/precision-leads/stats", requireAuth, async (_req: Request, res: Response) => {
  try {
    const verdictCounts = await db
      .select({
        verdict: precisionLeadAnalyses.verdict,
        count: sql<number>`count(*)`,
        avgConfidence: sql<number>`round(avg(${precisionLeadAnalyses.consensusConfidence}))`,
        avgIntent: sql<number>`round(avg(${precisionLeadAnalyses.consensusIntentScore}))`,
      })
      .from(precisionLeadAnalyses)
      .groupBy(precisionLeadAnalyses.verdict);

    const actionCounts = await db
      .select({
        action: precisionLeadAnalyses.recommendedAction,
        count: sql<number>`count(*)`,
      })
      .from(precisionLeadAnalyses)
      .groupBy(precisionLeadAnalyses.recommendedAction);

    const overrideCounts = await db
      .select({
        overridden: sql<number>`count(*) filter (where ${precisionLeadAnalyses.overrideDisposition} = true)`,
        total: sql<number>`count(*)`,
      })
      .from(precisionLeadAnalyses);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(precisionLeadAnalyses);

    const [recentRow] = await db
      .select({
        lastProcessed: sql<string>`max(${precisionLeadAnalyses.processedAt})`,
        avgDuration: sql<number>`round(avg(${precisionLeadAnalyses.processingDurationMs}))`,
      })
      .from(precisionLeadAnalyses);

    res.json({
      success: true,
      stats: {
        total: Number(totalRow?.count || 0),
        verdictBreakdown: verdictCounts.map((v) => ({
          verdict: v.verdict,
          count: Number(v.count),
          avgConfidence: Number(v.avgConfidence || 0),
          avgIntent: Number(v.avgIntent || 0),
        })),
        actionBreakdown: actionCounts.map((a) => ({
          action: a.action,
          count: Number(a.count),
        })),
        dispositionOverrides: {
          overridden: Number(overrideCounts[0]?.overridden || 0),
          total: Number(overrideCounts[0]?.total || 0),
        },
        lastProcessed: recentRow?.lastProcessed || null,
        avgProcessingMs: Number(recentRow?.avgDuration || 0),
      },
    });
  } catch (error: any) {
    console.error("[Precision Leads] Stats error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════
// POST /api/precision-leads/analyze — Analyze single call
// ═══════════════════════════════════════════════
router.post("/api/precision-leads/analyze", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.body;
    if (!callSessionId) {
      return res.status(400).json({ success: false, message: "callSessionId required" });
    }

    const result = await analyzePrecisionLead(callSessionId);
    res.json(result);
  } catch (error: any) {
    console.error("[Precision Leads] Analyze error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════
// POST /api/precision-leads/autopilot — Trigger batch
// ═══════════════════════════════════════════════
router.post("/api/precision-leads/autopilot", requireAuth, async (req: Request, res: Response) => {
  try {
    const { batchSize, campaignId } = req.body;
    const result = await runPrecisionAutopilot({
      batchSize: batchSize || 25,
      campaignId: campaignId || undefined,
      maxDurationMs: 5 * 60 * 1000,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Precision Leads] Autopilot error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════
// POST /api/precision-leads/qualify — Trigger qualification bridge
// ═══════════════════════════════════════════════
router.post("/api/precision-leads/qualify", requireAuth, async (req: Request, res: Response) => {
  try {
    const { batchSize, campaignId } = req.body;
    const result = await runQualificationBridge({
      batchSize: batchSize || 30,
      campaignId: campaignId || undefined,
      maxDurationMs: 4 * 60 * 1000,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Precision Leads] Qualification bridge error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════
// GET /api/precision-leads/learning — Get learning stats
// ═══════════════════════════════════════════════
router.get("/api/precision-leads/learning", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.query;
    const stats = await getLearningStats(campaignId as string | undefined);
    res.json({ success: true, ...stats });
  } catch (error: any) {
    console.error("[Precision Leads] Learning stats error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;