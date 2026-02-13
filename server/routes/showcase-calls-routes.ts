/**
 * Showcase Calls Routes
 *
 * API endpoints for identifying, pinning, and browsing the best AI agent
 * call performances — regardless of call outcome. Used for client demos
 * to demonstrate professional call handling across all situations.
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  callQualityRecords,
  callSessions,
  campaigns,
  contacts,
  accounts,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte, isNotNull, count as drizzleCount } from "drizzle-orm";
import { requireAuth } from "../auth";
import { getCallSessionRecordingUrl } from "../services/recording-storage";

const router = Router();

// Showcase categories
const SHOWCASE_CATEGORIES = [
  'objection_handling',
  'professional_close',
  'engagement_mastery',
  'difficult_situation',
  'perfect_flow',
  'empathetic_response',
] as const;

// ============================================================================
// HELPERS
// ============================================================================

// Dispositions that are NOT real conversations — exclude from showcase
const NON_CONVERSATION_DISPOSITIONS = [
  'voicemail', 'no_answer', 'no answer', 'no contact', 'no_contact',
  'busy', 'invalid_data', 'wrong_number', 'disconnected',
  'system failure', 'system_failure', 'system error', 'system_error',
  'technical issue', 'technical_issue', 'unknown', 'needs_review',
  'dnc-request', 'dnc_request', 'do_not_call', 'removed',
  'answering machine', 'reached voicemail', 'fax', 'callback',
];

/** SQL filter to exclude voicemails and non-conversation dispositions */
function realConversationFilter() {
  // Case-insensitive match against non-conversation patterns
  return sql`(
    LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT IN (${sql.join(
      NON_CONVERSATION_DISPOSITIONS.map(d => sql`${d}`),
      sql`, `
    )})
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%voicemail%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%no answer%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%no_answer%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%system%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%fax%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%answering machine%'
  )`;
}

function buildFilters(query: any) {
  const conditions: any[] = [
    isNotNull(callQualityRecords.overallQualityScore),
  ];

  if (query.campaignId && query.campaignId !== 'all') {
    conditions.push(eq(callQualityRecords.campaignId, query.campaignId as string));
  }
  if (query.startDate) {
    conditions.push(gte(callQualityRecords.createdAt, new Date(query.startDate as string)));
  }
  if (query.endDate) {
    conditions.push(lte(callQualityRecords.createdAt, new Date(query.endDate as string)));
  }
  if (query.minScore) {
    conditions.push(gte(callQualityRecords.overallQualityScore, parseInt(query.minScore as string, 10)));
  }
  if (query.category && query.category !== 'all') {
    conditions.push(eq(callQualityRecords.showcaseCategory, query.category as string));
  }
  if (query.disposition && query.disposition !== 'all') {
    conditions.push(eq(callQualityRecords.assignedDisposition, query.disposition as string));
  }

  return and(...conditions);
}

/** Weighted agent performance score (behavior, not outcomes) */
function agentPerformanceScoreSql() {
  return sql<number>`
    COALESCE(${callQualityRecords.engagementScore}, 0) * 0.20 +
    COALESCE(${callQualityRecords.clarityScore}, 0) * 0.20 +
    COALESCE(${callQualityRecords.empathyScore}, 0) * 0.25 +
    COALESCE(${callQualityRecords.objectionHandlingScore}, 0) * 0.20 +
    COALESCE(${callQualityRecords.flowComplianceScore}, 0) * 0.15
  `;
}

