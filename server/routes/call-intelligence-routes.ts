/**
 * Call Intelligence Routes
 *
 * API endpoints for retrieving and managing call logs, quality metrics,
 * and conversation intelligence data
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { db } from "../db";
import { callQualityRecords, callSessions, campaigns, contacts, accounts, leads, dialerCallAttempts } from "@shared/schema";
import { eq, and, gte, lte, desc, or, ilike, isNotNull, isNull, sql, count, avg } from "drizzle-orm";
import { 
  getCallQualitySummary, 
  getProblematicCalls, 
  exportCallQualityData,
  getCallIntelligence,
} from "../services/call-intelligence-logger";
import { resolvePlayableRecordingUrl } from "../lib/recording-url-policy";
import { BUCKET, getPresignedDownloadUrl } from "../lib/storage";
import { Storage } from '@google-cloud/storage';

const router = Router();

// GCS client for direct file download (bypasses presigned URL signing)
let gcsDirectStorage: InstanceType<typeof Storage> | null = null;
try {
  const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const GCS_KEY_FILE = process.env.GCS_KEY_FILE;
  gcsDirectStorage = new Storage({
    projectId: GCS_PROJECT_ID,
    ...(GCS_KEY_FILE ? { keyFilename: GCS_KEY_FILE } : {}),
  });
} catch (e) {
  console.warn('[CallIntelligence] GCS Storage init failed — Strategy F unavailable:', (e as Error).message);
}

/**
 * Download audio directly from GCS using service account read access.
 * Bypasses presigned URL generation entirely — works even without signBlob permission.
 */
async function downloadGcsAudioAsBuffer(gcsKey: string): Promise<Buffer | null> {
  if (!gcsDirectStorage || !gcsKey || !BUCKET) return null;
  try {
    const [buffer] = await gcsDirectStorage.bucket(BUCKET).file(gcsKey).download();
    console.log(`[GCS-Direct] Downloaded ${gcsKey} (${buffer.length} bytes)`);
    return buffer;
  } catch (e: any) {
    console.warn(`[GCS-Direct] Failed to download ${gcsKey}:`, e.message);
    return null;
  }
}

function extractGcsKeyFromRecordingUrl(recordingUrl: string | null | undefined): string | null {
  if (!recordingUrl) return null;
  const trimmed = recordingUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("gcs-internal://")) {
    return trimmed.replace(/^gcs-internal:\/\/[^/]+\//, "");
  }

  if (trimmed.startsWith("gs://")) {
    const withoutScheme = trimmed.slice("gs://".length);
    const firstSlash = withoutScheme.indexOf("/");
    if (firstSlash <= 0) return null;
    const bucket = withoutScheme.slice(0, firstSlash);
    const objectPath = withoutScheme.slice(firstSlash + 1);
    if (!objectPath) return null;
    if (bucket && bucket !== BUCKET) return null;
    return objectPath;
  }

  const m = trimmed.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
  if (m) {
    const bucket = m[1];
    const objectPath = m[2];
    if (!objectPath) return null;
    if (bucket && bucket !== BUCKET) return null;
    try {
      return decodeURIComponent(objectPath);
    } catch {
      return objectPath;
    }
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    const normalized = trimmed.replace(/^\/+/, "");
    return normalized ? normalized : null;
  }

  return null;
}

const DIALER_DISPOSITIONS = [
  "voicemail",
  "not_interested",
  "invalid_data",
  "qualified_lead",
  "do_not_call",
  "no_answer",
  "needs_review",
  "callback_requested",
] as const;

type DialerDisposition = (typeof DIALER_DISPOSITIONS)[number];

function isDialerDisposition(value: unknown): value is DialerDisposition {
  return typeof value === "string" && (DIALER_DISPOSITIONS as readonly string[]).includes(value);
}

/**
 * GET /api/call-intelligence/records/:callSessionId
 * Retrieve complete call quality and intelligence record for a specific call
 */
