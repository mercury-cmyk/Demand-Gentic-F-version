/**
 * UNLICENSED DEPARTMENT: Lead Quality & Outcome Analysis Routes
 *
 * API endpoints for the Lead Quality Department.
 * Serves dashboard data, assessment listings, and manual re-analysis triggers.
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import {
  leadQualityAssessments,
  campaigns,
  callSessions,
} from "@shared/schema";
import { eq, desc, and, gte, lte, sql, count, avg, isNotNull } from "drizzle-orm";

const router = Router();

/**
 * GET /lead-quality/dashboard
 * Aggregated dashboard data for the Lead Quality Department
 */
router.get("/lead-quality/dashboard", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId, dateFrom, dateTo } = req.query;

    const conditions: any[] = [];
    if (campaignId && typeof campaignId === "string") {
      conditions.push(eq(leadQualityAssessments.campaignId, campaignId));
    }
    if (dateFrom && typeof dateFrom === "string") {
      conditions.push(gte(leadQualityAssessments.createdAt, new Date(dateFrom)));
    }
    if (dateTo && typeof dateTo === "string") {
      conditions.push(lte(leadQualityAssessments.createdAt, new Date(dateTo)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Aggregate stats
    const [stats] = await db
      .select({
        totalAssessments: count(),
        avgQualificationScore: avg(leadQualityAssessments.leadQualificationScore),
        avgCampaignFitScore: avg(leadQualityAssessments.campaignFitScore),
        avgJobTitleAlignment: avg(leadQualityAssessments.jobTitleAlignment),
        avgIndustryAlignment: avg(leadQualityAssessments.industryAlignment),
        avgCompanySizeFit: avg(leadQualityAssessments.companySizeFit),
        avgBudgetIndicators: avg(leadQualityAssessments.budgetIndicators),
        avgAuthorityLevel: avg(leadQualityAssessments.authorityLevel),
        avgTimelineSignals: avg(leadQualityAssessments.timelineSignals),
        avgPainPointAlignment: avg(leadQualityAssessments.painPointAlignment),
        qualifiedCount: sql<number>`count(*) filter (where ${leadQualityAssessments.outcomeCategory} in ('qualified_lead', 'mql', 'sql'))`,
        interestedCount: sql<number>`count(*) filter (where ${leadQualityAssessments.prospectInterested} = true)`,
        dispositionAccurateCount: sql<number>`count(*) filter (where ${leadQualityAssessments.dispositionAccurate} = true)`,
      })
      .from(leadQualityAssessments)
      .where(whereClause);

    const totalAssessments = Number(stats?.totalAssessments || 0);
    const qualificationRate = totalAssessments > 0
      ? Math.round(((stats?.qualifiedCount || 0) / totalAssessments) * 100)
      : 0;

    // Outcome category distribution
    const outcomeDistribution = await db
      .select({
        outcomeCategory: leadQualityAssessments.outcomeCategory,
        count: count(),
      })
      .from(leadQualityAssessments)
      .where(whereClause)
      .groupBy(leadQualityAssessments.outcomeCategory);

    // Intent strength distribution
    const intentDistribution = await db
      .select({
        intentStrength: leadQualityAssessments.intentStrength,
        count: count(),
      })
      .from(leadQualityAssessments)
      .where(and(whereClause, isNotNull(leadQualityAssessments.intentStrength)))
      .groupBy(leadQualityAssessments.intentStrength);

    // CRM action distribution
    const crmActionDistribution = await db
      .select({
        action: leadQualityAssessments.recommendedCrmAction,
        count: count(),
      })
      .from(leadQualityAssessments)
      .where(and(whereClause, isNotNull(leadQualityAssessments.recommendedCrmAction)))
      .groupBy(leadQualityAssessments.recommendedCrmAction);

    // Qualification score trend (daily)
    const qualificationTrend = await db
      .select({
        date: sql<string>`date_trunc('day', ${leadQualityAssessments.createdAt})::date::text`,
        avgScore: avg(leadQualityAssessments.leadQualificationScore),
        avgCampaignFit: avg(leadQualityAssessments.campaignFitScore),
        assessmentCount: count(),
        qualifiedCount: sql<number>`count(*) filter (where ${leadQualityAssessments.outcomeCategory} in ('qualified_lead', 'mql', 'sql'))`,
      })
      .from(leadQualityAssessments)
      .where(and(
        whereClause,
        gte(leadQualityAssessments.createdAt, sql`now() - interval '30 days'`)
      ))
      .groupBy(sql`date_trunc('day', ${leadQualityAssessments.createdAt})`)
      .orderBy(sql`date_trunc('day', ${leadQualityAssessments.createdAt})`);

    // Intent strength by campaign (heatmap data)
    const intentByCampaign = await db
      .select({
        campaignId: leadQualityAssessments.campaignId,
        intentStrength: leadQualityAssessments.intentStrength,
        count: count(),
      })
      .from(leadQualityAssessments)
      .where(and(
        whereClause,
        isNotNull(leadQualityAssessments.campaignId),
        isNotNull(leadQualityAssessments.intentStrength)
      ))
      .groupBy(leadQualityAssessments.campaignId, leadQualityAssessments.intentStrength);

    // Status distribution
    const statusDistribution = await db
      .select({
        status: leadQualityAssessments.status,
        count: count(),
      })
      .from(leadQualityAssessments)
      .where(whereClause)
      .groupBy(leadQualityAssessments.status);

    // Disposition accuracy rate
    const dispositionAccuracyRate = totalAssessments > 0
      ? Math.round(((stats?.dispositionAccurateCount || 0) / totalAssessments) * 100)
      : null;

    res.json({
      stats: {
        totalAssessments,
        avgQualificationScore: stats?.avgQualificationScore ? Math.round(Number(stats.avgQualificationScore)) : null,
        avgCampaignFitScore: stats?.avgCampaignFitScore ? Math.round(Number(stats.avgCampaignFitScore)) : null,
        qualificationRate,
        dispositionAccuracyRate,
        avgJobTitleAlignment: stats?.avgJobTitleAlignment ? Math.round(Number(stats.avgJobTitleAlignment)) : null,
        avgIndustryAlignment: stats?.avgIndustryAlignment ? Math.round(Number(stats.avgIndustryAlignment)) : null,
        avgCompanySizeFit: stats?.avgCompanySizeFit ? Math.round(Number(stats.avgCompanySizeFit)) : null,
        avgBudgetIndicators: stats?.avgBudgetIndicators ? Math.round(Number(stats.avgBudgetIndicators)) : null,
        avgAuthorityLevel: stats?.avgAuthorityLevel ? Math.round(Number(stats.avgAuthorityLevel)) : null,
        avgTimelineSignals: stats?.avgTimelineSignals ? Math.round(Number(stats.avgTimelineSignals)) : null,
        avgPainPointAlignment: stats?.avgPainPointAlignment ? Math.round(Number(stats.avgPainPointAlignment)) : null,
      },
      qualificationTrend,
      outcomeDistribution,
      intentDistribution,
      crmActionDistribution,
      intentByCampaign,
      statusDistribution,
    });
  } catch (error: any) {
    console.error(`[UnlicensedLeadQuality] Dashboard error: ${error.message}`);
    res.status(500).json({ error: "Failed to load lead quality dashboard" });
  }
});

