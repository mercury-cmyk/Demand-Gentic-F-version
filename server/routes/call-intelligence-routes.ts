/**
 * Call Intelligence Routes
 *
 * API endpoints for retrieving and managing call logs, quality metrics,
 * and conversation intelligence data
 */

import { Router } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import { callQualityRecords, callSessions, campaigns, contacts } from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
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

export default router;
