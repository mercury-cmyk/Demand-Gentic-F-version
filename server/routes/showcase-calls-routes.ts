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
  dialerCallAttempts,
  campaigns,
  contacts,
  accounts,
} from "@shared/schema";
import { eq, and, or, ne, desc, sql, gte, lte, isNotNull, count as drizzleCount } from "drizzle-orm";
import { requireAuth } from "../auth";
import { getCallSessionRecordingS3Key, storeCallSessionRecording, getCallSessionRecordingUrl } from "../services/recording-storage";
import { streamFromS3, s3ObjectExists, readFromGCS } from "../lib/storage";
import { getPlayableRecordingLink } from "../services/recording-link-resolver";
import { canonicalizeGcsRecordingUrl } from "../lib/recording-url-policy";

const router = Router();
const SHOWCASE_MAX_CALLS = 50;
const SHOWCASE_DEFAULT_RECENT_DAYS = 365;
const MIN_MEANINGFUL_DURATION_SEC = 15;
const MAX_SHOWCASE_DURATION_SEC = 4 * 60;
const MIN_TRANSCRIPT_CHARS = 50;
const MIN_OVERALL_SCORE = 30; // Lowered to catch more potentials
const HIGH_PERFORMER_APS_THRESHOLD = 70;
const VOICEMAIL_OR_IVR_TRANSCRIPT_REGEX =
  "(leave\\s+(a|your)\\s+message|after\\s+the\\s+(tone|beep)|forwarded\\s+to\\s+(an\\s+)?(automatic\\s+)?voice\\s+messaging|voicemail|voice\\s*mail|answering\\s+machine|mailbox(\\s+is\\s+full)?)";
  // Removed "please record your message" and others to be less aggressive provided other signals are good
const CALL_SCREENING_TRANSCRIPT_REGEX =
  "(calling\\s+assist\\s+by\\s+google|google\\s+call\\s+screening|screening\\s+service\\s+from\\s+google|this\\s+call\\s+is\\s+being\\s+screened|i\\s+try\\s+to\\s+connect\\s+you,?\\s+can\\s+i\\s+ask\\s+what\\s+you'?re\\s+calling\\s+about\\??)";
const QUALIFIED_DISPOSITIONS = [
  "qualified",
  "appointment_set",
  "appointment set",
  "converted",
  "transferred",
  "call_transferred",
  "callback_scheduled",
  "callback scheduled"
];
const NON_HUMAN_DISPOSITIONS = [
  "voicemail",
  "no_answer",
  "no answer",
  "no contact",
  "no_contact",
  "busy",
  "fax",
  "answering_machine",
  "answering machine",
  "wrong_number",
  "disconnected",
  "invalid_data",
  "invalid data",
  "system_error",
  "system error",
  "technical_issue",
  "technical issue",
  "unavailable",
  "failed",
  "machine",
  "dnc",          // Filter out DNC calls
  "do_not_call",
  "do not call",
];

// Showcase categories
const SHOWCASE_CATEGORIES = [
  'objection_handling',
  'professional_close',
  'engagement_mastery',
  'difficult_situation',
  'perfect_flow',
  'empathetic_response',
] as const;

async function enforceShowcaseDurationCap(): Promise<number> {
  const updated = await db.execute(sql`
    WITH target AS (
      SELECT cqr.call_session_id
      FROM call_quality_records cqr
      INNER JOIN call_sessions cs ON cs.id = cqr.call_session_id
      WHERE cqr.is_showcase = true
        AND COALESCE(cs.duration_sec, 0) > ${MAX_SHOWCASE_DURATION_SEC}
    )
    UPDATE call_quality_records cqr
    SET
      is_showcase = false,
      showcase_category = NULL,
      showcase_notes = NULL,
      showcased_at = NULL,
      showcased_by = NULL,
      updated_at = NOW()
    FROM target t
    WHERE cqr.call_session_id = t.call_session_id
    RETURNING cqr.call_session_id;
  `);

  const rows = ((updated as any)?.rows ?? []) as Array<{ call_session_id?: string }>;
  return rows.length;
}

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

