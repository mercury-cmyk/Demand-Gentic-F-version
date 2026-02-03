/**
 * Call Intelligence Routes
 *
 * API endpoints for retrieving and managing call logs, quality metrics,
 * and conversation intelligence data
 */

import { Router } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import { callQualityRecords, callSessions, campaigns, contacts, accounts, leads, dialerCallAttempts } from "@shared/schema";
import { eq, and, gte, lte, desc, or, ilike, isNotNull, isNull, sql, count, avg } from "drizzle-orm";
import { 
  getCallQualitySummary, 
  getProblematicCalls, 
  exportCallQualityData,
  getCallIntelligence,
} from "../services/call-intelligence-logger";

const router = Router();

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
router.get("/campaign/:campaignId", requireAuth, async (req, res) => {
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
router.get("/problematic/:campaignId", requireAuth, async (req, res) => {
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
router.get("/summary/:campaignId", requireAuth, async (req, res) => {
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
router.get("/export/:campaignId", requireAuth, async (req, res) => {
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
router.get("/unified", requireAuth, async (req, res) => {
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
      dialerConditions.push(eq(dialerCallAttempts.disposition, disposition as string));
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
    const dialerCalls = dialerResults.map((row) => ({
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
        available: !!row.recordingUrl,
        status: row.recordingUrl ? "stored" : "pending",
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
    }));

    // Transform session results to unified format
    const sessionCalls = sessionResults.map((row) => ({
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
        available: !!(row.recordingS3Key || row.recordingUrl),
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
    }));

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
router.get("/unified/:id", requireAuth, async (req, res) => {
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
            available: !!(sessionResult.recordingS3Key || sessionResult.recordingUrl),
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
          available: !!dialerResult.recordingUrl,
          status: dialerResult.recordingUrl ? "stored" : "pending",
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
router.post("/unified/:id/analyze", requireAuth, async (req, res) => {
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
      disposition: callSession.aiDisposition || undefined,
      campaign: campaignDetails ? {
        name: campaignDetails.name,
        objective: (campaignDetails as any).campaignObjective,
        context: (campaignDetails as any).campaignContextBrief,
        talkingPoints: (campaignDetails as any).talkingPoints,
      } : undefined,
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
        sentiment: analysis.sentiment,
        engagementLevel: analysis.engagementLevel,
        identityConfirmed: analysis.identityConfirmed,
        qualificationMet: analysis.qualificationMet,
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
router.post("/feedback", requireAuth, async (req, res) => {
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

export default router;
