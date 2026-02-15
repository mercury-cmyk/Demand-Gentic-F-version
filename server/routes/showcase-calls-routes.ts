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
import { eq, and, or, desc, sql, gte, lte, isNotNull, count as drizzleCount } from "drizzle-orm";
import { requireAuth } from "../auth";
import { getCallSessionRecordingS3Key } from "../services/recording-storage";
import { streamFromS3, s3ObjectExists } from "../lib/storage";

const router = Router();
const SHOWCASE_MAX_CALLS = 100;
const SHOWCASE_DEFAULT_RECENT_DAYS = 120;
const MIN_MEANINGFUL_DURATION_SEC = 30;
const MIN_TRANSCRIPT_CHARS = 120;
const MIN_OVERALL_SCORE = 45;

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

// Ranking and filtering helpers for outcome-agnostic showcase selection.
function handlingQualityScoreSql() {
  return sql<number>`
    (
      COALESCE(${callQualityRecords.engagementScore}, 0) +
      COALESCE(${callQualityRecords.clarityScore}, 0) +
      COALESCE(${callQualityRecords.empathyScore}, 0) +
      COALESCE(${callQualityRecords.objectionHandlingScore}, 0) +
      COALESCE(${callQualityRecords.flowComplianceScore}, 0) +
      COALESCE(${callQualityRecords.closingScore}, 0)
    ) / 6.0
  `;
}

function handlingPrecisionScoreSql() {
  return sql<number>`
    CASE
      WHEN ${callQualityRecords.dispositionAccurate} = true THEN 100
      WHEN ${callQualityRecords.dispositionAccurate} = false THEN 0
      ELSE 50
    END
  `;
}

function durationPriorityScoreSql() {
  return sql<number>`
    LEAST(COALESCE(${callSessions.durationSec}, 0), 1200) / 12.0
  `;
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
  } else {
    conditions.push(
      gte(
        callQualityRecords.createdAt,
        new Date(Date.now() - SHOWCASE_DEFAULT_RECENT_DAYS * 24 * 60 * 60 * 1000)
      )
    );
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

  return and(...conditions);
}

/** Showcase ranking score: conversation quality + handling + precision. */
function agentPerformanceScoreSql() {
  return sql<number>`
    COALESCE(${callQualityRecords.overallQualityScore}, 0) * 0.40 +
    ${handlingQualityScoreSql()} * 0.30 +
    ${handlingPrecisionScoreSql()} * 0.10 +
    ${durationPriorityScoreSql()} * 0.20
  `;
}

/** Outcome-agnostic, analysis-backed filter for showcase candidates. */
function buildBaseShowcaseWhere(query: any) {
  return and(
    buildFilters(query),
    isNotNull(callQualityRecords.fullTranscript),
    gte(callSessions.durationSec, MIN_MEANINGFUL_DURATION_SEC),
    gte(callQualityRecords.overallQualityScore, MIN_OVERALL_SCORE),
    sql`LENGTH(COALESCE(${callQualityRecords.fullTranscript}, '')) >= ${MIN_TRANSCRIPT_CHARS}`,
    or(
      eq(callSessions.recordingStatus, 'stored'),
      isNotNull(callSessions.recordingS3Key)
    ),
  );
}

// ============================================================================
// GET / — List top 100 recent calls with recordings (Showcase candidates)
// ============================================================================

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    // Showcase should return up to the top 100 calls by quality + handling precision.
    const page = 1;
    const limit = SHOWCASE_MAX_CALLS;
    const whereClause = buildBaseShowcaseWhere(req.query);

    // Count total matches
    const [{ total }] = await db
      .select({ total: drizzleCount() })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id)) // Join callSessions for duration filter
      .where(whereClause); 
      
    console.log(`[ShowcaseCalls] List count: ${total}`);

    // Fetch calls - sorted by Agent Performance Score
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
        // Include isShowcase to show pin status if it exists
        isShowcase: callQualityRecords.isShowcase,
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .leftJoin(contacts, eq(callQualityRecords.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callQualityRecords.campaignId, campaigns.id))
      .where(whereClause)
      .orderBy(
        desc(agentPerformanceScoreSql()),
        desc(callQualityRecords.overallQualityScore),
        desc(callQualityRecords.createdAt),
      )
      .limit(limit);

    const cappedTotal = Math.min(Number(total) || 0, limit);

    res.json({
      calls: rows.map(r => ({
        ...r,
        hasRecording: !!(r.recordingS3Key),
        agentPerformanceScore: Math.round(Number(r.agentPerformanceScore) || 0),
      })),
      pagination: {
        page,
        limit,
        total: cappedTotal,
        totalPages: 1,
      },
    });
  } catch (error: any) {
    console.error('[ShowcaseCalls] List error:', error);
    res.status(500).json({ error: 'Failed to load showcase calls' });
  }
});

// ============================================================================
// GET /auto-detect — Find even more showcase candidates
// ============================================================================