router.get("/records/:callSessionId", requireAuth, async (req, res) => {
  try {
    const { callSessionId } = req.params;

    const [record] = await db
      .select()
      .from(callQualityRecords)
      .where(eq(callQualityRecords.callSessionId, callSessionId))
      .limit(1);

    if (!record) {
      return res.status(404).json({
        error: "Call quality record not found",
        callSessionId,
      });
    }

    res.json({
      success: true,
      record: {
        id: record.id,
        callSessionId: record.callSessionId,
        scores: {
          overall: record.overallQualityScore,
          engagement: record.engagementScore,
          clarity: record.clarityScore,
          empathy: record.empathyScore,
          objectionHandling: record.objectionHandlingScore,
          qualification: record.qualificationScore,
          closing: record.closingScore,
        },
        intelligence: {
          sentiment: record.sentiment,
          engagementLevel: record.engagementLevel,
          identityConfirmed: record.identityConfirmed,
          qualificationMet: record.qualificationMet,
        },
        analysis: {
          issues: record.issues,
          recommendations: record.recommendations,
          breakdowns: record.breakdowns,
          promptUpdates: record.promptUpdates,
          performanceGaps: record.performanceGaps,
          nextBestActions: record.nextBestActions,
        },
        campaignAlignment: {
          score: record.campaignAlignmentScore,
          contextUsage: record.contextUsageScore,
          talkingPointsCoverage: record.talkingPointsCoverageScore,
          missedTalkingPoints: record.missedTalkingPoints,
        },
        flowCompliance: {
          score: record.flowComplianceScore,
          missedSteps: record.missedSteps,
          deviations: record.flowDeviations,
        },
        disposition: {
          assigned: record.assignedDisposition,
          expected: record.expectedDisposition,
          accurate: record.dispositionAccurate,
          notes: record.dispositionNotes,
        },
        transcript: {
          length: record.transcriptLength,
          truncated: record.transcriptTruncated,
          text: record.fullTranscript,
        },
        metadata: {
          model: record.analysisModel,
          stage: record.analysisStage,
          type: record.interactionType,
          analyzedAt: record.analyzedAt,
          createdAt: record.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("[CallIntelligence] Error fetching record:", error);
    res.status(500).json({ error: "Failed to retrieve call record" });
  }
});

/**
 * GET /api/call-intelligence/campaign/:campaignId
 * Get call quality records for a campaign with optional filtering
 */
router.get("/campaign/:campaignId", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { startDate, endDate, minScore, sentiment, limit = "50" } = req.query;

    let query = db
      .select()
      .from(callQualityRecords)
      .where(eq(callQualityRecords.campaignId, campaignId));

    // Apply filters
    const conditions: any[] = [eq(callQualityRecords.campaignId, campaignId)];

    if (startDate) {
      conditions.push(gte(callQualityRecords.createdAt, new Date(startDate as string)));
    }

    if (endDate) {
      conditions.push(lte(callQualityRecords.createdAt, new Date(endDate as string)));
    }

    if (minScore) {
      const threshold = parseInt(minScore as string, 10);
      conditions.push(gte(callQualityRecords.overallQualityScore, threshold));
    }

    if (sentiment) {
      conditions.push(eq(callQualityRecords.sentiment, sentiment as string));
    }

    const records = await db
      .select()
      .from(callQualityRecords)
      .where(and(...conditions))
      .orderBy(desc(callQualityRecords.createdAt))
      .limit(parseInt(limit as string, 10));

    // Calculate summary stats
    const totalRecords = records.length;
    const avgScore = totalRecords > 0
      ? Math.round(records.reduce((sum, r) => sum + (r.overallQualityScore || 0), 0) / totalRecords)
      : 0;

    const sentimentCounts = {
      positive: records.filter(r => r.sentiment === "positive").length,
      neutral: records.filter(r => r.sentiment === "neutral").length,
      negative: records.filter(r => r.sentiment === "negative").length,
    };

    res.json({
      success: true,
      campaignId,
      summary: {
        totalRecords,
        avgScore,
        sentimentCounts,
      },
      records: records.map(r => ({
        id: r.id,
        callSessionId: r.callSessionId,
        score: r.overallQualityScore,
        sentiment: r.sentiment,
        engagement: r.engagementLevel,
        issueCount: Array.isArray(r.issues) ? r.issues.length : 0,
        recommendationCount: Array.isArray(r.recommendations) ? r.recommendations.length : 0,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error("[CallIntelligence] Error fetching campaign records:", error);
    res.status(500).json({ error: "Failed to retrieve campaign records" });
  }
});

/**
 * GET /api/call-intelligence/problematic/:campaignId
 * Get calls that need attention (low scores or critical issues)
 */
router.get("/problematic/:campaignId", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { threshold = "60" } = req.query;

    const scoreThreshold = parseInt(threshold as string, 10);
    const calls = await getProblematicCalls(campaignId, scoreThreshold);

    res.json({
      success: true,
      campaignId,
      threshold: scoreThreshold,
      calls,
    });
  } catch (error) {
    console.error("[CallIntelligence] Error fetching problematic calls:", error);
    res.status(500).json({ error: "Failed to retrieve problematic calls" });
  }
});

/**
 * GET /api/call-intelligence/summary/:campaignId
 * Get aggregated quality summary for a campaign
 */
router.get("/summary/:campaignId", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters required",
      });
    }

    const summary = await getCallQualitySummary(
      campaignId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    if (!summary) {
      return res.status(500).json({ error: "Failed to generate summary" });
    }

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("[CallIntelligence] Error generating summary:", error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

/**
 * GET /api/call-intelligence/export/:campaignId
 * Export call quality data for analytics/training
 */
router.get("/export/:campaignId", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { startDate, endDate, format = "json" } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate and endDate query parameters required",
      });
    }

    const data = await exportCallQualityData(
      campaignId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    if (format === "csv") {
      // Convert to CSV
      const csv = convertToCSV(data);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="call-quality-${campaignId}.csv"`);
      res.send(csv);
    } else {
      // JSON format
      res.json({
        success: true,
        campaignId,
        period: {
          start: startDate,
          end: endDate,
        },
        records: data,
      });
    }
  } catch (error) {
    console.error("[CallIntelligence] Error exporting data:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

/**
 * Helper function to convert data to CSV format
 */
function convertToCSV(data: any[]): string {
  if (data.length === 0) {
    return "No data available";
  }

  const headers = [
    "callSessionId",
    "timestamp",
    "overallScore",
    "engagement",
    "clarity",
    "empathy",
    "sentiment",
    "engagementLevel",
    "issueCount",
    "recommendationCount",
  ];

  const rows = data.map(record => [
    record.callSessionId,
    new Date(record.timestamp).toISOString(),
    record.metrics.overall,
    record.metrics.engagement,
    record.metrics.clarity,
    record.metrics.empathy,
    record.intelligence.sentiment,
    record.intelligence.engagementLevel,
    Array.isArray(record.issues) ? record.issues.length : 0,
    Array.isArray(record.recommendations) ? record.recommendations.length : 0,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
  ].join("\n");

  return csvContent;
}

/**
 * GET /api/call-intelligence/unified
 * Unified endpoint combining call recordings, transcripts, and quality analysis
 * with comprehensive filtering and pagination.
 *
 * Queries both call_sessions AND dialer_call_attempts tables to provide
 * comprehensive call data from all sources.
 */
router.get("/unified", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const {
      page = "1",
      limit = "20",
      campaignId,
      agentType,
      startDate,
      endDate,
      minDuration,
      maxDuration,
      phoneNumber,
      minQualityScore,
      maxQualityScore,
      sentiment,
      hasTranscript,
      hasRecording,
      hasQualityAnalysis,
      disposition,
      search,
      sortBy = "date",
      sortOrder = "desc",
      source = "all", // 'all', 'sessions', 'dialer'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    // ========================================
    // QUERY 1: dialer_call_attempts (primary source with recordings)
    // ========================================
    const dialerConditions: any[] = [];

    if (campaignId && campaignId !== "all") {
      dialerConditions.push(eq(dialerCallAttempts.campaignId, campaignId as string));
    }

    if (agentType && agentType !== "all") {
      dialerConditions.push(eq(dialerCallAttempts.agentType, agentType as "ai" | "human"));
    }

    if (startDate) {
      dialerConditions.push(gte(dialerCallAttempts.callStartedAt, new Date(startDate as string)));
    }
    if (endDate) {
      dialerConditions.push(lte(dialerCallAttempts.callStartedAt, new Date(endDate as string)));
    }

    if (minDuration) {
      const minDur = parseInt(minDuration as string, 10);
      if (!isNaN(minDur)) {
        dialerConditions.push(gte(dialerCallAttempts.callDurationSeconds, minDur));
      }
    }
    if (maxDuration) {
      const maxDur = parseInt(maxDuration as string, 10);
      if (!isNaN(maxDur)) {
        dialerConditions.push(lte(dialerCallAttempts.callDurationSeconds, maxDur));
      }
    }

    if (phoneNumber) {
      const phone = (phoneNumber as string).trim();
      dialerConditions.push(ilike(dialerCallAttempts.phoneDialed, `%${phone}%`));
    }

    if (disposition && disposition !== "all") {
      if (isDialerDisposition(disposition)) {
        dialerConditions.push(eq(dialerCallAttempts.disposition, disposition));
      }
    }

    if (hasTranscript === "true") {
      dialerConditions.push(isNotNull(dialerCallAttempts.fullTranscript));
    } else if (hasTranscript === "false") {
      dialerConditions.push(isNull(dialerCallAttempts.fullTranscript));
    }

    if (hasRecording === "true") {
      dialerConditions.push(isNotNull(dialerCallAttempts.recordingUrl));
    } else if (hasRecording === "false") {
      dialerConditions.push(isNull(dialerCallAttempts.recordingUrl));
    }

    if (search) {
      const searchTerm = (search as string).trim();
      dialerConditions.push(
        or(
          ilike(contacts.fullName, `%${searchTerm}%`),
          ilike(contacts.firstName, `%${searchTerm}%`),
          ilike(contacts.lastName, `%${searchTerm}%`),
          ilike(accounts.name, `%${searchTerm}%`),
          ilike(dialerCallAttempts.fullTranscript, `%${searchTerm}%`),
          ilike(dialerCallAttempts.phoneDialed, `%${searchTerm}%`)
        )
      );
    }

    const dialerWhereClause = dialerConditions.length > 0 ? and(...dialerConditions) : undefined;

    // Query dialer_call_attempts
    const dialerResults = source === "sessions" ? [] : await db
      .select({
        id: dialerCallAttempts.id,
        telnyxCallId: dialerCallAttempts.telnyxCallId,
        phoneDialed: dialerCallAttempts.phoneDialed,
        callStartedAt: dialerCallAttempts.callStartedAt,
        callEndedAt: dialerCallAttempts.callEndedAt,
        callDurationSeconds: dialerCallAttempts.callDurationSeconds,
        disposition: dialerCallAttempts.disposition,
        agentType: dialerCallAttempts.agentType,
        connected: dialerCallAttempts.connected,
        recordingUrl: dialerCallAttempts.recordingUrl,
        fullTranscript: dialerCallAttempts.fullTranscript,
        aiTranscript: dialerCallAttempts.aiTranscript,
        notes: dialerCallAttempts.notes,
        contactId: contacts.id,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactFullName: contacts.fullName,
        contactEmail: contacts.email,
        contactPhone: contacts.directPhoneE164,
        contactJobTitle: contacts.jobTitle,
        accountId: accounts.id,
        accountName: accounts.name,
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        // Quality records linked via dialer attempt
        qualityId: callQualityRecords.id,
        overallScore: callQualityRecords.overallQualityScore,
        engagementScore: callQualityRecords.engagementScore,
        clarityScore: callQualityRecords.clarityScore,
        empathyScore: callQualityRecords.empathyScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        qualificationScore: callQualityRecords.qualificationScore,
        closingScore: callQualityRecords.closingScore,
        qualitySentiment: callQualityRecords.sentiment,
        engagementLevel: callQualityRecords.engagementLevel,
        issues: callQualityRecords.issues,
        recommendations: callQualityRecords.recommendations,
        identityConfirmed: callQualityRecords.identityConfirmed,
        qualificationMet: callQualityRecords.qualificationMet,
        qualityAnalyzedAt: callQualityRecords.analyzedAt,
      })
      .from(dialerCallAttempts)
      .leftJoin(contacts, eq(dialerCallAttempts.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(dialerCallAttempts.campaignId, campaigns.id))
      .leftJoin(callQualityRecords, eq(callQualityRecords.dialerCallAttemptId, dialerCallAttempts.id))
      .where(dialerWhereClause)
      .orderBy(desc(dialerCallAttempts.callStartedAt))
      .limit(limitNum * 2); // Get extra to merge with sessions

    // ========================================
    // QUERY 2: call_sessions (secondary source)
    // ========================================
    const sessionConditions: any[] = [];

    if (campaignId && campaignId !== "all") {
      sessionConditions.push(eq(callSessions.campaignId, campaignId as string));
    }

    if (agentType && agentType !== "all") {
      sessionConditions.push(eq(callSessions.agentType, agentType as "ai" | "human"));
    }

    if (startDate) {
      sessionConditions.push(gte(callSessions.startedAt, new Date(startDate as string)));
    }
    if (endDate) {
      sessionConditions.push(lte(callSessions.startedAt, new Date(endDate as string)));
    }

    if (minDuration) {
      const minDur = parseInt(minDuration as string, 10);
      if (!isNaN(minDur)) {
        sessionConditions.push(gte(callSessions.durationSec, minDur));
      }
    }
    if (maxDuration) {
      const maxDur = parseInt(maxDuration as string, 10);
      if (!isNaN(maxDur)) {
        sessionConditions.push(lte(callSessions.durationSec, maxDur));
      }
    }

    if (phoneNumber) {
      const phone = (phoneNumber as string).trim();
      sessionConditions.push(
        or(
          ilike(callSessions.fromNumber, `%${phone}%`),
          ilike(callSessions.toNumberE164, `%${phone}%`)
        )
      );
    }

    if (disposition && disposition !== "all") {
      sessionConditions.push(eq(callSessions.aiDisposition, disposition as string));
    }

    if (hasTranscript === "true") {
      sessionConditions.push(isNotNull(callSessions.aiTranscript));
    } else if (hasTranscript === "false") {
      sessionConditions.push(isNull(callSessions.aiTranscript));
    }

    if (hasRecording === "true") {
      sessionConditions.push(
        or(
          isNotNull(callSessions.recordingS3Key),
          isNotNull(callSessions.recordingUrl)
        )
      );
    } else if (hasRecording === "false") {
      sessionConditions.push(
        and(
          isNull(callSessions.recordingS3Key),
          isNull(callSessions.recordingUrl)
        )
      );
    }

    if (search) {
      const searchTerm = (search as string).trim();
      sessionConditions.push(
        or(
          ilike(contacts.fullName, `%${searchTerm}%`),
          ilike(contacts.firstName, `%${searchTerm}%`),
          ilike(contacts.lastName, `%${searchTerm}%`),
          ilike(accounts.name, `%${searchTerm}%`),
          ilike(callSessions.aiTranscript, `%${searchTerm}%`),
          ilike(callSessions.toNumberE164, `%${searchTerm}%`)
        )
      );
    }

    const sessionWhereClause = sessionConditions.length > 0 ? and(...sessionConditions) : undefined;

    // Query call_sessions (only if not filtering to dialer only)
    const sessionResults = source === "dialer" ? [] : await db
      .select({
        id: callSessions.id,
        telnyxCallId: callSessions.telnyxCallId,
        fromNumber: callSessions.fromNumber,
        toNumber: callSessions.toNumberE164,
        startedAt: callSessions.startedAt,
        endedAt: callSessions.endedAt,
        durationSec: callSessions.durationSec,
        status: callSessions.status,
        disposition: callSessions.aiDisposition,
        agentType: callSessions.agentType,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingStatus: callSessions.recordingStatus,
        recordingFormat: callSessions.recordingFormat,
        recordingDurationSec: callSessions.recordingDurationSec,
        recordingFileSizeBytes: callSessions.recordingFileSizeBytes,
        transcript: callSessions.aiTranscript,
        contactId: contacts.id,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactFullName: contacts.fullName,
        contactEmail: contacts.email,
        contactPhone: contacts.directPhoneE164,
        contactJobTitle: contacts.jobTitle,
        accountId: accounts.id,
        accountName: accounts.name,
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        qualityId: callQualityRecords.id,
        overallScore: callQualityRecords.overallQualityScore,
        engagementScore: callQualityRecords.engagementScore,
        clarityScore: callQualityRecords.clarityScore,
        empathyScore: callQualityRecords.empathyScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        qualificationScore: callQualityRecords.qualificationScore,
        closingScore: callQualityRecords.closingScore,
        qualitySentiment: callQualityRecords.sentiment,
        engagementLevel: callQualityRecords.engagementLevel,
        issues: callQualityRecords.issues,
        recommendations: callQualityRecords.recommendations,
        identityConfirmed: callQualityRecords.identityConfirmed,
        qualificationMet: callQualityRecords.qualificationMet,
        qualityAnalyzedAt: callQualityRecords.analyzedAt,
        leadId: leads.id,
        leadQaStatus: leads.qaStatus,
      })
      .from(callSessions)
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .leftJoin(callQualityRecords, eq(callQualityRecords.callSessionId, callSessions.id))
      .leftJoin(leads, eq(leads.telnyxCallId, callSessions.telnyxCallId))
      .where(sessionWhereClause)
      .orderBy(desc(callSessions.startedAt))
      .limit(limitNum * 2);

    // ========================================
    // MERGE AND TRANSFORM RESULTS
    // ========================================

    // Transform dialer results to unified format
    const dialerCalls = dialerResults.map((row) => {
      const playableUrl = resolvePlayableRecordingUrl({
        recordingUrl: row.recordingUrl,
      });
      const hasRecording = !!(playableUrl || row.recordingUrl);
      return {
      id: row.id,
      source: 'dialer' as const,
      telnyxCallId: row.telnyxCallId,
      fromNumber: "",
      toNumber: row.phoneDialed,
      startedAt: row.callStartedAt?.toISOString() || "",
      endedAt: row.callEndedAt?.toISOString(),
      durationSec: row.callDurationSeconds || 0,
      status: row.connected ? 'completed' : 'no_answer',
      disposition: row.disposition,
      agentType: row.agentType as "ai" | "human",
      contact: {
        id: row.contactId,
        name: row.contactFullName || `${row.contactFirstName || ""} ${row.contactLastName || ""}`.trim() || "Unknown",
        email: row.contactEmail,
        phone: row.contactPhone || row.phoneDialed,
        jobTitle: row.contactJobTitle,
        company: row.accountName || "Unknown Company",
      },
      campaign: {
        id: row.campaignId,
        name: row.campaignName || "No Campaign",
      },
      recording: {
        available: hasRecording,
        url: playableUrl,
        gcsUrlEndpoint: hasRecording ? `/api/recordings/${row.id}/gcs-url` : null,
        status: hasRecording ? "stored" : "pending",
        format: "mp3",
        durationSec: row.callDurationSeconds,
        fileSizeBytes: undefined,
        s3Key: undefined,
      },
      transcript: {
        available: !!(row.fullTranscript || row.aiTranscript),
        text: row.fullTranscript || row.aiTranscript,
        length: (row.fullTranscript || row.aiTranscript)?.length || 0,
      },
      quality: {
        analyzed: !!row.qualityId,
        overallScore: row.overallScore,
        dimensions: row.qualityId
          ? {
              engagement: row.engagementScore,
              clarity: row.clarityScore,
              empathy: row.empathyScore,
              objectionHandling: row.objectionHandlingScore,
              qualification: row.qualificationScore,
              closing: row.closingScore,
            }
          : undefined,
        sentiment: row.qualitySentiment,
        engagementLevel: row.engagementLevel,
        identityConfirmed: row.identityConfirmed,
        qualificationMet: row.qualificationMet,
        issues: row.issues as any[],
        recommendations: row.recommendations as any[],
        analyzedAt: row.qualityAnalyzedAt?.toISOString(),
      },
        lead: undefined,
      };
    });

    // Transform session results to unified format
    const sessionCalls = sessionResults.map((row) => {
      const playableUrl = resolvePlayableRecordingUrl({
        recordingS3Key: row.recordingS3Key,
        recordingUrl: row.recordingUrl,
      });
      const hasRecording = !!(playableUrl || row.recordingS3Key);
      return {
      id: row.id,
      source: 'session' as const,
      telnyxCallId: row.telnyxCallId,
      fromNumber: row.fromNumber || "",
      toNumber: row.toNumber,
      startedAt: row.startedAt?.toISOString() || "",
      endedAt: row.endedAt?.toISOString(),
      durationSec: row.durationSec || 0,
      status: row.status,
      disposition: row.disposition,
      agentType: row.agentType as "ai" | "human",
      contact: {
        id: row.contactId,
        name: row.contactFullName || `${row.contactFirstName || ""} ${row.contactLastName || ""}`.trim() || "Unknown",
        email: row.contactEmail,
        phone: row.contactPhone || row.toNumber,
        jobTitle: row.contactJobTitle,
        company: row.accountName || "Unknown Company",
      },
      campaign: {
        id: row.campaignId,
        name: row.campaignName || "No Campaign",
      },
      recording: {
        available: hasRecording,
        url: playableUrl,
        gcsUrlEndpoint: hasRecording ? `/api/recordings/${row.id}/gcs-url` : null,
        status: row.recordingStatus || "pending",
        format: row.recordingFormat,
        durationSec: row.recordingDurationSec,
        fileSizeBytes: row.recordingFileSizeBytes,
        s3Key: row.recordingS3Key,
      },
      transcript: {
        available: !!row.transcript,
        text: row.transcript,
        length: row.transcript?.length || 0,
      },
      quality: {
        analyzed: !!row.qualityId,
        overallScore: row.overallScore,
        dimensions: row.qualityId
          ? {
              engagement: row.engagementScore,
              clarity: row.clarityScore,
              empathy: row.empathyScore,
              objectionHandling: row.objectionHandlingScore,
              qualification: row.qualificationScore,
              closing: row.closingScore,
            }
          : undefined,
        sentiment: row.qualitySentiment,
        engagementLevel: row.engagementLevel,
        identityConfirmed: row.identityConfirmed,
        qualificationMet: row.qualificationMet,
        issues: row.issues as any[],
        recommendations: row.recommendations as any[],
        analyzedAt: row.qualityAnalyzedAt?.toISOString(),
      },
        lead: row.leadId
          ? {
              id: row.leadId,
              qaStatus: row.leadQaStatus,
            }
          : undefined,
      };
    });

    // Merge, dedupe by telnyxCallId, and sort
    const seenTelnyxIds = new Set<string>();
    const allCalls = [...dialerCalls, ...sessionCalls].filter((call) => {
      if (call.telnyxCallId && seenTelnyxIds.has(call.telnyxCallId)) {
        return false; // Skip duplicate
      }
      if (call.telnyxCallId) {
        seenTelnyxIds.add(call.telnyxCallId);
      }
      return true;
    });

    // Sort merged results
    const isDescSort = sortOrder === "desc";
    allCalls.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "duration":
          comparison = a.durationSec - b.durationSec;
          break;
        case "qualityScore":
          comparison = (a.quality.overallScore || 0) - (b.quality.overallScore || 0);
          break;
        default:
          comparison = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
      }
      return isDescSort ? -comparison : comparison;
    });

    // Apply pagination
    const paginatedCalls = allCalls.slice(offset, offset + limitNum);
    const totalCount = allCalls.length;

    // Calculate aggregates
    const withTranscripts = allCalls.filter((c) => c.transcript.available).length;
    const withRecordings = allCalls.filter((c) => c.recording.available).length;
    const withAnalysis = allCalls.filter((c) => c.quality.analyzed).length;
    const avgDuration = allCalls.length > 0
      ? Math.round(allCalls.reduce((sum, c) => sum + c.durationSec, 0) / allCalls.length)
      : 0;
    const analyzedCalls = allCalls.filter((c) => c.quality.overallScore !== undefined);
    const avgScore = analyzedCalls.length > 0
      ? Math.round(analyzedCalls.reduce((sum, c) => sum + (c.quality.overallScore || 0), 0) / analyzedCalls.length)
      : 0;

    const sentimentBreakdown = {
      positive: allCalls.filter((c) => c.quality.sentiment === "positive").length,
      neutral: allCalls.filter((c) => c.quality.sentiment === "neutral").length,
      negative: allCalls.filter((c) => c.quality.sentiment === "negative").length,
    };

    res.json({
      success: true,
      data: {
        calls: paginatedCalls,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
        },
        aggregates: {
          totalCalls: totalCount,
          avgQualityScore: avgScore,
          avgDuration,
          sentimentBreakdown,
          withTranscripts,
          withRecordings,
          withAnalysis,
        },
      },
    });
  } catch (error) {
    console.error("[CallIntelligence] Error fetching unified data:", error);
    res.status(500).json({ error: "Failed to retrieve unified call data" });
  }
});

/**
 * GET /api/call-intelligence/unified/:id
 * Get full details for a single call including complete transcript and quality analysis
 * Searches both call_sessions and dialer_call_attempts tables
 */
router.get("/unified/:id", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const { id } = req.params;

    // First try to find in call_sessions
    const [sessionResult] = await db
      .select({
        id: callSessions.id,
        telnyxCallId: callSessions.telnyxCallId,
        fromNumber: callSessions.fromNumber,
        toNumber: callSessions.toNumberE164,
        startedAt: callSessions.startedAt,
        endedAt: callSessions.endedAt,
        durationSec: callSessions.durationSec,
        status: callSessions.status,
        disposition: callSessions.aiDisposition,
        agentType: callSessions.agentType,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingStatus: callSessions.recordingStatus,
        recordingFormat: callSessions.recordingFormat,
        recordingDurationSec: callSessions.recordingDurationSec,
        recordingFileSizeBytes: callSessions.recordingFileSizeBytes,
        transcript: callSessions.aiTranscript,
        contactId: contacts.id,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactFullName: contacts.fullName,
        contactEmail: contacts.email,
        contactPhone: contacts.directPhoneE164,
        contactJobTitle: contacts.jobTitle,
        accountId: accounts.id,
        accountName: accounts.name,
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        qualityId: callQualityRecords.id,
        overallScore: callQualityRecords.overallQualityScore,
        engagementScore: callQualityRecords.engagementScore,
        clarityScore: callQualityRecords.clarityScore,
        empathyScore: callQualityRecords.empathyScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        qualificationScore: callQualityRecords.qualificationScore,
        closingScore: callQualityRecords.closingScore,
        qualitySentiment: callQualityRecords.sentiment,
        engagementLevel: callQualityRecords.engagementLevel,
        identityConfirmed: callQualityRecords.identityConfirmed,
        qualificationMet: callQualityRecords.qualificationMet,
        issues: callQualityRecords.issues,
        recommendations: callQualityRecords.recommendations,
        breakdowns: callQualityRecords.breakdowns,
        qualityAnalyzedAt: callQualityRecords.analyzedAt,
        leadId: leads.id,
        leadQaStatus: leads.qaStatus,
      })
      .from(callSessions)
      .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
      .leftJoin(callQualityRecords, eq(callQualityRecords.callSessionId, callSessions.id))
      .leftJoin(leads, eq(leads.telnyxCallId, callSessions.telnyxCallId))
      .where(eq(callSessions.id, id))
      .limit(1);

    if (sessionResult) {
      // Generate signed URL for single-record detail endpoint
      let recordingUrl: string | null = null;
      if (sessionResult.recordingS3Key) {
        try {
          const signed = await getPresignedDownloadUrl(sessionResult.recordingS3Key, 3600);
          if (signed && !signed.startsWith('gcs-internal://')) {
            recordingUrl = signed;
          }
        } catch (e) { /* fall through */ }
      }
      if (!recordingUrl) {
        recordingUrl = resolvePlayableRecordingUrl({
          recordingS3Key: sessionResult.recordingS3Key,
          recordingUrl: sessionResult.recordingUrl,
        });
      }
      const hasRecording = !!(recordingUrl || sessionResult.recordingS3Key);
      return res.json({
        success: true,
        data: {
          id: sessionResult.id,
          source: 'session',
          telnyxCallId: sessionResult.telnyxCallId,
          fromNumber: sessionResult.fromNumber || "",
          toNumber: sessionResult.toNumber,
          startedAt: sessionResult.startedAt?.toISOString() || "",
          endedAt: sessionResult.endedAt?.toISOString(),
          durationSec: sessionResult.durationSec || 0,
          status: sessionResult.status,
          disposition: sessionResult.disposition,
          agentType: sessionResult.agentType as "ai" | "human",
          contact: {
            id: sessionResult.contactId,
            name: sessionResult.contactFullName || `${sessionResult.contactFirstName || ""} ${sessionResult.contactLastName || ""}`.trim() || "Unknown",
            email: sessionResult.contactEmail,
            phone: sessionResult.contactPhone || sessionResult.toNumber,
            jobTitle: sessionResult.contactJobTitle,
            company: sessionResult.accountName || "Unknown Company",
          },
          campaign: {
            id: sessionResult.campaignId,
            name: sessionResult.campaignName || "No Campaign",
          },
          recording: {
            available: hasRecording,
            url: recordingUrl,
            gcsUrlEndpoint: `/api/recordings/${sessionResult.id}/gcs-url`,
            status: sessionResult.recordingStatus || "pending",
            format: sessionResult.recordingFormat,
            durationSec: sessionResult.recordingDurationSec,
            fileSizeBytes: sessionResult.recordingFileSizeBytes,
            s3Key: sessionResult.recordingS3Key,
          },
          transcript: {
            available: !!sessionResult.transcript,
            text: sessionResult.transcript,
            length: sessionResult.transcript?.length || 0,
          },
          quality: {
            analyzed: !!sessionResult.qualityId,
            overallScore: sessionResult.overallScore,
            dimensions: sessionResult.qualityId
              ? {
                  engagement: sessionResult.engagementScore,
                  clarity: sessionResult.clarityScore,
                  empathy: sessionResult.empathyScore,
                  objectionHandling: sessionResult.objectionHandlingScore,
                  qualification: sessionResult.qualificationScore,
                  closing: sessionResult.closingScore,
                }
              : undefined,
            sentiment: sessionResult.qualitySentiment,
            engagementLevel: sessionResult.engagementLevel,
            identityConfirmed: sessionResult.identityConfirmed,
            qualificationMet: sessionResult.qualificationMet,
            issues: sessionResult.issues as any[],
            recommendations: sessionResult.recommendations as any[],
            breakdowns: sessionResult.breakdowns as any[],
            analyzedAt: sessionResult.qualityAnalyzedAt?.toISOString(),
          },
          lead: sessionResult.leadId
            ? {
                id: sessionResult.leadId,
                qaStatus: sessionResult.leadQaStatus,
              }
            : undefined,
        },
      });
    }

    // If not found in call_sessions, try dialer_call_attempts
    const [dialerResult] = await db
      .select({
        id: dialerCallAttempts.id,
        telnyxCallId: dialerCallAttempts.telnyxCallId,
        phoneDialed: dialerCallAttempts.phoneDialed,
        callStartedAt: dialerCallAttempts.callStartedAt,
        callEndedAt: dialerCallAttempts.callEndedAt,
        callDurationSeconds: dialerCallAttempts.callDurationSeconds,
        disposition: dialerCallAttempts.disposition,
        agentType: dialerCallAttempts.agentType,
        connected: dialerCallAttempts.connected,
        recordingUrl: dialerCallAttempts.recordingUrl,
        fullTranscript: dialerCallAttempts.fullTranscript,
        aiTranscript: dialerCallAttempts.aiTranscript,
        notes: dialerCallAttempts.notes,
        contactId: contacts.id,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactFullName: contacts.fullName,
        contactEmail: contacts.email,
        contactPhone: contacts.directPhoneE164,
        contactJobTitle: contacts.jobTitle,
        accountId: accounts.id,
        accountName: accounts.name,
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        qualityId: callQualityRecords.id,
        overallScore: callQualityRecords.overallQualityScore,
        engagementScore: callQualityRecords.engagementScore,
        clarityScore: callQualityRecords.clarityScore,
        empathyScore: callQualityRecords.empathyScore,
        objectionHandlingScore: callQualityRecords.objectionHandlingScore,
        qualificationScore: callQualityRecords.qualificationScore,
        closingScore: callQualityRecords.closingScore,
        qualitySentiment: callQualityRecords.sentiment,
        engagementLevel: callQualityRecords.engagementLevel,
        identityConfirmed: callQualityRecords.identityConfirmed,
        qualificationMet: callQualityRecords.qualificationMet,
        issues: callQualityRecords.issues,
        recommendations: callQualityRecords.recommendations,
        qualityAnalyzedAt: callQualityRecords.analyzedAt,
      })
      .from(dialerCallAttempts)
      .leftJoin(contacts, eq(dialerCallAttempts.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(dialerCallAttempts.campaignId, campaigns.id))
      .leftJoin(callQualityRecords, eq(callQualityRecords.dialerCallAttemptId, dialerCallAttempts.id))
      .where(eq(dialerCallAttempts.id, id))
      .limit(1);

    if (!dialerResult) {
      return res.status(404).json({
        error: "Call not found",
        id,
      });
    }

    let playableUrl = resolvePlayableRecordingUrl({
      recordingUrl: dialerResult.recordingUrl,
    });

    if (!playableUrl) {
      const gcsKey = extractGcsKeyFromRecordingUrl(dialerResult.recordingUrl);
      if (gcsKey) {
        try {
          const signed = await getPresignedDownloadUrl(gcsKey, 3600);
          if (signed && !signed.startsWith("gcs-internal://")) {
            playableUrl = signed;
          }
        } catch {
          // fall through
        }
      }
    }
    const hasDialerRecording = !!(playableUrl || dialerResult.recordingUrl);

    res.json({
      success: true,
      data: {
        id: dialerResult.id,
        source: 'dialer',
        telnyxCallId: dialerResult.telnyxCallId,
        fromNumber: "",
        toNumber: dialerResult.phoneDialed,
        startedAt: dialerResult.callStartedAt?.toISOString() || "",
        endedAt: dialerResult.callEndedAt?.toISOString(),
        durationSec: dialerResult.callDurationSeconds || 0,
        status: dialerResult.connected ? 'completed' : 'no_answer',
        disposition: dialerResult.disposition,
        agentType: dialerResult.agentType as "ai" | "human",
        contact: {
          id: dialerResult.contactId,
          name: dialerResult.contactFullName || `${dialerResult.contactFirstName || ""} ${dialerResult.contactLastName || ""}`.trim() || "Unknown",
          email: dialerResult.contactEmail,
          phone: dialerResult.contactPhone || dialerResult.phoneDialed,
          jobTitle: dialerResult.contactJobTitle,
          company: dialerResult.accountName || "Unknown Company",
        },
        campaign: {
          id: dialerResult.campaignId,
          name: dialerResult.campaignName || "No Campaign",
        },
        recording: {
          available: hasDialerRecording,
          url: playableUrl,
          gcsUrlEndpoint: `/api/recordings/${dialerResult.id}/gcs-url`,
          status: hasDialerRecording ? "stored" : "pending",
          format: "mp3",
          durationSec: dialerResult.callDurationSeconds,
          fileSizeBytes: undefined,
          s3Key: undefined,
        },
        transcript: {
          available: !!(dialerResult.fullTranscript || dialerResult.aiTranscript),
          text: dialerResult.fullTranscript || dialerResult.aiTranscript,
          length: (dialerResult.fullTranscript || dialerResult.aiTranscript)?.length || 0,
        },
        quality: {
          analyzed: !!dialerResult.qualityId,
          overallScore: dialerResult.overallScore,
          dimensions: dialerResult.qualityId
            ? {
                engagement: dialerResult.engagementScore,
                clarity: dialerResult.clarityScore,
                empathy: dialerResult.empathyScore,
                objectionHandling: dialerResult.objectionHandlingScore,
                qualification: dialerResult.qualificationScore,
                closing: dialerResult.closingScore,
              }
            : undefined,
          sentiment: dialerResult.qualitySentiment,
          engagementLevel: dialerResult.engagementLevel,
          identityConfirmed: dialerResult.identityConfirmed,
          qualificationMet: dialerResult.qualificationMet,
          issues: dialerResult.issues as any[],
          recommendations: dialerResult.recommendations as any[],
          analyzedAt: dialerResult.qualityAnalyzedAt?.toISOString(),
        },
        lead: undefined,
      },
    });
  } catch (error) {
    console.error("[CallIntelligence] Error fetching call details:", error);
    res.status(500).json({ error: "Failed to retrieve call details" });
  }
});

/**
 * POST /api/call-intelligence/unified/:id/analyze
 * Trigger conversation quality analysis for a call
 */
router.post("/unified/:id/analyze", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get the call session with transcript
    const [callSession] = await db
      .select()
      .from(callSessions)
      .where(eq(callSessions.id, id))
      .limit(1);

    if (!callSession) {
      return res.status(404).json({ error: "Call session not found" });
    }

    if (!callSession.aiTranscript) {
      return res.status(400).json({ error: "Call has no transcript to analyze" });
    }

    // Check if analysis already exists
    const [existingAnalysis] = await db
      .select()
      .from(callQualityRecords)
      .where(eq(callQualityRecords.callSessionId, id))
      .limit(1);

    if (existingAnalysis) {
      return res.status(400).json({
        error: "Call already has quality analysis",
        qualityRecordId: existingAnalysis.id,
      });
    }

    // Import and run the analyzer
    const { analyzeConversationQuality } = await import("../services/conversation-quality-analyzer");

    // Get campaign details if available
    let campaignDetails = null;
    if (callSession.campaignId) {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, callSession.campaignId))
        .limit(1);
      campaignDetails = campaign;
    }

    // Run analysis
    const analysis = await analyzeConversationQuality({
      transcript: callSession.aiTranscript,
      interactionType: 'live_call',
      analysisStage: 'post_call',
      disposition: callSession.aiDisposition || undefined,
      campaignId: campaignDetails?.id,
      campaignName: campaignDetails?.name,
      campaignObjective: (campaignDetails as any)?.campaignObjective,
    });

    if (!analysis) {
      return res.status(500).json({ error: "Analysis failed" });
    }

    // Store the analysis
    const [qualityRecord] = await db
      .insert(callQualityRecords)
      .values({
        callSessionId: id,
        campaignId: callSession.campaignId,
        contactId: callSession.contactId,
        overallQualityScore: analysis.overallScore,
        engagementScore: analysis.qualityDimensions?.engagement,
        clarityScore: analysis.qualityDimensions?.clarity,
        empathyScore: analysis.qualityDimensions?.empathy,
        objectionHandlingScore: analysis.qualityDimensions?.objectionHandling,
        qualificationScore: analysis.qualityDimensions?.qualification,
        closingScore: analysis.qualityDimensions?.closing,
        sentiment: analysis.learningSignals?.sentiment,
        engagementLevel: analysis.learningSignals?.engagementLevel,
        identityConfirmed: analysis.qualificationAssessment?.metCriteria ?? false,
        qualificationMet: analysis.qualificationAssessment?.metCriteria ?? false,
        issues: analysis.issues,
        recommendations: analysis.recommendations,
        breakdowns: analysis.breakdowns,
        promptUpdates: analysis.promptUpdates,
        nextBestActions: analysis.nextBestActions,
        campaignAlignmentScore: analysis.campaignAlignment?.objectiveAdherence,
        contextUsageScore: analysis.campaignAlignment?.contextUsage,
        talkingPointsCoverageScore: analysis.campaignAlignment?.talkingPointsCoverage,
        missedTalkingPoints: analysis.campaignAlignment?.missedTalkingPoints,
        flowComplianceScore: analysis.flowCompliance?.score,
        missedSteps: analysis.flowCompliance?.missedSteps,
        flowDeviations: analysis.flowCompliance?.deviations,
        assignedDisposition: analysis.dispositionReview?.assignedDisposition,
        expectedDisposition: analysis.dispositionReview?.expectedDisposition,
        dispositionAccurate: analysis.dispositionReview?.isAccurate,
        dispositionNotes: analysis.dispositionReview?.notes,
        transcriptLength: callSession.aiTranscript.length,
        transcriptTruncated: analysis.metadata?.truncated || false,
        fullTranscript: callSession.aiTranscript.substring(0, 12000), // Limit stored transcript
        analysisModel: analysis.metadata?.model || "deepseek-chat",
        analysisStage: "post_call",
        interactionType: "live_call",
        analyzedAt: new Date(),
      })
      .returning();

    res.json({
      success: true,
      qualityRecordId: qualityRecord.id,
      overallScore: analysis.overallScore,
      message: "Quality analysis completed successfully",
    });
  } catch (error) {
    console.error("[CallIntelligence] Error analyzing call:", error);
    res.status(500).json({ error: "Failed to analyze call" });
  }
});

/**
 * POST /api/call-intelligence/feedback
 * Submit feedback on call quality analysis
 * This feedback is used to improve AI analysis accuracy over time
 */
router.post("/feedback", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const { callSessionId, rating, comment, analysisAccurate, dispositionCorrect } = req.body;

    if (!callSessionId) {
      return res.status(400).json({ error: "callSessionId is required" });
    }

    // Store feedback in the call_quality_records table as JSON
    const [existingRecord] = await db
      .select()
      .from(callQualityRecords)
      .where(eq(callQualityRecords.callSessionId, callSessionId))
      .limit(1);

    if (!existingRecord) {
      return res.status(404).json({ error: "No quality record found for this call" });
    }

    // Update the quality record with feedback
    const feedback = {
      rating,
      comment,
      analysisAccurate,
      dispositionCorrect,
      submittedAt: new Date().toISOString(),
    };

    // Get existing prompt updates or initialize as array
    const existingFeedback = (existingRecord.promptUpdates as any[]) || [];
    
    await db
      .update(callQualityRecords)
      .set({
        // Store feedback in promptUpdates for now (can add dedicated column later)
        promptUpdates: [...existingFeedback, { type: 'user_feedback', ...feedback }],
        updatedAt: new Date(),
      })
      .where(eq(callQualityRecords.id, existingRecord.id));

    console.log(
      `[CallIntelligence] ✅ Feedback logged for call ${callSessionId}`,
      `| Rating: ${rating}`,
      `| Accurate: ${analysisAccurate}`,
      `| Disposition Correct: ${dispositionCorrect}`
    );

    res.json({
      success: true,
      message: "Feedback submitted successfully",
    });
  } catch (error) {
    console.error("[CallIntelligence] Error submitting feedback:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

/**
 * GET /api/call-intelligence/stats
 * Get overall call intelligence statistics
 */
router.get("/stats", requireAuth, async (req, res) => {
  try {
    // Get overall stats
    const stats = await db.execute(sql`
      SELECT 
        count(*) as total_calls,
        count(case when recording_url is not null or recording_s3_key is not null then 1 end) as with_recording,
        count(case when recording_s3_key is not null then 1 end) as stored_in_gcs,
        count(case when ai_transcript is not null then 1 end) as with_transcript
      FROM call_sessions
    `);

    const qualityStats = await db.execute(sql`
      SELECT 
        count(*) as total_analyzed,
        round(avg(overall_quality_score)::numeric, 1) as avg_score,
        count(case when sentiment = 'positive' then 1 end) as positive_sentiment,
        count(case when sentiment = 'neutral' then 1 end) as neutral_sentiment,
        count(case when sentiment = 'negative' then 1 end) as negative_sentiment
      FROM call_quality_records
      WHERE overall_quality_score IS NOT NULL
    `);

    // Get pending items counts
    const pendingRecordings = await db.execute(sql`
      SELECT count(*) as count
      FROM call_sessions
      WHERE recording_url IS NOT NULL 
      AND recording_s3_key IS NULL
    `);

    const pendingTranscripts = await db.execute(sql`
      SELECT count(*) as count
      FROM call_sessions
      WHERE (recording_url IS NOT NULL OR recording_s3_key IS NOT NULL)
      AND ai_transcript IS NULL
    `);

    const pendingAnalysis = await db.execute(sql`
      SELECT count(*) as count
      FROM call_sessions cs
      WHERE cs.ai_transcript IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM call_quality_records cqr 
        WHERE cqr.call_session_id = cs.id
      )
    `);

    res.json({
      success: true,
      data: {
        sessions: {
          total: parseInt(stats.rows[0].total_calls as string),
          withRecording: parseInt(stats.rows[0].with_recording as string),
          storedInGcs: parseInt(stats.rows[0].stored_in_gcs as string),
          withTranscript: parseInt(stats.rows[0].with_transcript as string),
        },
        quality: {
          totalAnalyzed: parseInt(qualityStats.rows[0].total_analyzed as string),
          avgScore: parseFloat(qualityStats.rows[0].avg_score as string) || 0,
          sentiment: {
            positive: parseInt(qualityStats.rows[0].positive_sentiment as string),
            neutral: parseInt(qualityStats.rows[0].neutral_sentiment as string),
            negative: parseInt(qualityStats.rows[0].negative_sentiment as string),
          },
        },
        pending: {
          recordingsNotInGcs: parseInt(pendingRecordings.rows[0].count as string),
          needsTranscript: parseInt(pendingTranscripts.rows[0].count as string),
          needsAnalysis: parseInt(pendingAnalysis.rows[0].count as string),
        },
      },
    });
  } catch (error) {
    console.error("[CallIntelligence] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/**
 * GET /api/call-intelligence/transcription-health
 * Breakdown of transcription coverage for calls with recordings.
 * Supports daily/weekly/monthly period, campaign filter, date range, duration range.
 */
router.get("/transcription-health", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string, 10) || 14));
    const minDuration = Math.max(0, parseInt(req.query.minDuration as string, 10) || 30);
    const maxDuration = req.query.maxDuration ? Math.max(0, parseInt(req.query.maxDuration as string, 10)) : null;
    const period = (['daily', 'weekly', 'monthly'].includes(req.query.period as string)) ? req.query.period as string : 'daily';
    const campaignId = req.query.campaignId as string;
    const hasCampaignFilter = campaignId && campaignId !== 'all';

    // Date range: explicit or derived from days
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - days * 86400000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    // Period grouping SQL expression
    const periodExpr = period === 'weekly' ? sql`DATE_TRUNC('week', started_at)` :
                       period === 'monthly' ? sql`DATE_TRUNC('month', started_at)` :
                       sql`DATE(started_at)`;
    const dialerPeriodExpr = period === 'weekly' ? sql`DATE_TRUNC('week', call_started_at)` :
                             period === 'monthly' ? sql`DATE_TRUNC('month', call_started_at)` :
                             sql`DATE(call_started_at)`;

    const durationFilter = maxDuration
      ? sql`AND COALESCE(duration_sec, 0) > ${minDuration} AND COALESCE(duration_sec, 0) <= ${maxDuration}`
      : sql`AND COALESCE(duration_sec, 0) > ${minDuration}`;
    const dialerDurationFilter = maxDuration
      ? sql`AND COALESCE(call_duration_seconds, 0) > ${minDuration} AND COALESCE(call_duration_seconds, 0) <= ${maxDuration}`
      : sql`AND COALESCE(call_duration_seconds, 0) > ${minDuration}`;

    // Breakdown from call_sessions
    const sessionsDaily = await db.execute(sql`
      SELECT
        ${periodExpr} AS day,
        count(*) AS total,
        count(CASE WHEN ai_transcript IS NOT NULL AND length(ai_transcript) >= 20 THEN 1 END) AS with_transcript,
        count(CASE WHEN ai_transcript IS NULL OR length(ai_transcript) < 20 THEN 1 END) AS missing_transcript,
        count(CASE WHEN EXISTS (
          SELECT 1 FROM call_quality_records cqr WHERE cqr.call_session_id = call_sessions.id
        ) THEN 1 END) AS with_analysis,
        count(CASE WHEN NOT EXISTS (
          SELECT 1 FROM call_quality_records cqr WHERE cqr.call_session_id = call_sessions.id
        ) THEN 1 END) AS missing_analysis,
        COALESCE(ROUND(AVG(COALESCE(duration_sec, 0))), 0) AS avg_duration
      FROM call_sessions
      WHERE started_at >= ${startDate}
        AND started_at <= ${endDate}
        AND (recording_url IS NOT NULL OR recording_s3_key IS NOT NULL)
        ${durationFilter}
        AND (${hasCampaignFilter ? sql`campaign_id = ${campaignId}` : sql`TRUE`})
      GROUP BY ${periodExpr}
      ORDER BY day DESC
    `);

    // Breakdown from dialer_call_attempts
    const dialerDaily = await db.execute(sql`
      SELECT
        ${dialerPeriodExpr} AS day,
        count(*) AS total,
        count(CASE WHEN (full_transcript IS NOT NULL AND length(full_transcript) >= 20)
                     OR (ai_transcript IS NOT NULL AND length(ai_transcript) >= 20) THEN 1 END) AS with_transcript,
        count(CASE WHEN (full_transcript IS NULL OR length(full_transcript) < 20)
                   AND (ai_transcript IS NULL OR length(ai_transcript) < 20) THEN 1 END) AS missing_transcript,
        COALESCE(ROUND(AVG(COALESCE(call_duration_seconds, 0))), 0) AS avg_duration
      FROM dialer_call_attempts
      WHERE call_started_at >= ${startDate}
        AND call_started_at <= ${endDate}
        AND recording_url IS NOT NULL
        ${dialerDurationFilter}
        AND (${hasCampaignFilter ? sql`campaign_id = ${campaignId}` : sql`TRUE`})
      GROUP BY ${dialerPeriodExpr}
      ORDER BY day DESC
    `);

    // Merge into a single map by period bucket
    const dailyMap = new Map<string, {
      day: string;
      totalRecordings: number;
      withTranscript: number;
      missingTranscript: number;
      withAnalysis: number;
      missingAnalysis: number;
      avgDuration: number;
      _avgCount: number;
    }>();

    for (const row of sessionsDaily.rows) {
      const dayStr = new Date(row.day as string).toISOString().split('T')[0];
      const entry = dailyMap.get(dayStr) || {
        day: dayStr, totalRecordings: 0, withTranscript: 0, missingTranscript: 0,
        withAnalysis: 0, missingAnalysis: 0, avgDuration: 0, _avgCount: 0,
      };
      const total = parseInt(row.total as string);
      entry.totalRecordings += total;
      entry.withTranscript += parseInt(row.with_transcript as string);
      entry.missingTranscript += parseInt(row.missing_transcript as string);
      entry.withAnalysis += parseInt(row.with_analysis as string);
      entry.missingAnalysis += parseInt(row.missing_analysis as string);
      entry.avgDuration = ((entry.avgDuration * entry._avgCount) + (parseInt(row.avg_duration as string) * total)) / (entry._avgCount + total);
      entry._avgCount += total;
      dailyMap.set(dayStr, entry);
    }

    for (const row of dialerDaily.rows) {
      if (!row.day) continue;
      const dayStr = new Date(row.day as string).toISOString().split('T')[0];
      const entry = dailyMap.get(dayStr) || {
        day: dayStr, totalRecordings: 0, withTranscript: 0, missingTranscript: 0,
        withAnalysis: 0, missingAnalysis: 0, avgDuration: 0, _avgCount: 0,
      };
      const total = parseInt(row.total as string);
      entry.totalRecordings += total;
      entry.withTranscript += parseInt(row.with_transcript as string);
      entry.missingTranscript += parseInt(row.missing_transcript as string);
      entry.avgDuration = ((entry.avgDuration * entry._avgCount) + (parseInt(row.avg_duration as string) * total)) / (entry._avgCount + total);
      entry._avgCount += total;
      dailyMap.set(dayStr, entry);
    }

    const daily = Array.from(dailyMap.values())
      .map(({ _avgCount, ...rest }) => ({ ...rest, avgDuration: Math.round(rest.avgDuration) }))
      .sort((a, b) => b.day.localeCompare(a.day));

    // Calculate summary totals for the full range
    const totalSummary = {
      totalRecordings: daily.reduce((s, d) => s + d.totalRecordings, 0),
      withTranscript: daily.reduce((s, d) => s + d.withTranscript, 0),
      missingTranscript: daily.reduce((s, d) => s + d.missingTranscript, 0),
      withAnalysis: daily.reduce((s, d) => s + d.withAnalysis, 0),
      missingAnalysis: daily.reduce((s, d) => s + d.missingAnalysis, 0),
      coveragePercent: 0,
      avgDuration: daily.length > 0 ? Math.round(daily.reduce((s, d) => s + d.avgDuration * d.totalRecordings, 0) / Math.max(1, daily.reduce((s, d) => s + d.totalRecordings, 0))) : 0,
    };
    totalSummary.coveragePercent = totalSummary.totalRecordings > 0
      ? Math.round((totalSummary.withTranscript / totalSummary.totalRecordings) * 100) : 0;

    // Also compute last7/last14 for backward compat
    const last7 = daily.filter(d => (Date.now() - new Date(d.day).getTime()) / 86400000 <= 7);
    const last7Summary = {
      totalRecordings: last7.reduce((s, d) => s + d.totalRecordings, 0),
      withTranscript: last7.reduce((s, d) => s + d.withTranscript, 0),
      missingTranscript: last7.reduce((s, d) => s + d.missingTranscript, 0),
      withAnalysis: last7.reduce((s, d) => s + d.withAnalysis, 0),
      missingAnalysis: last7.reduce((s, d) => s + d.missingAnalysis, 0),
      coveragePercent: 0,
    };
    last7Summary.coveragePercent = last7Summary.totalRecordings > 0
      ? Math.round((last7Summary.withTranscript / last7Summary.totalRecordings) * 100) : 0;

    // Per-campaign breakdown
    const sessionsByCampaign = await db.execute(sql`
      SELECT
        cs.campaign_id,
        c.name AS campaign_name,
        count(*) AS total,
        count(CASE WHEN cs.ai_transcript IS NOT NULL AND length(cs.ai_transcript) >= 20 THEN 1 END) AS with_transcript,
        count(CASE WHEN cs.ai_transcript IS NULL OR length(cs.ai_transcript) < 20 THEN 1 END) AS missing_transcript,
        COALESCE(ROUND(AVG(COALESCE(cs.duration_sec, 0))), 0) AS avg_duration
      FROM call_sessions cs
      LEFT JOIN campaigns c ON cs.campaign_id = c.id
      WHERE cs.started_at >= ${startDate}
        AND cs.started_at <= ${endDate}
        AND (cs.recording_url IS NOT NULL OR cs.recording_s3_key IS NOT NULL)
        ${durationFilter}
        AND cs.campaign_id IS NOT NULL
      GROUP BY cs.campaign_id, c.name
    `);

    const dialerByCampaign = await db.execute(sql`
      SELECT
        dca.campaign_id,
        c.name AS campaign_name,
        count(*) AS total,
        count(CASE WHEN (dca.full_transcript IS NOT NULL AND length(dca.full_transcript) >= 20)
                     OR (dca.ai_transcript IS NOT NULL AND length(dca.ai_transcript) >= 20) THEN 1 END) AS with_transcript,
        count(CASE WHEN (dca.full_transcript IS NULL OR length(dca.full_transcript) < 20)
                   AND (dca.ai_transcript IS NULL OR length(dca.ai_transcript) < 20) THEN 1 END) AS missing_transcript,
        COALESCE(ROUND(AVG(COALESCE(dca.call_duration_seconds, 0))), 0) AS avg_duration
      FROM dialer_call_attempts dca
      LEFT JOIN campaigns c ON dca.campaign_id = c.id
      WHERE dca.call_started_at >= ${startDate}
        AND dca.call_started_at <= ${endDate}
        AND dca.recording_url IS NOT NULL
        ${dialerDurationFilter}
        AND dca.campaign_id IS NOT NULL
      GROUP BY dca.campaign_id, c.name
    `);

    const campaignMap = new Map<string, {
      campaignId: string; campaignName: string;
      totalRecordings: number; withTranscript: number; missingTranscript: number;
      coveragePercent: number; avgDuration: number; _avgCount: number;
    }>();

    for (const row of [...sessionsByCampaign.rows, ...dialerByCampaign.rows]) {
      const cid = row.campaign_id as string;
      const entry = campaignMap.get(cid) || {
        campaignId: cid, campaignName: (row.campaign_name as string) || 'Unknown',
        totalRecordings: 0, withTranscript: 0, missingTranscript: 0,
        coveragePercent: 0, avgDuration: 0, _avgCount: 0,
      };
      const total = parseInt(row.total as string);
      entry.totalRecordings += total;
      entry.withTranscript += parseInt(row.with_transcript as string);
      entry.missingTranscript += parseInt(row.missing_transcript as string);
      if (!entry.campaignName || entry.campaignName === 'Unknown') entry.campaignName = (row.campaign_name as string) || 'Unknown';
      entry.avgDuration = ((entry.avgDuration * entry._avgCount) + (parseInt(row.avg_duration as string) * total)) / (entry._avgCount + total);
      entry._avgCount += total;
      campaignMap.set(cid, entry);
    }

    const byCampaign = Array.from(campaignMap.values())
      .map(({ _avgCount, ...rest }) => ({
        ...rest,
        avgDuration: Math.round(rest.avgDuration),
        coveragePercent: rest.totalRecordings > 0 ? Math.round((rest.withTranscript / rest.totalRecordings) * 100) : 0,
      }))
      .sort((a, b) => b.totalRecordings - a.totalRecordings);

    res.json({
      success: true,
      data: {
        daily,
        summary: {
          total: totalSummary,
          last7Days: last7Summary,
          last14Days: {
            totalRecordings: daily.reduce((s, d) => s + d.totalRecordings, 0),
            withTranscript: daily.reduce((s, d) => s + d.withTranscript, 0),
            missingTranscript: daily.reduce((s, d) => s + d.missingTranscript, 0),
            withAnalysis: daily.reduce((s, d) => s + d.withAnalysis, 0),
            missingAnalysis: daily.reduce((s, d) => s + d.missingAnalysis, 0),
            coveragePercent: totalSummary.coveragePercent,
          },
        },
        byCampaign,
        period,
        minDuration,
        maxDuration: maxDuration || undefined,
      },
    });
  } catch (error) {
    console.error("[CallIntelligence] Error fetching transcription health:", error);
    res.status(500).json({ error: "Failed to fetch transcription health" });
  }
});

/**
 * GET /api/call-intelligence/transcription-gaps
 * List calls with recordings but missing transcript or analysis.
 * Supports duration range, sorting, date range, pagination.
 */
router.get("/transcription-gaps", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;
    const minDuration = Math.max(0, parseInt(req.query.minDuration as string, 10) || 30);
    const maxDuration = req.query.maxDuration ? Math.max(0, parseInt(req.query.maxDuration as string, 10)) : null;
    const campaignId = req.query.campaignId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const gapType = (req.query.gapType as string) || 'all'; // 'transcript', 'analysis', 'all'
    const sortBy = (['date', 'duration', 'campaign'].includes(req.query.sortBy as string)) ? req.query.sortBy as string : 'date';
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

    // Compute date range in JS
    const since = startDate ? new Date(startDate) : new Date(Date.now() - 14 * 86400000);
    const until = endDate ? new Date(endDate) : new Date();

    // Gap type SQL fragments
    let gapFilter = sql`TRUE`;
    if (gapType === 'transcript') {
      gapFilter = sql`(cs.ai_transcript IS NULL OR length(cs.ai_transcript) < 20)`;
    } else if (gapType === 'analysis') {
      gapFilter = sql`NOT EXISTS (SELECT 1 FROM call_quality_records cqr WHERE cqr.call_session_id = cs.id)`;
    } else {
      gapFilter = sql`(
        (cs.ai_transcript IS NULL OR length(cs.ai_transcript) < 20)
        OR NOT EXISTS (SELECT 1 FROM call_quality_records cqr WHERE cqr.call_session_id = cs.id)
      )`;
    }

    // Campaign filter
    const hasCampaignFilter = campaignId && campaignId !== 'all';

    // Duration range filter
    const csDurationFilter = maxDuration
      ? sql`AND COALESCE(cs.duration_sec, 0) > ${minDuration} AND COALESCE(cs.duration_sec, 0) <= ${maxDuration}`
      : sql`AND COALESCE(cs.duration_sec, 0) > ${minDuration}`;
    const dcaDurationFilter = maxDuration
      ? sql`AND COALESCE(dca.call_duration_seconds, 0) > ${minDuration} AND COALESCE(dca.call_duration_seconds, 0) <= ${maxDuration}`
      : sql`AND COALESCE(dca.call_duration_seconds, 0) > ${minDuration}`;

    // Sort expression for call_sessions
    const csOrderBy = sortBy === 'duration' ? sql`cs.duration_sec` :
                      sortBy === 'campaign' ? sql`c.name` :
                      sql`cs.started_at`;
    const csOrderDir = sortOrder === 'asc' ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`;

    const countResult = await db.execute(sql`
      SELECT count(*) AS total
      FROM call_sessions cs
      WHERE cs.started_at >= ${since}
        AND cs.started_at <= ${until}
        AND (cs.recording_url IS NOT NULL OR cs.recording_s3_key IS NOT NULL)
        ${csDurationFilter}
        AND (${hasCampaignFilter ? sql`cs.campaign_id = ${campaignId}` : sql`TRUE`})
        AND ${gapFilter}
    `);

    const total = parseInt(countResult.rows[0]?.total as string) || 0;

    const rows = await db.execute(sql`
      SELECT
        cs.id,
        'call_sessions' AS source_table,
        cs.to_number_e164 AS phone_number,
        cs.from_number,
        cs.campaign_id,
        c.name AS campaign_name,
        cs.duration_sec,
        cs.started_at,
        cs.agent_type,
        cs.recording_url,
        cs.recording_s3_key,
        cs.telnyx_call_id,
        cs.telnyx_recording_id,
        cs.recording_status,
        CASE WHEN cs.ai_transcript IS NOT NULL AND length(cs.ai_transcript) >= 20 THEN 'completed' ELSE 'missing' END AS transcript_status,
        CASE WHEN EXISTS (SELECT 1 FROM call_quality_records cqr WHERE cqr.call_session_id = cs.id) THEN 'completed' ELSE 'missing' END AS analysis_status
      FROM call_sessions cs
      LEFT JOIN campaigns c ON cs.campaign_id = c.id
      WHERE cs.started_at >= ${since}
        AND cs.started_at <= ${until}
        AND (cs.recording_url IS NOT NULL OR cs.recording_s3_key IS NOT NULL)
        ${csDurationFilter}
        AND (${hasCampaignFilter ? sql`cs.campaign_id = ${campaignId}` : sql`TRUE`})
        AND ${gapFilter}
      ORDER BY ${csOrderBy} ${csOrderDir}
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Also get dialer_call_attempts gaps
    const dcaOrderBy = sortBy === 'duration' ? sql`dca.call_duration_seconds` :
                       sortBy === 'campaign' ? sql`c.name` :
                       sql`dca.call_started_at`;

    const dialerRows = await db.execute(sql`
      SELECT
        dca.id,
        'dialer_call_attempts' AS source_table,
        dca.phone_dialed AS phone_number,
        dca.from_did AS from_number,
        dca.campaign_id,
        c.name AS campaign_name,
        dca.call_duration_seconds AS duration_sec,
        dca.call_started_at AS started_at,
        dca.agent_type,
        dca.recording_url,
        NULL AS recording_s3_key,
        dca.telnyx_call_id,
        dca.telnyx_recording_id,
        NULL AS recording_status,
        CASE WHEN (dca.full_transcript IS NOT NULL AND length(dca.full_transcript) >= 20)
                  OR (dca.ai_transcript IS NOT NULL AND length(dca.ai_transcript) >= 20) THEN 'completed' ELSE 'missing' END AS transcript_status,
        'n/a' AS analysis_status
      FROM dialer_call_attempts dca
      LEFT JOIN campaigns c ON dca.campaign_id = c.id
      WHERE dca.call_started_at >= ${since}
        AND dca.call_started_at <= ${until}
        AND dca.recording_url IS NOT NULL
        ${dcaDurationFilter}
        AND (${hasCampaignFilter ? sql`dca.campaign_id = ${campaignId}` : sql`TRUE`})
        AND (
          (dca.full_transcript IS NULL OR length(dca.full_transcript) < 20)
          AND (dca.ai_transcript IS NULL OR length(dca.ai_transcript) < 20)
        )
      ORDER BY ${dcaOrderBy} ${csOrderDir}
      LIMIT ${limit}
    `);

    // Count dialer gaps too
    const dialerCountResult = await db.execute(sql`
      SELECT count(*) AS total
      FROM dialer_call_attempts dca
      WHERE dca.call_started_at >= ${since}
        AND dca.call_started_at <= ${until}
        AND dca.recording_url IS NOT NULL
        ${dcaDurationFilter}
        AND (${hasCampaignFilter ? sql`dca.campaign_id = ${campaignId}` : sql`TRUE`})
        AND (
          (dca.full_transcript IS NULL OR length(dca.full_transcript) < 20)
          AND (dca.ai_transcript IS NULL OR length(dca.ai_transcript) < 20)
        )
    `);
    const dialerTotal = parseInt(dialerCountResult.rows[0]?.total as string) || 0;

    // Merge and sort results
    const sortFn = (a: any, b: any) => {
      if (sortBy === 'duration') {
        const da = Number(a.duration_sec) || 0, db2 = Number(b.duration_sec) || 0;
        return sortOrder === 'asc' ? da - db2 : db2 - da;
      }
      if (sortBy === 'campaign') {
        const ca = (a.campaign_name || '').toLowerCase(), cb = (b.campaign_name || '').toLowerCase();
        return sortOrder === 'asc' ? ca.localeCompare(cb) : cb.localeCompare(ca);
      }
      return sortOrder === 'asc'
        ? new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        : new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    };

    const allGaps = [...rows.rows, ...dialerRows.rows].sort(sortFn).slice(0, limit);
    const grandTotal = total + dialerTotal;

    res.json({
      success: true,
      data: {
        gaps: allGaps,
        pagination: {
          page,
          limit,
          total: grandTotal,
          totalPages: Math.ceil(grandTotal / limit),
        },
      },
    });
  } catch (error) {
    console.error("[CallIntelligence] Error fetching transcription gaps:", error);
    res.status(500).json({ error: "Failed to fetch transcription gaps" });
  }
});

/**
 * GET /api/call-intelligence/transcription-calls
 * List ALL calls (transcribed + untranscribed) with transcription status for the Call Explorer tab.
 * Supports filtering by transcription status, campaign, date range, duration, and sorting.
 */
router.get("/transcription-calls", requireAuth, requireRole('admin', 'manager', 'qa_analyst'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;
    const minDuration = Math.max(0, parseInt(req.query.minDuration as string, 10) || 30);
    const maxDuration = req.query.maxDuration ? Math.max(0, parseInt(req.query.maxDuration as string, 10)) : null;
    const campaignId = req.query.campaignId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const transcriptionStatus = (req.query.transcriptionStatus as string) || 'all'; // 'all', 'transcribed', 'missing'
    const sortBy = (['date', 'duration', 'campaign'].includes(req.query.sortBy as string)) ? req.query.sortBy as string : 'date';
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

    const since = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 86400000);
    const until = endDate ? new Date(endDate) : new Date();

    console.log('[CallIntelligence] /transcription-calls params:', { page, limit, offset, minDuration, maxDuration, since: since.toISOString(), until: until.toISOString(), transcriptionStatus, campaignId: campaignId || 'none', sortBy, sortOrder });

    const hasCampaignFilter = campaignId && campaignId !== 'all';

    // Duration filters
    const csDurationFilter = maxDuration
      ? sql`AND COALESCE(cs.duration_sec, 0) > ${minDuration} AND COALESCE(cs.duration_sec, 0) <= ${maxDuration}`
      : sql`AND COALESCE(cs.duration_sec, 0) > ${minDuration}`;
    const dcaDurationFilter = maxDuration
      ? sql`AND COALESCE(dca.call_duration_seconds, 0) > ${minDuration} AND COALESCE(dca.call_duration_seconds, 0) <= ${maxDuration}`
      : sql`AND COALESCE(dca.call_duration_seconds, 0) > ${minDuration}`;

    // Transcription status filter for call_sessions
    let csTranscriptFilter = sql`TRUE`;
    if (transcriptionStatus === 'transcribed') {
      csTranscriptFilter = sql`(cs.ai_transcript IS NOT NULL AND length(cs.ai_transcript) >= 20)`;
    } else if (transcriptionStatus === 'missing') {
      csTranscriptFilter = sql`(cs.ai_transcript IS NULL OR length(cs.ai_transcript) < 20)`;
    }

    // Transcription status filter for dialer
    let dcaTranscriptFilter = sql`TRUE`;
    if (transcriptionStatus === 'transcribed') {
      dcaTranscriptFilter = sql`(
        (dca.full_transcript IS NOT NULL AND length(dca.full_transcript) >= 20)
        OR (dca.ai_transcript IS NOT NULL AND length(dca.ai_transcript) >= 20)
      )`;
    } else if (transcriptionStatus === 'missing') {
      dcaTranscriptFilter = sql`(
        (dca.full_transcript IS NULL OR length(dca.full_transcript) < 20)
        AND (dca.ai_transcript IS NULL OR length(dca.ai_transcript) < 20)
      )`;
    }

    // Sort expressions
    const csOrderBy = sortBy === 'duration' ? sql`cs.duration_sec` :
                      sortBy === 'campaign' ? sql`c.name` :
                      sql`cs.started_at`;
    const csOrderDir = sortOrder === 'asc' ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`;

    // Count call_sessions — counts are ALWAYS unfiltered by transcript status so status cards show global totals
    const csCountResult = await db.execute(sql`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE cs.ai_transcript IS NOT NULL AND length(cs.ai_transcript) >= 20) AS transcribed,
             count(*) FILTER (WHERE cs.ai_transcript IS NULL OR length(cs.ai_transcript) < 20) AS missing
      FROM call_sessions cs
      WHERE cs.started_at >= ${since}
        AND cs.started_at <= ${until}
        AND (cs.recording_url IS NOT NULL OR cs.recording_s3_key IS NOT NULL)
        ${csDurationFilter}
        AND (${hasCampaignFilter ? sql`cs.campaign_id = ${campaignId}` : sql`TRUE`})
    `);

    // Count dialer_call_attempts — counts are ALWAYS unfiltered by transcript status
    const dcaCountResult = await db.execute(sql`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE (dca.full_transcript IS NOT NULL AND length(dca.full_transcript) >= 20)
                                 OR (dca.ai_transcript IS NOT NULL AND length(dca.ai_transcript) >= 20)) AS transcribed,
             count(*) FILTER (WHERE (dca.full_transcript IS NULL OR length(dca.full_transcript) < 20)
                                AND (dca.ai_transcript IS NULL OR length(dca.ai_transcript) < 20)) AS missing
      FROM dialer_call_attempts dca
      WHERE dca.call_started_at >= ${since}
        AND dca.call_started_at <= ${until}
        AND dca.recording_url IS NOT NULL
        ${dcaDurationFilter}
        AND (${hasCampaignFilter ? sql`dca.campaign_id = ${campaignId}` : sql`TRUE`})
    `);

    const csTotal = parseInt(csCountResult.rows[0]?.total as string) || 0;
    const dcaTotal = parseInt(dcaCountResult.rows[0]?.total as string) || 0;
    const grandTotal = csTotal + dcaTotal;
    const totalTranscribed = (parseInt(csCountResult.rows[0]?.transcribed as string) || 0)
                           + (parseInt(dcaCountResult.rows[0]?.transcribed as string) || 0);
    const totalMissing = (parseInt(csCountResult.rows[0]?.missing as string) || 0)
                       + (parseInt(dcaCountResult.rows[0]?.missing as string) || 0);

    // Fetch call_sessions rows
    const csRows = await db.execute(sql`
      SELECT
        cs.id,
        'call_sessions' AS source_table,
        cs.to_number_e164 AS phone_number,
        cs.from_number,
        cs.campaign_id,
        c.name AS campaign_name,
        cs.duration_sec,
        cs.started_at,
        cs.agent_type,
        cs.recording_url,
        cs.recording_s3_key,
        cs.telnyx_call_id,
        cs.telnyx_recording_id,
        cs.recording_status,
        CASE WHEN cs.ai_transcript IS NOT NULL AND length(cs.ai_transcript) >= 20 THEN 'completed' ELSE 'missing' END AS transcript_status,
        CASE WHEN EXISTS (SELECT 1 FROM call_quality_records cqr WHERE cqr.call_session_id = cs.id) THEN 'completed' ELSE 'missing' END AS analysis_status
      FROM call_sessions cs
      LEFT JOIN campaigns c ON cs.campaign_id = c.id
      WHERE cs.started_at >= ${since}
        AND cs.started_at <= ${until}
        AND (cs.recording_url IS NOT NULL OR cs.recording_s3_key IS NOT NULL)
        ${csDurationFilter}
        AND (${hasCampaignFilter ? sql`cs.campaign_id = ${campaignId}` : sql`TRUE`})
        AND ${csTranscriptFilter}
      ORDER BY ${csOrderBy} ${csOrderDir}
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Fetch dialer rows
    const dcaOrderBy = sortBy === 'duration' ? sql`dca.call_duration_seconds` :
                       sortBy === 'campaign' ? sql`c.name` :
                       sql`dca.call_started_at`;

    const dcaRows = await db.execute(sql`
      SELECT
        dca.id,
        'dialer_call_attempts' AS source_table,
        dca.phone_dialed AS phone_number,
        dca.from_did AS from_number,
        dca.campaign_id,
        c.name AS campaign_name,
        dca.call_duration_seconds AS duration_sec,
        dca.call_started_at AS started_at,
        dca.agent_type,
        dca.recording_url,
        NULL AS recording_s3_key,
        dca.telnyx_call_id,
        dca.telnyx_recording_id,
        NULL AS recording_status,
        CASE WHEN (dca.full_transcript IS NOT NULL AND length(dca.full_transcript) >= 20)
                  OR (dca.ai_transcript IS NOT NULL AND length(dca.ai_transcript) >= 20) THEN 'completed' ELSE 'missing' END AS transcript_status,
        'n/a' AS analysis_status
      FROM dialer_call_attempts dca
      LEFT JOIN campaigns c ON dca.campaign_id = c.id
      WHERE dca.call_started_at >= ${since}
        AND dca.call_started_at <= ${until}
        AND dca.recording_url IS NOT NULL
        ${dcaDurationFilter}
        AND (${hasCampaignFilter ? sql`dca.campaign_id = ${campaignId}` : sql`TRUE`})
        AND ${dcaTranscriptFilter}
      ORDER BY ${dcaOrderBy} ${csOrderDir}
      LIMIT ${limit} OFFSET ${offset}
    `);

    console.log('[CallIntelligence] /transcription-calls results:', { csRows: csRows.rows.length, dcaRows: dcaRows.rows.length, grandTotal, totalTranscribed, totalMissing });

    // Merge and sort, then paginate
    const sortFn = (a: any, b: any) => {
      if (sortBy === 'duration') {
        const da = Number(a.duration_sec) || 0, db2 = Number(b.duration_sec) || 0;
        return sortOrder === 'asc' ? da - db2 : db2 - da;
      }
      if (sortBy === 'campaign') {
        const ca = (a.campaign_name || '').toLowerCase(), cb = (b.campaign_name || '').toLowerCase();
        return sortOrder === 'asc' ? ca.localeCompare(cb) : cb.localeCompare(ca);
      }
      return sortOrder === 'asc'
        ? new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        : new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    };

    const allCalls = [...csRows.rows, ...dcaRows.rows].sort(sortFn).slice(0, limit);

    res.json({
      success: true,
      data: {
        calls: allCalls,
        counts: {
          total: grandTotal,
          transcribed: totalTranscribed,
          missing: totalMissing,
        },
        pagination: {
          page,
          limit,
          total: grandTotal,
          totalPages: Math.ceil(grandTotal / limit),
        },
      },
    });
  } catch (error) {
    console.error("[CallIntelligence] Error fetching transcription calls:", error);
    res.status(500).json({ error: "Failed to fetch transcription calls" });
  }
});

/**
 * POST /api/call-intelligence/transcription-gaps/regenerate
 * Trigger re-transcription for selected calls.
 * Priority: GCS presigned URL → GCS buffer download → Telnyx fallback
 */
router.post("/transcription-gaps/regenerate", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { callIds, strategy = 'auto' } = req.body as {
      callIds: string[];
      strategy?: 'telnyx_phone_lookup' | 'recording_url' | 'auto';
    };

    if (!callIds || !Array.isArray(callIds) || callIds.length === 0) {
      return res.status(400).json({ error: "callIds array is required" });
    }

    if (callIds.length > 50) {
      return res.status(400).json({ error: "Maximum 50 calls per batch" });
    }

    const results = { queued: 0, succeeded: 0, failed: 0, errors: [] as string[] };

    // Process each call
    for (const callId of callIds) {
      try {
        // First check call_sessions
        const [session] = await db
          .select({
            id: callSessions.id,
            telnyxCallId: callSessions.telnyxCallId,
            telnyxRecordingId: callSessions.telnyxRecordingId,
            recordingUrl: callSessions.recordingUrl,
            recordingS3Key: callSessions.recordingS3Key,
            toNumberE164: callSessions.toNumberE164,
            fromNumber: callSessions.fromNumber,
            startedAt: callSessions.startedAt,
          })
          .from(callSessions)
          .where(eq(callSessions.id, callId))
          .limit(1);

        if (session) {
          let audioUrl: string | null = null;
          const RG = `[Regenerate][${callId}]`;
          console.log(`${RG} call_session found — s3Key=${session.recordingS3Key || 'none'}, recUrl=${(session.recordingUrl || '').slice(0, 80)}, telnyxRecId=${session.telnyxRecordingId || 'none'}, telnyxCallId=${session.telnyxCallId || 'none'}`);

          // ── Strategy A: Presign from recordingS3Key (ALWAYS first — GCS is authoritative) ──
          if (!audioUrl && session.recordingS3Key) {
            try {
              const presigned = await getPresignedDownloadUrl(session.recordingS3Key);
              if (presigned && !presigned.startsWith('gcs-internal://') && !presigned.startsWith('gs://')) {
                audioUrl = presigned;
                console.log(`${RG} Strategy A (presign s3Key) succeeded`);
              } else {
                console.log(`${RG} Strategy A returned non-usable URL: ${(presigned || '').slice(0, 60)}`);
              }
            } catch (e: any) {
              console.log(`${RG} Strategy A failed: ${e.message}`);
            }
          }

          // ── Strategy B: Extract GCS key from recordingUrl and presign (ALWAYS — GCS is authoritative) ──
          if (!audioUrl && session.recordingUrl) {
            try {
              const gcsKey = extractGcsKeyFromRecordingUrl(session.recordingUrl);
              if (gcsKey) {
                const presigned = await getPresignedDownloadUrl(gcsKey);
                if (presigned && !presigned.startsWith('gcs-internal://') && !presigned.startsWith('gs://')) {
                  audioUrl = presigned;
                  console.log(`${RG} Strategy B (presign extracted key) succeeded`);
                } else {
                  console.log(`${RG} Strategy B returned non-usable URL: ${(presigned || '').slice(0, 60)}`);
                }
              }
            } catch (e: any) {
              console.log(`${RG} Strategy B failed: ${e.message}`);
            }
          }

          // ── Strategy C: Recording link resolver (GCS-only first) ──
          if (!audioUrl) {
            try {
              const { getPlayableRecordingLink } = await import("../services/recording-link-resolver");
              const result = await getPlayableRecordingLink(callId, { gcsOnly: true });
              if (result?.url && !result.url.startsWith('gcs-internal://') && !result.url.startsWith('gs://')) {
                audioUrl = result.url;
                console.log(`${RG} Strategy C (getPlayableRecordingLink gcsOnly=true, source=${result.source}) succeeded`);
              } else {
                console.log(`${RG} Strategy C (GCS-only): ${result?.url ? 'non-usable URL' : 'null'}`);
              }
            } catch (e: any) {
              console.log(`${RG} Strategy C failed: ${e.message}`);
            }
          }

          // ── Strategy D: Direct GCS download → buffer transcription (before Telnyx) ──
          let audioBuffer: Buffer | null = null;
          if (!audioUrl) {
            const gcsKey = session.recordingS3Key || extractGcsKeyFromRecordingUrl(session.recordingUrl);
            if (gcsKey) {
              console.log(`${RG} Strategy D: direct GCS download for key ${gcsKey}`);
              audioBuffer = await downloadGcsAudioAsBuffer(gcsKey);
              if (audioBuffer && audioBuffer.length > 1000) {
                console.log(`${RG} Strategy D ✓ downloaded ${audioBuffer.length} bytes`);
              } else {
                console.log(`${RG} Strategy D ✗ buffer ${audioBuffer ? audioBuffer.length : 0} bytes`);
                audioBuffer = null;
              }
            }
          }

          // ── Strategy E: Telnyx fallback via recording link resolver (only if no GCS audio) ──
          if (!audioUrl && !audioBuffer && strategy !== 'recording_url') {
            try {
              const { getPlayableRecordingLink } = await import("../services/recording-link-resolver");
              const result = await getPlayableRecordingLink(callId, { gcsOnly: false });
              if (result?.url && !result.url.startsWith('gcs-internal://') && !result.url.startsWith('gs://')) {
                audioUrl = result.url;
                console.log(`${RG} Strategy E (getPlayableRecordingLink gcsOnly=false, source=${result.source}) succeeded`);
              }
            } catch (e: any) {
              console.log(`${RG} Strategy E failed: ${e.message}`);
            }
          }

          // ── Strategy F: Raw HTTPS recordingUrl (e.g. Telnyx download URL) ──
          if (!audioUrl && !audioBuffer && session.recordingUrl && /^https?:\/\//i.test(session.recordingUrl) && !session.recordingUrl.startsWith('gcs-internal://')) {
            audioUrl = session.recordingUrl;
            console.log(`${RG} Strategy F (raw HTTPS recordingUrl) used`);
          }

          // ── Strategy G: Telnyx phone search (±2 hours — last resort) ──
          if (!audioUrl && !audioBuffer && strategy !== 'recording_url') {
            const phoneNumber = session.toNumberE164 || session.fromNumber;
            if (phoneNumber && session.startedAt) {
              try {
                const { searchRecordingsByDialedNumber } = await import("../services/telnyx-recordings");
                const searchStart = new Date(session.startedAt);
                searchStart.setMinutes(searchStart.getMinutes() - 120);
                const searchEnd = new Date(session.startedAt);
                searchEnd.setMinutes(searchEnd.getMinutes() + 120);

                console.log(`${RG} Strategy G: searching Telnyx by phone ${phoneNumber} (±2h window)`);
                const recordings = await searchRecordingsByDialedNumber(phoneNumber, searchStart, searchEnd);
                const completed = recordings.find(r => r.status === 'completed');
                if (completed) {
                  audioUrl = completed.download_urls?.mp3 || completed.download_urls?.wav || null;
                  console.log(`${RG} Strategy G found recording: ${audioUrl ? 'yes' : 'no'}`);
                  // Backfill telnyx IDs
                  if (audioUrl && (completed.id || completed.call_control_id)) {
                    await db.update(callSessions).set({
                      telnyxRecordingId: completed.id,
                      telnyxCallId: completed.call_control_id,
                      recordingUrl: audioUrl,
                    } as any).where(eq(callSessions.id, callId));
                  }
                } else {
                  console.log(`${RG} Strategy G: no completed recordings found (${recordings.length} total)`);
                }
              } catch (e: any) {
                console.log(`${RG} Strategy G failed: ${e.message}`);
              }
            }
          }

          // ── Final guard ──
          if (audioUrl && (audioUrl.startsWith('gcs-internal://') || audioUrl.startsWith('gs://'))) {
            console.log(`${RG} GUARD: rejecting ${audioUrl.slice(0, 60)} — extracting key for GCS buffer`);
            if (!audioBuffer) {
              const guardKey = extractGcsKeyFromRecordingUrl(audioUrl);
              if (guardKey) {
                audioBuffer = await downloadGcsAudioAsBuffer(guardKey);
                if (audioBuffer && audioBuffer.length > 1000) {
                  console.log(`${RG} GUARD→GCS ✓ downloaded ${audioBuffer.length} bytes`);
                } else {
                  audioBuffer = null;
                }
              }
            }
            audioUrl = null;
          }

          // ── TRANSCRIBE ──
          if (audioBuffer) {
            try {
              console.log(`${RG} Sending ${audioBuffer.length} bytes to Deepgram buffer API...`);
              const { submitToDeepgramBuffer } = await import("../services/deepgram-postcall-transcription");
              const transcript = await submitToDeepgramBuffer(audioBuffer);
              if (transcript && transcript.length >= 20) {
                await db.update(callSessions).set({ aiTranscript: transcript } as any).where(eq(callSessions.id, callId));
                results.succeeded++;
                console.log(`${RG} ✅ Buffer transcription succeeded (${transcript.length} chars)`);
              } else {
                results.failed++;
                results.errors.push(`${callId}: Buffer transcription empty/short (${transcript?.length || 0} chars)`);
                console.log(`${RG} ❌ Buffer transcription empty/short`);
              }
            } catch (e: any) {
              results.failed++;
              results.errors.push(`${callId}: Deepgram buffer error: ${e.message}`);
              console.log(`${RG} ❌ Deepgram buffer error: ${e.message}`);
            }
          } else if (audioUrl) {
            try {
              console.log(`${RG} Sending URL to Deepgram: ${audioUrl.slice(0, 100)}...`);
              const { transcribeFromRecording } = await import("../services/deepgram-postcall-transcription");
              const transcriptResult = await transcribeFromRecording(audioUrl, {
                telnyxCallId: session.telnyxCallId || undefined,
                recordingS3Key: session.recordingS3Key || undefined,
              });
              if (transcriptResult?.transcript && transcriptResult.transcript.length >= 20) {
                await db.update(callSessions).set({ aiTranscript: transcriptResult.transcript } as any).where(eq(callSessions.id, callId));
                results.succeeded++;
                console.log(`${RG} ✅ URL transcription succeeded (${transcriptResult.transcript.length} chars)`);
              } else {
                results.failed++;
                results.errors.push(`${callId}: URL transcription empty/short`);
                console.log(`${RG} ❌ URL transcription empty/short`);
              }
            } catch (e: any) {
              results.failed++;
              results.errors.push(`${callId}: Deepgram URL error: ${e.message}`);
              console.log(`${RG} ❌ Deepgram URL error: ${e.message}`);
            }
          } else {
            results.failed++;
            results.errors.push(`${callId}: No recording found (all strategies A-G exhausted)`);
            console.log(`${RG} ❌ All strategies exhausted — no audio source`);
          }
          results.queued++;
          continue;
        }

        // Check dialer_call_attempts
        const [attempt] = await db
          .select({
            id: dialerCallAttempts.id,
            telnyxCallId: dialerCallAttempts.telnyxCallId,
            recordingUrl: dialerCallAttempts.recordingUrl,
            phoneDialed: dialerCallAttempts.phoneDialed,
            callStartedAt: dialerCallAttempts.callStartedAt,
          })
          .from(dialerCallAttempts)
          .where(eq(dialerCallAttempts.id, callId))
          .limit(1);

        if (attempt) {
          const RG = `[Regenerate][${callId}]`;
          console.log(`${RG} dialer_call_attempt found — recUrl=${(attempt.recordingUrl || '').slice(0, 80)}, telnyxCallId=${attempt.telnyxCallId || 'none'}, phone=${attempt.phoneDialed || 'none'}`);

          let usableRecordingUrl: string | null = null;
          let dialerAudioBuffer: Buffer | null = null;

          // ── GCS Priority: Resolve S3 key from linked call_session ──
          let gcsKeyFromSession: string | null = null;
          try {
            if (attempt.telnyxCallId) {
              const [linkedSession] = await db
                .select({ recordingS3Key: callSessions.recordingS3Key, recordingUrl: callSessions.recordingUrl })
                .from(callSessions)
                .where(eq(callSessions.telnyxCallId, attempt.telnyxCallId))
                .limit(1);
              if (linkedSession?.recordingS3Key) {
                gcsKeyFromSession = linkedSession.recordingS3Key;
              } else if (linkedSession?.recordingUrl) {
                gcsKeyFromSession = extractGcsKeyFromRecordingUrl(linkedSession.recordingUrl);
              }
            }
          } catch { /* no linked session */ }

          // ── Strategy 1: Presign GCS key from linked session ──
          if (gcsKeyFromSession) {
            try {
              const presigned = await getPresignedDownloadUrl(gcsKeyFromSession);
              if (presigned && !presigned.startsWith('gcs-internal://') && !presigned.startsWith('gs://')) {
                usableRecordingUrl = presigned;
                console.log(`${RG} Dialer Strategy 1 (presign session GCS key) succeeded`);
              }
            } catch (e: any) {
              console.log(`${RG} Dialer Strategy 1 failed: ${e.message}`);
            }
          }

          // ── Strategy 2: Extract GCS key from attempt's own recordingUrl ──
          if (!usableRecordingUrl) {
            const attemptRecUrl = attempt.recordingUrl ?? null;
            if (attemptRecUrl) {
              const gcsKey = extractGcsKeyFromRecordingUrl(attemptRecUrl);
              if (gcsKey) {
                try {
                  const presigned = await getPresignedDownloadUrl(gcsKey);
                  if (presigned && !presigned.startsWith('gcs-internal://') && !presigned.startsWith('gs://')) {
                    usableRecordingUrl = presigned;
                    console.log(`${RG} Dialer Strategy 2 (presign attempt GCS key) succeeded`);
                  }
                } catch (e: any) {
                  console.log(`${RG} Dialer Strategy 2 presign failed: ${e.message}`);
                }
              }
            }
          }

          // ── Strategy 3: Direct GCS buffer download (before Telnyx) ──
          if (!usableRecordingUrl) {
            const gcsKey = gcsKeyFromSession || extractGcsKeyFromRecordingUrl(attempt.recordingUrl);
            if (gcsKey) {
              console.log(`${RG} Dialer Strategy 3: direct GCS download for ${gcsKey}`);
              dialerAudioBuffer = await downloadGcsAudioAsBuffer(gcsKey);
              if (dialerAudioBuffer && dialerAudioBuffer.length > 1000) {
                console.log(`${RG} Dialer Strategy 3 ✓ ${dialerAudioBuffer.length} bytes`);
              } else {
                dialerAudioBuffer = null;
              }
            }
          }

          // ── Strategy 4: Telnyx phone search (±2h window — only if no GCS audio) ──
          if (!usableRecordingUrl && !dialerAudioBuffer && (strategy === 'telnyx_phone_lookup' || strategy === 'auto')) {
            if (attempt.phoneDialed && attempt.callStartedAt) {
              try {
                const { searchRecordingsByDialedNumber } = await import("../services/telnyx-recordings");
                const searchStart = new Date(attempt.callStartedAt);
                searchStart.setMinutes(searchStart.getMinutes() - 120);
                const searchEnd = new Date(attempt.callStartedAt);
                searchEnd.setMinutes(searchEnd.getMinutes() + 120);

                console.log(`${RG} Searching Telnyx by phone ${attempt.phoneDialed} (±2h window)`);
                const recordings = await searchRecordingsByDialedNumber(attempt.phoneDialed, searchStart, searchEnd);
                const completed = recordings.find(r => r.status === 'completed');
                if (completed) {
                  const downloadUrl = completed.download_urls?.mp3 || completed.download_urls?.wav;
                  if (downloadUrl) {
                    await db.update(dialerCallAttempts).set({
                      recordingUrl: downloadUrl,
                      telnyxCallId: completed.call_control_id,
                      telnyxRecordingId: completed.id,
                      updatedAt: new Date(),
                    }).where(eq(dialerCallAttempts.id, callId));
                    usableRecordingUrl = downloadUrl;
                    console.log(`${RG} Telnyx phone search found recording`);
                  }
                } else {
                  console.log(`${RG} Telnyx phone search: no completed recordings (${recordings.length} total)`);
                }
              } catch (e: any) {
                console.log(`${RG} Telnyx phone search failed: ${e.message}`);
              }
            }
          }

          // If we have a buffer from GCS, transcribe directly
          if (dialerAudioBuffer) {
            try {
              console.log(`${RG} Dialer: sending ${dialerAudioBuffer.length} bytes to Deepgram buffer API`);
              const { submitToDeepgramBuffer } = await import("../services/deepgram-postcall-transcription");
              const transcript = await submitToDeepgramBuffer(dialerAudioBuffer);
              if (transcript && transcript.length >= 20) {
                await db.update(dialerCallAttempts).set({ fullTranscript: transcript, updatedAt: new Date() }).where(eq(dialerCallAttempts.id, callId));
                results.succeeded++;
                console.log(`${RG} ✅ Dialer buffer transcription succeeded (${transcript.length} chars)`);
              } else {
                results.failed++;
                results.errors.push(`${callId}: Dialer buffer transcription empty/short`);
                console.log(`${RG} ❌ Dialer buffer transcription empty/short`);
              }
            } catch (e: any) {
              results.failed++;
              results.errors.push(`${callId}: Dialer buffer error: ${e.message}`);
              console.log(`${RG} ❌ Dialer buffer error: ${e.message}`);
            }
            results.queued++;
            continue;
          }

          // Fall back to attemptFallbackTranscription with usable URL
          console.log(`${RG} Calling attemptFallbackTranscription with url=${usableRecordingUrl ? usableRecordingUrl.slice(0, 60) : 'null'}`);
          const { attemptFallbackTranscription } = await import("../services/transcription-reliability");
          const result = await attemptFallbackTranscription(callId, usableRecordingUrl, attempt.telnyxCallId);
          results.queued++;
          if (result.success) {
            results.succeeded++;
            console.log(`${RG} ✅ Dialer transcription succeeded`);
          } else {
            results.failed++;
            results.errors.push(`${callId}: ${result.error || 'Unknown error'}`);
            console.log(`${RG} ❌ Dialer transcription failed: ${result.error || 'Unknown'}`);
          }
          continue;
        }

        results.failed++;
        results.errors.push(`${callId}: Call not found`);
      } catch (err: any) {
        results.failed++;
        results.errors.push(`${callId}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      data: {
        queued: results.queued,
        succeeded: results.succeeded,
        failed: results.failed,
        errors: results.errors.slice(0, 20), // Limit error details
      },
    });
  } catch (error: any) {
    console.error("[CallIntelligence] Error regenerating transcriptions:", error);
    res.status(500).json({ error: "Failed to regenerate transcriptions" });
  }
});

/**
 * POST /api/call-intelligence/regeneration/worker/start
 * Start the background transcription regeneration worker
 */
router.post("/regeneration/worker/start", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { startWorker } = await import("../services/transcription-regeneration-worker");
    startWorker();
    const { getStatus } = await import("../services/transcription-regeneration-worker");
    const status = await getStatus();
    res.json({
      success: true,
      message: "Transcription regeneration worker started",
      data: status,
    });
  } catch (error: any) {
    console.error("[CallIntelligence] Error starting worker:", error);
    res.status(500).json({ error: "Failed to start worker" });
  }
});