// ============================================================================
// GET / — List pinned showcase calls
// ============================================================================

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const whereClause = and(
      buildFilters(req.query),
      eq(callQualityRecords.isShowcase, true),
    );

    // Count total
    const [{ total }] = await db
      .select({ total: drizzleCount() })
      .from(callQualityRecords)
      .where(whereClause);

    // Fetch calls
    const rows = await db
      .select({
        id: callQualityRecords.id,
        callSessionId: callQualityRecords.callSessionId,
        campaignId: callQualityRecords.campaignId,
        campaignName: campaigns.name,
        contactName: sql<string>`coalesce(${contacts.fullName}, concat(${contacts.firstName}, ' ', ${contacts.lastName}), 'Unknown')`,
        accountName: accounts.name,
        overallScore: callQualityRecords.overallQualityScore,
        engagementScore: callQualityRecords.engagementScore,
        clarityScore: callQualityRecords.clarityScore,
        empathyScore: callQualityRecords.empathyScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        flowComplianceScore: callQualityRecords.flowComplianceScore,
        closingScore: callQualityRecords.closingScore,
        sentiment: callQualityRecords.sentiment,
        assignedDisposition: callQualityRecords.assignedDisposition,
        showcaseCategory: callQualityRecords.showcaseCategory,
        showcaseNotes: callQualityRecords.showcaseNotes,
        showcasedAt: callQualityRecords.showcasedAt,
        durationSec: callSessions.durationSec,
        recordingStatus: callSessions.recordingStatus,
        recordingS3Key: callSessions.recordingS3Key,
        agentType: callSessions.agentType,
        startedAt: callSessions.startedAt,
        transcriptExcerpt: sql<string>`LEFT(${callQualityRecords.fullTranscript}, 200)`,
        agentPerformanceScore: agentPerformanceScoreSql(),
        createdAt: callQualityRecords.createdAt,
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .leftJoin(contacts, eq(callQualityRecords.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callQualityRecords.campaignId, campaigns.id))
      .where(whereClause)
      .orderBy(desc(agentPerformanceScoreSql()))
      .limit(limit)
      .offset(offset);

    res.json({
      calls: rows.map(r => ({
        ...r,
        hasRecording: !!(r.recordingS3Key),
        agentPerformanceScore: Math.round(Number(r.agentPerformanceScore) || 0),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[ShowcaseCalls] List error:', error);
    res.status(500).json({ error: 'Failed to load showcase calls' });
  }
});

// ============================================================================
// GET /auto-detect — Find showcase candidates (not yet pinned)
// ============================================================================

router.get("/auto-detect", requireAuth, async (req: Request, res: Response) => {
  try {
    const threshold = parseInt(req.query.threshold as string, 10) || 75;
    const limitCount = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const baseFilters = buildFilters(req.query);

    const candidates = await db
      .select({
        id: callQualityRecords.id,
        callSessionId: callQualityRecords.callSessionId,
        campaignId: callQualityRecords.campaignId,
        campaignName: campaigns.name,
        contactName: sql<string>`coalesce(${contacts.fullName}, concat(${contacts.firstName}, ' ', ${contacts.lastName}), 'Unknown')`,
        accountName: accounts.name,
        overallScore: callQualityRecords.overallQualityScore,
        engagementScore: callQualityRecords.engagementScore,
        clarityScore: callQualityRecords.clarityScore,
        empathyScore: callQualityRecords.empathyScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        flowComplianceScore: callQualityRecords.flowComplianceScore,
        closingScore: callQualityRecords.closingScore,
        sentiment: callQualityRecords.sentiment,
        assignedDisposition: callQualityRecords.assignedDisposition,
        durationSec: callSessions.durationSec,
        recordingStatus: callSessions.recordingStatus,
        recordingS3Key: callSessions.recordingS3Key,
        agentType: callSessions.agentType,
        startedAt: callSessions.startedAt,
        transcriptExcerpt: sql<string>`LEFT(${callQualityRecords.fullTranscript}, 200)`,
        agentPerformanceScore: agentPerformanceScoreSql(),
        createdAt: callQualityRecords.createdAt,
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .leftJoin(contacts, eq(callQualityRecords.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callQualityRecords.campaignId, campaigns.id))
      .where(and(
        baseFilters,
        // Not already showcased
        sql`(${callQualityRecords.isShowcase} IS NULL OR ${callQualityRecords.isShowcase} = false)`,
        // Must have recording stored
        eq(callSessions.recordingStatus, 'stored'),
        // Must have transcript
        isNotNull(callQualityRecords.fullTranscript),
        // EXCLUDE voicemails & non-conversations
        realConversationFilter(),
        // Must have real engagement (voicemails have 0)
        gte(callQualityRecords.engagementScore, 20),
        // Must be a real conversation (30s+)
        gte(callSessions.durationSec, 30),
        // Agent performance threshold
        sql`(
          COALESCE(${callQualityRecords.engagementScore}, 0) * 0.20 +
          COALESCE(${callQualityRecords.clarityScore}, 0) * 0.20 +
          COALESCE(${callQualityRecords.empathyScore}, 0) * 0.25 +
          COALESCE(${callQualityRecords.objectionHandlingScore}, 0) * 0.20 +
          COALESCE(${callQualityRecords.flowComplianceScore}, 0) * 0.15
        ) >= ${threshold}`,
      ))
      .orderBy(desc(agentPerformanceScoreSql()))
      .limit(limitCount);

    // Suggest a category for each candidate based on their highest dimension
    const enriched = candidates.map(c => {
      const dimensions: Record<string, number> = {
        objection_handling: c.objectionHandlingScore ?? 0,
        empathetic_response: c.empathyScore ?? 0,
        engagement_mastery: c.engagementScore ?? 0,
        perfect_flow: c.flowComplianceScore ?? 0,
        professional_close: c.closingScore ?? 0,
      };
      const topDimension = Object.entries(dimensions).sort((a, b) => b[1] - a[1])[0];

      return {
        ...c,
        hasRecording: !!(c.recordingS3Key),
        agentPerformanceScore: Math.round(Number(c.agentPerformanceScore) || 0),
        suggestedCategory: topDimension[0],
      };
    });

    res.json({ candidates: enriched, threshold });
  } catch (error: any) {
    console.error('[ShowcaseCalls] Auto-detect error:', error);
    res.status(500).json({ error: 'Failed to auto-detect showcase calls' });
  }
});

// ============================================================================
// GET /stats — Summary statistics
// ============================================================================

router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    // Showcase-specific stats (pinned calls only)
    const showcaseWhere = and(
      buildFilters(req.query),
      eq(callQualityRecords.isShowcase, true),
    );

    const [showcaseStats] = await db
      .select({
        total: drizzleCount(),
        avgOverall: sql<number>`ROUND(AVG(${callQualityRecords.overallQualityScore}))`,
        avgEngagement: sql<number>`ROUND(AVG(${callQualityRecords.engagementScore}))`,
        avgClarity: sql<number>`ROUND(AVG(${callQualityRecords.clarityScore}))`,
        avgEmpathy: sql<number>`ROUND(AVG(${callQualityRecords.empathyScore}))`,
        avgObjectionHandling: sql<number>`ROUND(AVG(${callQualityRecords.objectionHandlingScore}))`,
        avgFlowCompliance: sql<number>`ROUND(AVG(${callQualityRecords.flowComplianceScore}))`,
      })
      .from(callQualityRecords)
      .where(showcaseWhere);

    // Overall real-conversation stats (for context when nothing pinned yet)
    const [conversationStats] = await db
      .select({
        totalConversations: drizzleCount(),
        avgScore: sql<number>`ROUND(AVG(${callQualityRecords.overallQualityScore}))`,
        highPerformers: sql<number>`COUNT(CASE WHEN (
          COALESCE(${callQualityRecords.engagementScore}, 0) * 0.20 +
          COALESCE(${callQualityRecords.clarityScore}, 0) * 0.20 +
          COALESCE(${callQualityRecords.empathyScore}, 0) * 0.25 +
          COALESCE(${callQualityRecords.objectionHandlingScore}, 0) * 0.20 +
          COALESCE(${callQualityRecords.flowComplianceScore}, 0) * 0.15
        ) >= 75 THEN 1 END)`,
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .where(and(
        isNotNull(callQualityRecords.overallQualityScore),
        realConversationFilter(),
        gte(callQualityRecords.engagementScore, 20),
        gte(callSessions.durationSec, 30),
      ));

    // Category breakdown
    const categoryBreakdown = await db
      .select({
        category: callQualityRecords.showcaseCategory,
        count: drizzleCount(),
      })
      .from(callQualityRecords)
      .where(showcaseWhere)
      .groupBy(callQualityRecords.showcaseCategory);

    // Top campaigns with real conversations
    const topCampaigns = await db
      .select({
        campaignId: callQualityRecords.campaignId,
        campaignName: campaigns.name,
        count: drizzleCount(),
        avgScore: sql<number>`ROUND(AVG(${callQualityRecords.overallQualityScore}))`,
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .leftJoin(campaigns, eq(callQualityRecords.campaignId, campaigns.id))
      .where(and(
        isNotNull(callQualityRecords.overallQualityScore),
        realConversationFilter(),
        gte(callQualityRecords.engagementScore, 20),
        gte(callSessions.durationSec, 30),
      ))
      .groupBy(callQualityRecords.campaignId, campaigns.name)
      .orderBy(desc(sql`ROUND(AVG(${callQualityRecords.overallQualityScore}))`))
      .limit(5);

    res.json({
      total: showcaseStats.total,
      averages: {
        overall: showcaseStats.avgOverall ?? 0,
        engagement: showcaseStats.avgEngagement ?? 0,
        clarity: showcaseStats.avgClarity ?? 0,
        empathy: showcaseStats.avgEmpathy ?? 0,
        objectionHandling: showcaseStats.avgObjectionHandling ?? 0,
        flowCompliance: showcaseStats.avgFlowCompliance ?? 0,
      },
      byCategory: categoryBreakdown.filter(c => c.category).map(c => ({
        category: c.category,
        count: c.count,
      })),
      topCampaigns: topCampaigns.map(c => ({
        campaignId: c.campaignId,
        campaignName: c.campaignName ?? 'Unknown',
        count: c.count,
        avgScore: c.avgScore ?? 0,
      })),
      // Extra context: total real conversations and how many are high performers
      conversationPool: {
        totalConversations: conversationStats.totalConversations,
        avgScore: conversationStats.avgScore ?? 0,
        highPerformers: Number(conversationStats.highPerformers) || 0,
      },
    });
  } catch (error: any) {
    console.error('[ShowcaseCalls] Stats error:', error);
    res.status(500).json({ error: 'Failed to load showcase stats' });
  }
});

// ============================================================================
// GET /:callSessionId/details — Full details for a single showcase call
// ============================================================================

router.get("/:callSessionId/details", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;

    const [record] = await db
      .select({
        id: callQualityRecords.id,
        callSessionId: callQualityRecords.callSessionId,
        campaignId: callQualityRecords.campaignId,
        campaignName: campaigns.name,
        contactName: sql<string>`coalesce(${contacts.fullName}, concat(${contacts.firstName}, ' ', ${contacts.lastName}), 'Unknown')`,
        contactJobTitle: contacts.jobTitle,
        accountName: accounts.name,
        // Scores
        overallScore: callQualityRecords.overallQualityScore,
        engagementScore: callQualityRecords.engagementScore,
        clarityScore: callQualityRecords.clarityScore,
        empathyScore: callQualityRecords.empathyScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        qualificationScore: callQualityRecords.qualificationScore,
        closingScore: callQualityRecords.closingScore,
        flowComplianceScore: callQualityRecords.flowComplianceScore,
        campaignAlignmentScore: callQualityRecords.campaignAlignmentScore,
        contextUsageScore: callQualityRecords.contextUsageScore,
        talkingPointsCoverageScore: callQualityRecords.talkingPointsCoverageScore,
        // Intelligence
        sentiment: callQualityRecords.sentiment,
        engagementLevel: callQualityRecords.engagementLevel,
        identityConfirmed: callQualityRecords.identityConfirmed,
        qualificationMet: callQualityRecords.qualificationMet,
        // Disposition
        assignedDisposition: callQualityRecords.assignedDisposition,
        expectedDisposition: callQualityRecords.expectedDisposition,
        dispositionAccurate: callQualityRecords.dispositionAccurate,
        // Transcript
        fullTranscript: callQualityRecords.fullTranscript,
        // Analysis
        issues: callQualityRecords.issues,
        recommendations: callQualityRecords.recommendations,
        nextBestActions: callQualityRecords.nextBestActions,
        missedTalkingPoints: callQualityRecords.missedTalkingPoints,
        flowDeviations: callQualityRecords.flowDeviations,
        // Showcase
        isShowcase: callQualityRecords.isShowcase,
        showcaseCategory: callQualityRecords.showcaseCategory,
        showcaseNotes: callQualityRecords.showcaseNotes,
        showcasedAt: callQualityRecords.showcasedAt,
        // Session
        durationSec: callSessions.durationSec,
        recordingStatus: callSessions.recordingStatus,
        recordingS3Key: callSessions.recordingS3Key,
        agentType: callSessions.agentType,
        startedAt: callSessions.startedAt,
        endedAt: callSessions.endedAt,
        toNumber: callSessions.toNumberE164,
        agentPerformanceScore: agentPerformanceScoreSql(),
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .leftJoin(contacts, eq(callQualityRecords.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callQualityRecords.campaignId, campaigns.id))
      .where(eq(callQualityRecords.callSessionId, callSessionId));

    if (!record) {
      return res.status(404).json({ error: 'Call quality record not found' });
    }

    // Get playback URL
    let playbackUrl: string | null = null;
    if (record.recordingS3Key) {
      try {
        const urlResult = await getCallSessionRecordingUrl(callSessionId);
        playbackUrl = urlResult.url;
      } catch (err) {
        console.error('[ShowcaseCalls] Error getting recording URL:', err);
      }
    }

    res.json({
      ...record,
      playbackUrl,
      hasRecording: !!(record.recordingS3Key),
      agentPerformanceScore: Math.round(Number(record.agentPerformanceScore) || 0),
    });
  } catch (error: any) {
    console.error('[ShowcaseCalls] Details error:', error);
    res.status(500).json({ error: 'Failed to load showcase call details' });
  }
});

// ============================================================================
// POST /:callSessionId/pin — Pin a call as showcase
// ============================================================================

router.post("/:callSessionId/pin", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;
    const { category, notes } = req.body;
    const userId = (req as any).user?.id;

    if (category && !SHOWCASE_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${SHOWCASE_CATEGORIES.join(', ')}`,
      });
    }

    const [updated] = await db
      .update(callQualityRecords)
      .set({
        isShowcase: true,
        showcaseCategory: category || null,
        showcaseNotes: notes || null,
        showcasedAt: new Date(),
        showcasedBy: userId || null,
        updatedAt: new Date(),
      })
      .where(eq(callQualityRecords.callSessionId, callSessionId))
      .returning({ id: callQualityRecords.id });

    if (!updated) {
      return res.status(404).json({ error: 'Call quality record not found' });
    }

    res.json({ success: true, message: 'Call pinned as showcase' });
  } catch (error: any) {
    console.error('[ShowcaseCalls] Pin error:', error);
    res.status(500).json({ error: 'Failed to pin showcase call' });
  }
});

// ============================================================================
// DELETE /:callSessionId/pin — Unpin a showcase call
// ============================================================================

router.delete("/:callSessionId/pin", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;

    const [updated] = await db
      .update(callQualityRecords)
      .set({
        isShowcase: false,
        showcaseCategory: null,
        showcaseNotes: null,
        showcasedAt: null,
        showcasedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(callQualityRecords.callSessionId, callSessionId))
      .returning({ id: callQualityRecords.id });

    if (!updated) {
      return res.status(404).json({ error: 'Call quality record not found' });
    }

    res.json({ success: true, message: 'Showcase call unpinned' });
  } catch (error: any) {
    console.error('[ShowcaseCalls] Unpin error:', error);
    res.status(500).json({ error: 'Failed to unpin showcase call' });
  }
});

export default router;
