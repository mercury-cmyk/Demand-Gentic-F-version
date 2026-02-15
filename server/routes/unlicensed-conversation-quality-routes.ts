/**
 * UNLICENSED DEPARTMENT: Conversation Quality Routes
 *
 * API endpoints for the Conversation Quality Department.
 * Serves dashboard data, assessment listings, and manual re-analysis triggers.
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import {
  conversationQualityAssessments,
  campaigns,
  contacts,
  callSessions,
} from "@shared/schema";
import { eq, desc, and, gte, lte, sql, count, avg, between, isNotNull } from "drizzle-orm";

const router = Router();

/**
 * GET /conversation-quality/dashboard
 * Aggregated dashboard data for the Conversation Quality Department
 */
router.get("/conversation-quality/dashboard", requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId, dateFrom, dateTo } = req.query;

    const conditions: any[] = [];
    if (campaignId && typeof campaignId === "string") {
      conditions.push(eq(conversationQualityAssessments.campaignId, campaignId));
    }
    if (dateFrom && typeof dateFrom === "string") {
      conditions.push(gte(conversationQualityAssessments.createdAt, new Date(dateFrom)));
    }
    if (dateTo && typeof dateTo === "string") {
      conditions.push(lte(conversationQualityAssessments.createdAt, new Date(dateTo)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Aggregate stats
    const [stats] = await db
      .select({
        totalAssessments: count(),
        avgCqs: avg(conversationQualityAssessments.conversationQualityScore),
        avgTechnicalIntegrity: avg(conversationQualityAssessments.technicalIntegrityScore),
        avgCompliance: avg(conversationQualityAssessments.complianceScore),
        avgBehavioral: avg(conversationQualityAssessments.behavioralScore),
        avgTone: avg(conversationQualityAssessments.toneScore),
        avgNaturalness: avg(conversationQualityAssessments.naturalnessScore),
        avgConfidence: avg(conversationQualityAssessments.confidenceScore),
        avgScriptAdherence: avg(conversationQualityAssessments.scriptAdherenceScore),
        avgGatekeeperProtocol: avg(conversationQualityAssessments.gatekeeperProtocolScore),
        avgObjectionHandling: avg(conversationQualityAssessments.objectionHandlingLogicScore),
      })
      .from(conversationQualityAssessments)
      .where(whereClause);

    // Voicemail detection accuracy
    const [voicemailStats] = await db
      .select({
        total: count(),
        accurate: sql<number>`count(*) filter (where ${conversationQualityAssessments.voicemailDetectionAccurate} = true)`,
      })
      .from(conversationQualityAssessments)
      .where(and(
        whereClause,
        isNotNull(conversationQualityAssessments.voicemailDetectionAccurate)
      ));

    // Technical error count (calls with technical issues)
    const [techErrorStats] = await db
      .select({
        total: count(),
        withErrors: sql<number>`count(*) filter (where jsonb_array_length(${conversationQualityAssessments.technicalIssues}::jsonb) > 0)`,
      })
      .from(conversationQualityAssessments)
      .where(whereClause);

    // CQS trend (daily averages for last 30 days)
    const cqsTrend = await db
      .select({
        date: sql<string>`date_trunc('day', ${conversationQualityAssessments.createdAt})::date::text`,
        avgCqs: avg(conversationQualityAssessments.conversationQualityScore),
        assessmentCount: count(),
      })
      .from(conversationQualityAssessments)
      .where(and(
        whereClause,
        gte(conversationQualityAssessments.createdAt, sql`now() - interval '30 days'`)
      ))
      .groupBy(sql`date_trunc('day', ${conversationQualityAssessments.createdAt})`)
      .orderBy(sql`date_trunc('day', ${conversationQualityAssessments.createdAt})`);

    // Recent flagged issues
    const recentFlags = await db
      .select({
        id: conversationQualityAssessments.id,
        callSessionId: conversationQualityAssessments.callSessionId,
        campaignId: conversationQualityAssessments.campaignId,
        conversationQualityScore: conversationQualityAssessments.conversationQualityScore,
        issueFlags: conversationQualityAssessments.issueFlags,
        summary: conversationQualityAssessments.summary,
        createdAt: conversationQualityAssessments.createdAt,
      })
      .from(conversationQualityAssessments)
      .where(and(
        whereClause,
        eq(conversationQualityAssessments.status, "flagged")
      ))
      .orderBy(desc(conversationQualityAssessments.createdAt))
      .limit(20);

    // Status distribution
    const statusDistribution = await db
      .select({
        status: conversationQualityAssessments.status,
        count: count(),
      })
      .from(conversationQualityAssessments)
      .where(whereClause)
      .groupBy(conversationQualityAssessments.status);

    const voicemailAccuracy = voicemailStats?.total
      ? Math.round(((voicemailStats.accurate || 0) / Number(voicemailStats.total)) * 100)
      : null;

    const technicalErrorRate = techErrorStats?.total
      ? Math.round(((techErrorStats.withErrors || 0) / Number(techErrorStats.total)) * 100)
      : 0;

    res.json({
      stats: {
        totalAssessments: Number(stats?.totalAssessments || 0),
        avgCqs: stats?.avgCqs ? Math.round(Number(stats.avgCqs)) : null,
        avgTechnicalIntegrity: stats?.avgTechnicalIntegrity ? Math.round(Number(stats.avgTechnicalIntegrity)) : null,
        avgCompliance: stats?.avgCompliance ? Math.round(Number(stats.avgCompliance)) : null,
        avgBehavioral: stats?.avgBehavioral ? Math.round(Number(stats.avgBehavioral)) : null,
        avgTone: stats?.avgTone ? Math.round(Number(stats.avgTone)) : null,
        avgNaturalness: stats?.avgNaturalness ? Math.round(Number(stats.avgNaturalness)) : null,
        avgConfidence: stats?.avgConfidence ? Math.round(Number(stats.avgConfidence)) : null,
        avgScriptAdherence: stats?.avgScriptAdherence ? Math.round(Number(stats.avgScriptAdherence)) : null,
        avgGatekeeperProtocol: stats?.avgGatekeeperProtocol ? Math.round(Number(stats.avgGatekeeperProtocol)) : null,
        avgObjectionHandling: stats?.avgObjectionHandling ? Math.round(Number(stats.avgObjectionHandling)) : null,
        voicemailAccuracy,
        technicalErrorRate,
      },
      cqsTrend,
      recentFlags,
      statusDistribution,
    });
  } catch (error: any) {
    console.error(`[UnlicensedConvQuality] Dashboard error: ${error.message}`);
    res.status(500).json({ error: "Failed to load conversation quality dashboard" });
  }
});