/**
 * GET /lead-quality/assessments
 * List assessments with filters
 */
router.get("/lead-quality/assessments", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      campaignId,
      dateFrom,
      dateTo,
      outcomeCategory,
      intentStrength,
      minScore,
      maxScore,
      limit: limitParam,
      offset: offsetParam,
    } = req.query;

    const conditions: any[] = [];
    if (campaignId && typeof campaignId === "string") {
      conditions.push(eq(leadQualityAssessments.campaignId, campaignId));
    }
    if (dateFrom && typeof dateFrom === "string") {
      conditions.push(gte(leadQualityAssessments.createdAt, new Date(dateFrom)));
    }
    if (dateTo && typeof dateTo === "string") {
      conditions.push(lte(leadQualityAssessments.createdAt, new Date(dateTo)));
    }
    if (outcomeCategory && typeof outcomeCategory === "string") {
      conditions.push(eq(leadQualityAssessments.outcomeCategory, outcomeCategory));
    }
    if (intentStrength && typeof intentStrength === "string") {
      conditions.push(eq(leadQualityAssessments.intentStrength, intentStrength as any));
    }
    if (minScore && typeof minScore === "string") {
      conditions.push(gte(leadQualityAssessments.leadQualificationScore, parseInt(minScore)));
    }
    if (maxScore && typeof maxScore === "string") {
      conditions.push(lte(leadQualityAssessments.leadQualificationScore, parseInt(maxScore)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = Math.min(parseInt(String(limitParam)) || 50, 100);
    const offset = parseInt(String(offsetParam)) || 0;

    const [totalResult] = await db
      .select({ total: count() })
      .from(leadQualityAssessments)
      .where(whereClause);

    const assessments = await db
      .select({
        id: leadQualityAssessments.id,
        callSessionId: leadQualityAssessments.callSessionId,
        campaignId: leadQualityAssessments.campaignId,
        contactId: leadQualityAssessments.contactId,
        leadId: leadQualityAssessments.leadId,
        status: leadQualityAssessments.status,
        leadQualificationScore: leadQualityAssessments.leadQualificationScore,
        campaignFitScore: leadQualityAssessments.campaignFitScore,
        intentStrength: leadQualityAssessments.intentStrength,
        outcomeCategory: leadQualityAssessments.outcomeCategory,
        prospectInterested: leadQualityAssessments.prospectInterested,
        dispositionAccurate: leadQualityAssessments.dispositionAccurate,
        suggestedDisposition: leadQualityAssessments.suggestedDisposition,
        recommendedCrmAction: leadQualityAssessments.recommendedCrmAction,
        jobTitleAlignment: leadQualityAssessments.jobTitleAlignment,
        industryAlignment: leadQualityAssessments.industryAlignment,
        companySizeFit: leadQualityAssessments.companySizeFit,
        budgetIndicators: leadQualityAssessments.budgetIndicators,
        authorityLevel: leadQualityAssessments.authorityLevel,
        timelineSignals: leadQualityAssessments.timelineSignals,
        painPointAlignment: leadQualityAssessments.painPointAlignment,
        summary: leadQualityAssessments.summary,
        createdAt: leadQualityAssessments.createdAt,
      })
      .from(leadQualityAssessments)
      .where(whereClause)
      .orderBy(desc(leadQualityAssessments.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      assessments,
      total: Number(totalResult?.total || 0),
      limit,
      offset,
    });
  } catch (error: any) {
    console.error(`[UnlicensedLeadQuality] List error: ${error.message}`);
    res.status(500).json({ error: "Failed to list lead quality assessments" });
  }
});