/** Exclude non-human/non-conversation outcomes (e.g., voicemail, no-answer). */
function humanConversationDispositionFilterSql() {
  return sql`(
    LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT IN (${sql.join(
      NON_HUMAN_DISPOSITIONS.map((d) => sql`${d}`),
      sql`, `
    )})
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%voicemail%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%no answer%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%answering machine%'
    AND LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) NOT LIKE '%fax%'
  )`;
}

/** Require explicit two-sided transcript structure (agent + contact turns). */
function twoSidedTranscriptFilterSql() {
  return sql`(
    COALESCE(${callQualityRecords.fullTranscript}, '') ~* '(agent|ai|assistant|bot)\\s*:'
    AND COALESCE(${callQualityRecords.fullTranscript}, '') ~* '(contact|customer|prospect|user|caller|human)\\s*:'
  )`;
}

/** Exclude voicemail/IVR-like transcript content even when disposition is mislabeled. */
function noVoicemailTranscriptFilterSql() {
  return sql`COALESCE(${callQualityRecords.fullTranscript}, '') !~* ${VOICEMAIL_OR_IVR_TRANSCRIPT_REGEX}`;
}

/** Exclude known machine call-screening transcripts (e.g., Google Call Assist). */
function noCallScreeningTranscriptFilterSql() {
  return sql`COALESCE(${callQualityRecords.fullTranscript}, '') !~* ${CALL_SCREENING_TRANSCRIPT_REGEX}`;
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

function qualifiedHighQualityBoostSql() {
  return sql<number>`
    CASE
      WHEN LOWER(COALESCE(${callQualityRecords.assignedDisposition}, '')) IN (${sql.join(
        QUALIFIED_DISPOSITIONS.map((d) => sql`${d}`),
        sql`, `
      )}) AND COALESCE(${callQualityRecords.overallQualityScore}, 0) >= 60 THEN 1
      ELSE 0
    END
  `;
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
    humanConversationDispositionFilterSql(),
    isNotNull(callQualityRecords.fullTranscript),
    twoSidedTranscriptFilterSql(),
    noVoicemailTranscriptFilterSql(),
    noCallScreeningTranscriptFilterSql(),
    gte(callSessions.durationSec, MIN_MEANINGFUL_DURATION_SEC),
    lte(callSessions.durationSec, MAX_SHOWCASE_DURATION_SEC),
    gte(callQualityRecords.overallQualityScore, MIN_OVERALL_SCORE),
    sql`LENGTH(COALESCE(${callQualityRecords.fullTranscript}, '')) >= ${MIN_TRANSCRIPT_CHARS}`,
    or(
      and(
        eq(callSessions.recordingStatus, 'stored'),
        isNotNull(callSessions.recordingS3Key)
      ),
      isNotNull(callSessions.recordingUrl),
      isNotNull(callSessions.telnyxCallId),
      and(isNotNull(callSessions.telnyxRecordingId), ne(callSessions.recordingStatus, 'failed'))
    )
  );
}