router.get("/auto-detect", requireAuth, async (req: Request, res: Response) => {
  try {
    const threshold = parseInt(req.query.threshold as string, 10) || 60;
    const limitCount = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const baseCandidatesFilters = buildBaseShowcaseWhere(req.query);

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
      .where(baseCandidatesFilters)
      .orderBy(
        desc(agentPerformanceScoreSql()),
        desc(callQualityRecords.overallQualityScore),
        desc(callQualityRecords.createdAt),
      )
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

    const thresholdMatches = enriched.filter(c => c.agentPerformanceScore >= threshold);
    const finalCandidates = thresholdMatches.length > 0
      ? thresholdMatches
      : enriched;

    res.json({ candidates: finalCandidates, threshold });
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
    const showcaseWhere = buildBaseShowcaseWhere(req.query);

    const [countCheck] = await db
      .select({ count: drizzleCount() })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .where(showcaseWhere);
    console.log(`[ShowcaseCalls] Stats check count: ${countCheck?.count}`);

    const [showcaseStats] = await db
      .select({
        total: drizzleCount(), // This will be the total eligible quality calls
        avgOverall: sql<number>`ROUND(AVG(${callQualityRecords.overallQualityScore}))`,
        avgEngagement: sql<number>`ROUND(AVG(${callQualityRecords.engagementScore}))`,
        avgClarity: sql<number>`ROUND(AVG(${callQualityRecords.clarityScore}))`,
        avgEmpathy: sql<number>`ROUND(AVG(${callQualityRecords.empathyScore}))`,
        avgObjectionHandling: sql<number>`ROUND(AVG(${callQualityRecords.objectionHandlingScore}))`,
        avgFlowCompliance: sql<number>`ROUND(AVG(${callQualityRecords.flowComplianceScore}))`,
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .where(showcaseWhere); // Using the broader filter, not just isShowcase=true

    // If we get 0 despite having data in DB, it might be due to incomplete joins or data issues.
    // Let's ensure we return at least the high performers count if showcase total is 0 but high performers exist.
    // Or maybe showcaseWhere is somehow too strict? No, check_recordings.ts says 18.


    // Overall eligible showcase pool stats (for context when nothing pinned yet)
    const [conversationStats] = await db
      .select({
        totalConversations: drizzleCount(),
        avgScore: sql<number>`ROUND(AVG(${callQualityRecords.overallQualityScore}))`,
        highPerformers: sql<number>`COUNT(CASE WHEN (${agentPerformanceScoreSql()}) >= 80 THEN 1 END)`,
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .where(showcaseWhere);

    // Category breakdown
    const categoryBreakdown = await db
      .select({
        category: callQualityRecords.showcaseCategory,
        count: drizzleCount(),
      })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id))
      .where(showcaseWhere)
      .groupBy(callQualityRecords.showcaseCategory);

    // Top campaigns inside the eligible showcase pool
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
      .where(showcaseWhere)
      .groupBy(callQualityRecords.campaignId, campaigns.name)
      .orderBy(desc(sql`ROUND(AVG(${callQualityRecords.overallQualityScore}))`))
      .limit(5);

    res.json({
      total: Math.min(Number(showcaseStats.total) || 0, SHOWCASE_MAX_CALLS),
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

    // Get playback URL with fallback to stream if needed
    let playbackUrl: string | null = null;
    if (record.recordingS3Key) {
      // Use internal streaming endpoint to guarantee playback
      // since the user wants GUARANTEED access.
      // We'll prioritize the stream proxy over presigned URLs if reliability is the concern.
      playbackUrl = `/api/showcase-calls/${callSessionId}/stream`;
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

// ============================================================================
// GET /:callSessionId/stream — Stream recording from GCS (proxy)
// ============================================================================

router.get("/:callSessionId/stream", requireAuth, async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;

    const [session] = await db
      .select({ 
        recordingS3Key: callSessions.recordingS3Key,
        recordingStatus: callSessions.recordingStatus,
        campaignId: callSessions.campaignId 
      })
      .from(callSessions)
      .where(eq(callSessions.id, callSessionId));

    if (!session) {
      return res.status(404).send('Recording not found');
    }

    // Try to determine the key.
    // 1. Check existing s3Key from DB
    let s3Key = session.recordingS3Key;
    
    // 2. If not in DB, guess based on campaign + callSessionId
    if (!s3Key) {
       // Check common extensions
       const mp3 = getCallSessionRecordingS3Key(callSessionId, session.campaignId, 'mp3');
       if (await s3ObjectExists(mp3)) s3Key = mp3;
       else {
         const wav = getCallSessionRecordingS3Key(callSessionId, session.campaignId, 'wav');
         if (await s3ObjectExists(wav)) s3Key = wav;
       }
    }

    if (!s3Key) {
      return res.status(404).send('Recording file not found in GCS');
    }

    // Proxy stream
    res.setHeader('Content-Type', s3Key.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');
    const stream = await streamFromS3(s3Key);
    stream.pipe(res);
  } catch (error: any) {
    console.error('[ShowcaseCalls] Stream error:', error);
    res.status(500).send('Failed to stream recording');
  }
});

export default router;