/**
 * POST /api/call-intelligence/regeneration/worker/stop
 * Stop the background transcription regeneration worker
 */
router.post("/regeneration/worker/stop", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { stopWorker, getStatus } = await import("../services/transcription-regeneration-worker");
    stopWorker();
    const status = await getStatus();
    res.json({
      success: true,
      message: "Transcription regeneration worker stopped",
      data: status,
    });
  } catch (error: any) {
    console.error("[CallIntelligence] Error stopping worker:", error);
    res.status(500).json({ error: "Failed to stop worker" });
  }
});

/**
 * GET /api/call-intelligence/regeneration/worker/status
 * Get current worker status and job statistics
 */
router.get("/regeneration/worker/status", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { getStatus } = await import("../services/transcription-regeneration-worker");
    const status = await getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error("[CallIntelligence] Error fetching worker status:", error);
    res.status(500).json({ error: "Failed to fetch worker status" });
  }
});

/**
 * POST /api/call-intelligence/regeneration/worker/config
 * Update worker configuration (concurrency, batch size, strategy, etc.)
 */
router.post("/regeneration/worker/config", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { concurrency, batchSize, batchDelayMs, strategy, maxRetries, verbose } = req.body;

    // Validate inputs
    if (concurrency !== undefined && (concurrency < 1 || concurrency > 10)) {
      return res.status(400).json({ error: "Concurrency must be between 1 and 10" });
    }
    if (batchSize !== undefined && (batchSize < 1 || batchSize > 50)) {
      return res.status(400).json({ error: "Batch size must be between 1 and 50" });
    }
    if (batchDelayMs !== undefined && batchDelayMs < 100) {
      return res.status(400).json({ error: "Batch delay must be at least 100ms" });
    }

    const { updateConfig, getStatus } = await import("../services/transcription-regeneration-worker");
    const newConfig = { concurrency, batchSize, batchDelayMs, strategy, maxRetries, verbose };
    updateConfig(newConfig);

    const status = await getStatus();
    res.json({
      success: true,
      message: "Configuration updated successfully",
      data: {
        updatedConfig: newConfig,
        currentStatus: status,
      },
    });
  } catch (error: any) {
    console.error("[CallIntelligence] Error updating worker config:", error);
    res.status(500).json({ error: "Failed to update configuration" });
  }
});