/**
 * GET /conversation-quality/assessments
 * List assessments with filters
 */
router.get("/conversation-quality/assessments", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      campaignId,
      dateFrom,
      dateTo,
      minScore,
      maxScore,
      status,
      limit: limitParam,
      offset: offsetParam,
    } = req.query;

    const conditions: any[] = [];
    if (campaignId && typeof campaignId === "string") {
      conditions.push(eq(conversationQualityAssessments.campaignId, campaignId));
    }
    if (dateFrom && typeof dateFrom === "string") {
      conditions.push(gte(conversationQualityAssessments.createdAt, new Date(dateFrom)));
    }
    if (dateTo && typeof dateTo === "string") {
      conditions.push(lte(conversationQualityAssessments.createdAt, new Date(dateTo)));
    }
    if (minScore && typeof minScore === "string") {
      conditions.push(gte(conversationQualityAssessments.conversationQualityScore, parseInt(minScore)));
    }
    if (maxScore && typeof maxScore === "string") {
      conditions.push(lte(conversationQualityAssessments.conversationQualityScore, parseInt(maxScore)));
    }
    if (status && typeof status === "string") {
      conditions.push(eq(conversationQualityAssessments.status, status as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = Math.min(parseInt(String(limitParam)) || 50, 100);
    const offset = parseInt(String(offsetParam)) || 0;

    const [totalResult] = await db
      .select({ total: count() })
      .from(conversationQualityAssessments)
      .where(whereClause);

    const assessments = await db
      .select({
        id: conversationQualityAssessments.id,
        callSessionId: conversationQualityAssessments.callSessionId,
        campaignId: conversationQualityAssessments.campaignId,
        contactId: conversationQualityAssessments.contactId,
        status: conversationQualityAssessments.status,
        conversationQualityScore: conversationQualityAssessments.conversationQualityScore,
        technicalIntegrityScore: conversationQualityAssessments.technicalIntegrityScore,
        complianceScore: conversationQualityAssessments.complianceScore,
        behavioralScore: conversationQualityAssessments.behavioralScore,
        toneScore: conversationQualityAssessments.toneScore,
        naturalnessScore: conversationQualityAssessments.naturalnessScore,
        confidenceScore: conversationQualityAssessments.confidenceScore,
        scriptAdherenceScore: conversationQualityAssessments.scriptAdherenceScore,
        roboticRepetitionFlag: conversationQualityAssessments.roboticRepetitionFlag,
        unauthorizedImprovisationFlag: conversationQualityAssessments.unauthorizedImprovisationFlag,
        voicemailDetectionAccurate: conversationQualityAssessments.voicemailDetectionAccurate,
        dispositionCorrect: conversationQualityAssessments.dispositionCorrect,
        issueFlags: conversationQualityAssessments.issueFlags,
        summary: conversationQualityAssessments.summary,
        createdAt: conversationQualityAssessments.createdAt,
      })
      .from(conversationQualityAssessments)
      .where(whereClause)
      .orderBy(desc(conversationQualityAssessments.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      assessments,
      total: Number(totalResult?.total || 0),
      limit,
      offset,
    });
  } catch (error: any) {
    console.error(`[UnlicensedConvQuality] List error: ${error.message}`);
    res.status(500).json({ error: "Failed to list conversation quality assessments" });
  }
});

/**
 * GET /conversation-quality/assessments/:id
 * Single assessment detail
 */
router.get("/conversation-quality/assessments/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [assessment] = await db
      .select()
      .from(conversationQualityAssessments)
      .where(eq(conversationQualityAssessments.id, id))
      .limit(1);

    if (!assessment) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    res.json({ assessment });
  } catch (error: any) {
    console.error(`[UnlicensedConvQuality] Detail error: ${error.message}`);
    res.status(500).json({ error: "Failed to load assessment" });
  }
});

/**
 * POST /conversation-quality/analyze/:callSessionId
 * Trigger manual re-analysis for a specific call
 */
router.post("/conversation-quality/analyze/:callSessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;

    // Fetch call session data
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

    // Get transcript from existing quality records or call session
    const { analyzeConversationQualityDepartment } = await import(
      "../services/ai-conversation-quality-department"
    );

    // Try to find transcript from call quality records
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

    const result = await analyzeConversationQualityDepartment({
      transcript,
      callSessionId,
      campaignId: session.campaignId || undefined,
      contactId: session.contactId || undefined,
      callDurationSec: session.durationSec || undefined,
    });

    res.json({ result });
  } catch (error: any) {
    console.error(`[UnlicensedConvQuality] Analyze error: ${error.message}`);
    res.status(500).json({ error: "Failed to analyze call session" });
  }
});

export default router;