/**
 * GET /lead-quality/assessments/:id
 * Single assessment detail
 */
router.get("/lead-quality/assessments/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [assessment] = await db
      .select()
      .from(leadQualityAssessments)
      .where(eq(leadQualityAssessments.id, id))
      .limit(1);

    if (!assessment) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    res.json({ assessment });
  } catch (error: any) {
    console.error(`[UnlicensedLeadQuality] Detail error: ${error.message}`);
    res.status(500).json({ error: "Failed to load assessment" });
  }
});

/**
 * POST /lead-quality/analyze/:callSessionId
 * Trigger manual re-analysis for a specific call
 */
router.post("/lead-quality/analyze/:callSessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;

    const [session] = await db
      .select({
        id: callSessions.id,
        campaignId: callSessions.campaignId,
        contactId: callSessions.contactId,
        durationSec: callSessions.durationSec,
      })
      .from(callSessions)
      .where(eq(callSessions.id, callSessionId))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: "Call session not found" });
    }

    const { analyzeLeadQualityDepartment } = await import(
      "../services/ai-lead-quality-department"
    );

    // Get transcript
    const { callQualityRecords } = await import("@shared/schema");
    const [qualityRecord] = await db
      .select({ transcript: callQualityRecords.fullTranscript })
      .from(callQualityRecords)
      .where(eq(callQualityRecords.callSessionId, callSessionId))
      .limit(1);

    const transcript = qualityRecord?.transcript;
    if (!transcript) {
      return res.status(400).json({ error: "No transcript available for this call session" });
    }

    const result = await analyzeLeadQualityDepartment({
      transcript,
      callSessionId,
      campaignId: session.campaignId || undefined,
      contactId: session.contactId || undefined,
      callDurationSec: session.durationSec || undefined,
    });

    res.json({ result });
  } catch (error: any) {
    console.error(`[UnlicensedLeadQuality] Analyze error: ${error.message}`);
    res.status(500).json({ error: "Failed to analyze call session" });
  }
});

export default router;