/**
 * GET /api/call-intelligence/regeneration/progress
 * Get overall regeneration progress and statistics
 */
router.get("/regeneration/progress", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT status, COUNT(*) as count 
      FROM transcription_regeneration_jobs 
      GROUP BY status
    `)) as any;

    const stats = {
      pending: 0,
      inProgress: 0,
      submitted: 0,
      completed: 0,
      failed: 0,
      total: 0,
    };

    result.rows?.forEach((row: any) => {
      const count = Number(row.count) || 0;
      stats.total += count;
      if (row.status === "pending") stats.pending = count;
      else if (row.status === "in_progress") stats.inProgress = count;
      else if (row.status === "submitted") stats.submitted = count;
      else if (row.status === "completed") stats.completed = count;
      else if (row.status === "failed") stats.failed = count;
    });

    const progressPercent = stats.total > 0
      ? Math.round(((stats.completed + stats.submitted) / stats.total) * 100)
      : 0;

    // Estimate remaining time: ~2 calls/minute processing rate
    const remaining = stats.pending + stats.inProgress;
    const estimatedRemainingMinutes = Math.ceil(remaining / 2);

    res.json({
      success: true,
      data: {
        ...stats,
        progressPercent,
        estimatedRemainingMinutes,
      },
    });
  } catch (error: any) {
    console.error("[CallIntelligence] Error fetching regeneration progress:", error);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

/**
 * POST /api/call-intelligence/regeneration/reset
 * Reset failed/stuck jobs back to pending so they can be retried
 */
router.post("/regeneration/reset", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { statuses = ['failed', 'in_progress', 'submitted'] } = req.body as { statuses?: string[] };
    const allowed = ['failed', 'in_progress', 'submitted'];
    const toReset = statuses.filter(s => allowed.includes(s));

    if (toReset.length === 0) {
      return res.status(400).json({ error: "No valid statuses to reset" });
    }

    const statusList = sql.join(toReset.map(s => sql`${s}`), sql`, `);
    const result = await db.execute(
      sql`UPDATE transcription_regeneration_jobs
          SET status = 'pending', attempts = 0, error = NULL, completed_at = NULL
          WHERE status IN (${statusList})`
    ) as any;

    const resetCount = result.rowCount ?? result.changes ?? 0;
    console.log(`[CallIntelligence] Reset ${resetCount} regeneration jobs (statuses: ${toReset.join(', ')}) back to pending`);

    res.json({ success: true, data: { resetCount, statuses: toReset } });
  } catch (error: any) {
    console.error("[CallIntelligence] Error resetting regeneration jobs:", error);
    res.status(500).json({ error: "Failed to reset jobs" });
  }
});

/**
 * GET /api/call-intelligence/regeneration/jobs
 * List regeneration jobs with filtering and pagination
 */
router.get("/regeneration/jobs", requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 50));
    const offset = (pageNum - 1) * pageSize;

    // Get jobs
    let jobsQuery;
    if (status && typeof status === "string") {
      jobsQuery = sql`SELECT * FROM transcription_regeneration_jobs WHERE status = ${status} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
    } else {
      jobsQuery = sql`SELECT * FROM transcription_regeneration_jobs ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
    }

    const jobsResult = await db.execute(jobsQuery) as any;

    // Get total count
    let countQuery;
    if (status && typeof status === "string") {
      countQuery = sql`SELECT COUNT(*) as total FROM transcription_regeneration_jobs WHERE status = ${status}`;
    } else {
      countQuery = sql`SELECT COUNT(*) as total FROM transcription_regeneration_jobs`;
    }

    const countResult = await db.execute(countQuery) as any;
    const total = Number(countResult.rows?.[0]?.total) || 0;
    const pages = Math.ceil(total / pageSize);

    res.json({
      success: true,
      data: {
        jobs: jobsResult.rows || [],
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          pages,
        },
      },
    });
  } catch (error: any) {
    console.error("[CallIntelligence] Error fetching regeneration jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

export default router;