// ============================================================================
// GET / — List top matching calls (Showcase candidates)
// ============================================================================

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const autoUnpinned = await enforceShowcaseDurationCap();
    if (autoUnpinned > 0) {
      console.log(`[ShowcaseCalls] Auto-unpinned ${autoUnpinned} call(s) above ${MAX_SHOWCASE_DURATION_SEC}s`);
    }

    // Determine pagination
    const page = parseInt(req.query.page as string, 10) || 1;
    const requestedLimit = parseInt(req.query.limit as string, 10) || SHOWCASE_MAX_CALLS;
    const limit = Math.min(requestedLimit, SHOWCASE_MAX_CALLS);
    const offset = (page - 1) * limit;

    const whereClause = and(
      buildBaseShowcaseWhere(req.query),
      eq(callQualityRecords.isShowcase, true)
    );

    // Count total matches
    const [{ total }] = await db
      .select({ total: drizzleCount() })
      .from(callQualityRecords)
      .innerJoin(callSessions, eq(callQualityRecords.callSessionId, callSessions.id)) // Join callSessions for duration filter
      .leftJoin(campaigns, eq(callQualityRecords.campaignId, campaigns.id)) // Needed if filtering by campaigns
      .where(whereClause); 

    const cappedTotal = Math.min(Number(total), SHOWCASE_MAX_CALLS);
    const safeOffset = Math.min(offset, cappedTotal);
    const remaining = Math.max(0, cappedTotal - safeOffset);
    const safeLimit = Math.min(limit, remaining || limit);
      
    console.log(`[ShowcaseCalls] List count: ${total}, capped: ${cappedTotal}, page: ${page}, limit: ${limit}`);

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
        recordingUrl: callSessions.recordingUrl,
        telnyxCallId: callSessions.telnyxCallId,
        telnyxRecordingId: callSessions.telnyxRecordingId,
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
        desc(qualifiedHighQualityBoostSql()),
        desc(agentPerformanceScoreSql()),
        desc(callQualityRecords.overallQualityScore),
        desc(callQualityRecords.createdAt),
      )
      .limit(safeLimit)
      .offset(safeOffset);

    res.json({
      calls: rows.map(r => {
        const recordingUrl = canonicalizeGcsRecordingUrl({
          recordingS3Key: r.recordingS3Key,
          recordingUrl: r.recordingUrl,
        });
        return {
          ...r,
          recordingUrl,
          hasRecording: Boolean(recordingUrl),
          agentPerformanceScore: Math.round(Number(r.agentPerformanceScore) || 0),
        };
      }),
      pagination: {
        page,
        limit,
        total: cappedTotal,
        totalPages: Math.ceil(cappedTotal / limit),
      }
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
    const autoUnpinned = await enforceShowcaseDurationCap();
    if (autoUnpinned > 0) {
      console.log(`[ShowcaseCalls] Auto-unpinned ${autoUnpinned} call(s) above ${MAX_SHOWCASE_DURATION_SEC}s`);
    }

    const threshold = parseInt(req.query.threshold as string, 10) || 55;
    const limitCount = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 40));

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
        recordingUrl: callSessions.recordingUrl,
        telnyxCallId: callSessions.telnyxCallId,
        telnyxRecordingId: callSessions.telnyxRecordingId,
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
      const recordingUrl = canonicalizeGcsRecordingUrl({
        recordingS3Key: c.recordingS3Key,
        recordingUrl: c.recordingUrl,
      });
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
        recordingUrl,
        hasRecording: Boolean(recordingUrl),
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
    const autoUnpinned = await enforceShowcaseDurationCap();
    if (autoUnpinned > 0) {
      console.log(`[ShowcaseCalls] Auto-unpinned ${autoUnpinned} call(s) above ${MAX_SHOWCASE_DURATION_SEC}s`);
    }

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
        highPerformers: sql<number>`COUNT(CASE WHEN (${agentPerformanceScoreSql()}) >= ${HIGH_PERFORMER_APS_THRESHOLD} THEN 1 END)`,
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
        recordingUrl: callSessions.recordingUrl,
        telnyxCallId: callSessions.telnyxCallId,
        telnyxRecordingId: callSessions.telnyxRecordingId,
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

    // Resolve a direct GCS download URL for the recording instead of streaming.
    let downloadUrl: string | null = null;
    const canonicalRecordingUrl = canonicalizeGcsRecordingUrl({
      recordingS3Key: record.recordingS3Key,
      recordingUrl: record.recordingUrl,
    });
    let hasRecording = false;
    try {
      const gcsResult = await getCallSessionRecordingUrl(callSessionId, record.recordingUrl);
      if (
        gcsResult.url &&
        gcsResult.source === 'local' &&
        !gcsResult.url.startsWith('gcs-internal://')
      ) {
        const canonicalDownloadUrl = canonicalizeGcsRecordingUrl({
          recordingS3Key: record.recordingS3Key,
          recordingUrl: gcsResult.url,
        });
        downloadUrl = canonicalDownloadUrl;
        hasRecording = Boolean(canonicalDownloadUrl);
      }
    } catch {
      // Non-blocking: fall back to local indicator check below
    }

    // Fallback: check if recording exists even if we couldn't get a URL
    if (!hasRecording) {
      try {
        hasRecording = Boolean(canonicalRecordingUrl) || Boolean(await getPlayableRecordingLink(callSessionId));
      } catch {
        hasRecording = Boolean(canonicalRecordingUrl);
      }
    }

    res.json({
      ...record,
      recordingUrl: canonicalRecordingUrl,
      playbackUrl: null,
      downloadUrl: downloadUrl,
      hasRecording,
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
    const userId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?.clientUserId;

    if (category && !SHOWCASE_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${SHOWCASE_CATEGORIES.join(', ')}`,
      });
    }

    const [sessionForDurationGate] = await db
      .select({
        id: callSessions.id,
        durationSec: callSessions.durationSec,
      })
      .from(callSessions)
      .where(eq(callSessions.id, callSessionId))
      .limit(1);

    if (!sessionForDurationGate) {
      return res.status(404).json({ error: 'Call session not found' });
    }

    if ((sessionForDurationGate.durationSec ?? 0) > MAX_SHOWCASE_DURATION_SEC) {
      return res.status(400).json({
        error: `Call exceeds showcase maximum duration of ${MAX_SHOWCASE_DURATION_SEC} seconds (4 minutes).`,
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
      // Fallback: allow pinning calls that have not been analyzed yet by creating
      // a minimal quality record tied to the session.
      const [session] = await db
        .select({
          id: callSessions.id,
          campaignId: callSessions.campaignId,
          contactId: callSessions.contactId,
        })
        .from(callSessions)
        .where(eq(callSessions.id, callSessionId))
        .limit(1);

      if (!session) {
        return res.status(404).json({ error: 'Call session not found' });
      }

      const [attempt] = await db
        .select({
          id: dialerCallAttempts.id,
          campaignId: dialerCallAttempts.campaignId,
          contactId: dialerCallAttempts.contactId,
        })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.callSessionId, callSessionId))
        .orderBy(desc(dialerCallAttempts.createdAt))
        .limit(1);

      await db.insert(callQualityRecords).values({
        callSessionId,
        dialerCallAttemptId: attempt?.id ?? null,
        campaignId: session.campaignId ?? attempt?.campaignId ?? null,
        contactId: session.contactId ?? attempt?.contactId ?? null,
        analysisStage: "manual_showcase_pin",
        interactionType: "live_call",
        isShowcase: true,
        showcaseCategory: category || null,
        showcaseNotes: notes || null,
        showcasedAt: new Date(),
        showcasedBy: userId || null,
        updatedAt: new Date(),
      });
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

// Bypass strict header check for this route to support <audio src> with query token
router.get("/:callSessionId/stream", async (req: Request, res: Response) => {
  try {
    const { callSessionId } = req.params;

    const normalizeToken = (raw?: string | string[]) => {
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (!value) return undefined;
      return value.replace(/^Bearer\s+/i, '').trim();
    };
    
    // Manual auth check supporting query token for audio elements
    // Supports both Internal Users (userId) and Client Portal Users (clientUserId)
    let authenticatedUserId: string | undefined = (req as any).user?.userId || (req as any).clientUser?.clientUserId;

    if (!authenticatedUserId) {
       // Check query param first (audio elements often use this)
       let token = normalizeToken(req.query.token as string | string[]);
       
       // Fallback to header if no query token
       if (!token && req.headers.authorization) {
         token = normalizeToken(req.headers.authorization);
       }

       if (token) {
         try {
           const { verifyToken } = await import("../auth");
           // We need to handle both standard User payload and Client payload
           const payload = verifyToken(token) as any;
           
           if (payload) {
             // Admin/Internal User token has 'userId'
             // Client key has 'clientUserId'
             authenticatedUserId = payload.userId || payload.clientUserId;
             
             // If we found a valid user, attach to request for downstream use if needed
             if (payload.userId) (req as any).user = payload;
             if (payload.clientUserId) (req as any).clientUser = payload;
           }
         } catch (e) { 
           console.warn(`[ShowcaseCalls] Token verification failed for stream:`, e); 
         }
       }
    }

    if (!authenticatedUserId) {
      // Do not hard-fail playback when the browser cannot attach Authorization
      // headers to <audio src>. We still attempt normal recording resolution.
      console.warn('[ShowcaseCalls] Stream request without auth token; continuing with resolver fallback');
    }

    // ── Resolve a playable URL ───────────────────────────────────────
    let result = await getPlayableRecordingLink(callSessionId);

    if (!result) {
        // Fallback: If not resolved by standard resolver (e.g. no key in DB but file exists), try old guessing logic
        const [session] = await db
          .select({ 
            recordingS3Key: callSessions.recordingS3Key,
            campaignId: callSessions.campaignId 
          })
          .from(callSessions)
          .where(eq(callSessions.id, callSessionId));
    
        if (session) {
           let s3Key = session.recordingS3Key;
           if (!s3Key) {
             const mp3 = getCallSessionRecordingS3Key(callSessionId, session.campaignId, 'mp3');
             if (await s3ObjectExists(mp3)) s3Key = mp3;
             else {
               const wav = getCallSessionRecordingS3Key(callSessionId, session.campaignId, 'wav');
               if (await s3ObjectExists(wav)) s3Key = wav;
             }
           }
           
           if (s3Key) {
             console.log(`[ShowcaseCalls] Fallback GCS key found: ${s3Key}`);
             const stream = await streamFromS3(s3Key);
             res.setHeader('Content-Type', s3Key.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');
             stream.pipe(res);
             return;
           }
        }

      console.error(`[ShowcaseCalls] No audio URL found for ${callSessionId}`);
      return res.status(404).send('Recording audio not available');
    }

    // ── Handle GCS internal stream (when signBlob is unavailable) ────
    if (result.url.startsWith('gcs-internal://')) {
      const gcsKey = result.url.replace(/^gcs-internal:\/\/[^/]+\//, '');
      try {
        const { stream, contentType, size } = await readFromGCS(gcsKey);

        res.setHeader('Content-Type', contentType);
        if (size > 0) {
          res.setHeader('Content-Length', size.toString());
        }
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'private, max-age=3600');

        (stream as any).pipe(res);
        return;
      } catch (gcsErr: any) {
        console.error(`[ShowcaseCalls] GCS direct stream failed for ${callSessionId}:`, gcsErr.message);
      }
    }

    // ── FAST PATH: Direct Redirect (Performance Optimization) ──────────
    // Instead of proxying the stream through our server (which adds latency/CPU),
    // redirect the client directly to the signed/public URL if it's external.
    if ((result.source === 'telnyx_recording_id' || result.source === 'telnyx_call_id') && result.url.startsWith('http')) {
      // Self-heal: persist Telnyx-sourced recordings to GCS in the background so
      // future showcase playback is stable even if provider URLs rotate/expire.
      storeCallSessionRecording(callSessionId, result.url).catch((err: any) => {
        console.warn(`[ShowcaseCalls] Background GCS persist failed for ${callSessionId}:`, err?.message || err);
      });
    }

    if (result.url.startsWith('http') && result.source !== 'cached') {
       return res.redirect(result.url);
    }

    // ── Fallback Proxy: Fetch audio bytes from external URL ───────────
    // Only used for cached URLs (might be stale/private) or if redirect fails
    let audioResponse = await fetch(result.url);

    // If fetch fails and source was cached, retry with fresh resolution
    if (!audioResponse.ok && result.source === 'cached') {
      console.warn(`[ShowcaseCalls] Cached URL failed for ${callSessionId} (${audioResponse.status}). Re-resolving...`);
      result = await getPlayableRecordingLink(callSessionId, { skipCached: true });
      if (result && result.source !== 'cached') {
        // If we get a fresh non-cached URL, prefer redirect for speed
        if (result.url.startsWith('http')) {
           return res.redirect(result.url);
        }
        audioResponse = await fetch(result.url);
      }
    }

    if (!audioResponse.ok || !result) {
       console.error(`[ShowcaseCalls] Failed to fetch audio for ${callSessionId}: ${audioResponse?.status}`);
       return res.status(audioResponse?.status === 404 ? 404 : 502).send('Failed to fetch recording audio');
    }

    // Stream audio bytes to the browser (Legacy Fallback)
    const contentType = audioResponse.headers.get('content-type') || result.mimeType || 'audio/mpeg';
    const contentLength = audioResponse.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=300'); // Short cache for signed URLs

    const reader = audioResponse.body?.getReader();
    if (!reader) {
      return res.status(500).send('Failed to read audio stream');
    }

    // ... piping logic ...
    const pipeStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch (err) {
        console.error('[ShowcaseCalls] Stream error:', err);
        if (!res.headersSent) res.end();
      }
    };
    pipeStream();

  } catch (error: any) {
    console.error('[ShowcaseCalls] Stream error:', error);
    if (!res.headersSent) res.status(500).send('Failed to stream recording');
  }
});

export default router;
