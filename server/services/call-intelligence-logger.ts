/**
 * Call Intelligence Logger Service
 *
 * Comprehensive centralized logging system for all call data including:
 * - Call metadata (timestamps, participants, duration)
 * - Transcriptions and conversation turns
 * - Quality metrics and analysis
 * - Conversation intelligence (sentiment, engagement, topics)
 * - Issues, challenges, and recommendations
 * - Prompt improvement suggestions
 * - Feedback for AI training and refinement
 *
 * This ensures complete audit trail and enables comprehensive call review
 */

import { db } from "../db";
import { callQualityRecords, callSessions, dialerCallAttempts } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { ConversationQualityAnalysis } from "./conversation-quality-analyzer";

const LOG_PREFIX = "[CallIntelligenceLogger]";

export interface CallIntelligenceLogInput {
  callSessionId: string;
  dialerCallAttemptId?: string;
  campaignId?: string;
  contactId?: string;
  qualityAnalysis: ConversationQualityAnalysis;
  fullTranscript?: string;
}

export interface CallIntelligenceLogResult {
  success: boolean;
  recordId?: string;
  error?: string;
}

/**
 * Log comprehensive call intelligence data to the database
 * This ensures all calls have complete conversation logs with analysis
 */
export async function logCallIntelligence(
  input: CallIntelligenceLogInput
): Promise<CallIntelligenceLogResult> {
  const { callSessionId, dialerCallAttemptId, campaignId, contactId, qualityAnalysis, fullTranscript } = input;

  try {
    // Verify call session exists
    const [callSession] = await db
      .select({ id: callSessions.id })
      .from(callSessions)
      .where(eq(callSessions.id, callSessionId))
      .limit(1);

    if (!callSession) {
      console.warn(`${LOG_PREFIX} Call session not found: ${callSessionId}`);
      return {
        success: false,
        error: `Call session not found: ${callSessionId}`,
      };
    }

    // Create call quality record with all analysis data
    const [record] = await db
      .insert(callQualityRecords)
      .values({
        callSessionId,
        dialerCallAttemptId: dialerCallAttemptId || null,
        campaignId: campaignId || null,
        contactId: contactId || null,
        
        // Quality metrics
        overallQualityScore: qualityAnalysis.overallScore,
        engagementScore: qualityAnalysis.qualityDimensions.engagement,
        clarityScore: qualityAnalysis.qualityDimensions.clarity,
        empathyScore: qualityAnalysis.qualityDimensions.empathy,
        objectionHandlingScore: qualityAnalysis.qualityDimensions.objectionHandling,
        qualificationScore: qualityAnalysis.qualityDimensions.qualification,
        closingScore: qualityAnalysis.qualityDimensions.closing,
        
        // Conversation intelligence
        sentiment: qualityAnalysis.learningSignals?.sentiment || null,
        engagementLevel: qualityAnalysis.learningSignals?.engagementLevel || null,
        identityConfirmed: qualityAnalysis.qualificationAssessment?.metCriteria ?? null,
        qualificationMet: qualityAnalysis.qualificationAssessment?.metCriteria ?? null,
        
        // Analysis results
        issues: qualityAnalysis.issues,
        recommendations: qualityAnalysis.recommendations,
        breakdowns: qualityAnalysis.breakdowns,
        promptUpdates: qualityAnalysis.promptUpdates,
        performanceGaps: qualityAnalysis.performanceGaps,
        nextBestActions: qualityAnalysis.nextBestActions,
        
        // Campaign alignment
        campaignAlignmentScore: qualityAnalysis.campaignAlignment.objectiveAdherence,
        contextUsageScore: qualityAnalysis.campaignAlignment.contextUsage,
        talkingPointsCoverageScore: qualityAnalysis.campaignAlignment.talkingPointsCoverage,
        missedTalkingPoints: qualityAnalysis.campaignAlignment.missedTalkingPoints,
        
        // Flow compliance
        flowComplianceScore: qualityAnalysis.flowCompliance.score,
        missedSteps: qualityAnalysis.flowCompliance.missedSteps,
        flowDeviations: qualityAnalysis.flowCompliance.deviations,
        
        // Disposition accuracy
        assignedDisposition: qualityAnalysis.dispositionReview?.assignedDisposition || null,
        expectedDisposition: qualityAnalysis.dispositionReview?.expectedDisposition || null,
        dispositionAccurate: qualityAnalysis.dispositionReview?.isAccurate ?? null,
        dispositionNotes: qualityAnalysis.dispositionReview?.notes || [],
        
        // Transcript info
        transcriptLength: qualityAnalysis.metadata?.transcriptLength || 0,
        transcriptTruncated: qualityAnalysis.metadata?.truncated ?? false,
        fullTranscript: fullTranscript || null,
        
        // Analysis metadata
        analysisModel: qualityAnalysis.metadata?.model || "deepseek-chat",
        analysisStage: qualityAnalysis.metadata?.analysisStage || "post_call",
        interactionType: qualityAnalysis.metadata?.interactionType || "live_call",
        analyzedAt: new Date(qualityAnalysis.metadata?.analyzedAt || new Date()),
      })
      .returning();

    console.log(
      `${LOG_PREFIX} ✅ Logged call intelligence for session ${callSessionId}`,
      `| Record: ${record.id}`,
      `| Quality Score: ${qualityAnalysis.overallScore}`,
      `| Issues: ${qualityAnalysis.issues.length}`,
      `| Recommendations: ${qualityAnalysis.recommendations.length}`
    );

    return {
      success: true,
      recordId: record.id,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error logging call intelligence:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Retrieve call quality record with all analysis data
 */
export async function getCallIntelligence(callSessionId: string) {
  try {
    const [record] = await db
      .select()
      .from(callQualityRecords)
      .where(eq(callQualityRecords.callSessionId, callSessionId))
      .limit(1);

    return record || null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error retrieving call intelligence:`, error);
    return null;
  }
}

/**
 * Get call quality summary for reporting
 */
export async function getCallQualitySummary(
  campaignId: string,
  startDate: Date,
  endDate: Date
) {
  try {
    const records = await db
      .select({
        recordId: callQualityRecords.id,
        callSessionId: callQualityRecords.callSessionId,
        overallScore: callQualityRecords.overallQualityScore,
        sentiment: callQualityRecords.sentiment,
        engagementLevel: callQualityRecords.engagementLevel,
        issueCount: callQualityRecords.issues,
        recommendationCount: callQualityRecords.recommendations,
        createdAt: callQualityRecords.createdAt,
      })
      .from(callQualityRecords)
      .where(
        and(
          eq(callQualityRecords.campaignId, campaignId),
          eq(callQualityRecords.createdAt, startDate),
          eq(callQualityRecords.createdAt, endDate)
        )
      );

    // Calculate summary statistics
    const totalCalls = records.length;
    const avgScore = totalCalls > 0 
      ? records.reduce((sum, r) => sum + (r.overallScore || 0), 0) / totalCalls 
      : 0;

    const sentimentCounts = {
      positive: records.filter(r => r.sentiment === "positive").length,
      neutral: records.filter(r => r.sentiment === "neutral").length,
      negative: records.filter(r => r.sentiment === "negative").length,
    };

    const engagementCounts = {
      high: records.filter(r => r.engagementLevel === "high").length,
      medium: records.filter(r => r.engagementLevel === "medium").length,
      low: records.filter(r => r.engagementLevel === "low").length,
    };

    // Aggregate all issues and recommendations
    const allIssues = records
      .flatMap(r => (Array.isArray(r.issueCount) ? r.issueCount : []))
      .filter(Boolean);

    const allRecommendations = records
      .flatMap(r => (Array.isArray(r.recommendationCount) ? r.recommendationCount : []))
      .filter(Boolean);

    return {
      campaignId,
      totalCalls,
      avgScore: Math.round(avgScore),
      sentimentCounts,
      engagementCounts,
      commonIssues: aggregateIssues(allIssues),
      topRecommendations: aggregateRecommendations(allRecommendations),
      period: {
        start: startDate,
        end: endDate,
      },
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting call quality summary:`, error);
    return null;
  }
}

/**
 * Helper to aggregate issues across calls
 */
function aggregateIssues(issues: any[]): Record<string, { count: number; severity: string }> {
  const aggregated: Record<string, { count: number; severity: string }> = {};

  for (const issue of issues) {
    if (issue && issue.type) {
      if (!aggregated[issue.type]) {
        aggregated[issue.type] = { count: 0, severity: issue.severity || "medium" };
      }
      aggregated[issue.type].count++;
    }
  }

  return aggregated;
}

/**
 * Helper to aggregate recommendations across calls
 */
function aggregateRecommendations(
  recommendations: any[]
): Record<string, { count: number; category: string }> {
  const aggregated: Record<string, { count: number; category: string }> = {};

  for (const rec of recommendations) {
    if (rec && rec.suggestedChange) {
      const key = rec.suggestedChange.substring(0, 50); // Use first 50 chars as key
      if (!aggregated[key]) {
        aggregated[key] = { count: 0, category: rec.category || "other" };
      }
      aggregated[key].count++;
    }
  }

  return aggregated;
}

/**
 * Get calls needing attention (low quality scores or critical issues)
 */
export async function getProblematicCalls(
  campaignId: string,
  scoreThreshold: number = 60
) {
  try {
    const records = await db
      .select()
      .from(callQualityRecords)
      .where(
        and(
          eq(callQualityRecords.campaignId, campaignId),
          eq(callQualityRecords.overallQualityScore, scoreThreshold)
        )
      );

    return records.map(r => ({
      recordId: r.id,
      callSessionId: r.callSessionId,
      score: r.overallQualityScore,
      criticalIssues: (r.issues as any[])
        ?.filter((i: any) => i.severity === "high")
        .map((i: any) => i.description) || [],
      recommendations: r.recommendations as any[],
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting problematic calls:`, error);
    return [];
  }
}

/**
 * Export call quality data for analytics/training
 */
export async function exportCallQualityData(
  campaignId: string,
  startDate: Date,
  endDate: Date
) {
  try {
    const records = await db
      .select()
      .from(callQualityRecords)
      .where(
        and(
          eq(callQualityRecords.campaignId, campaignId),
          eq(callQualityRecords.createdAt, startDate),
          eq(callQualityRecords.createdAt, endDate)
        )
      );

    return records.map(r => ({
      callSessionId: r.callSessionId,
      timestamp: r.createdAt,
      metrics: {
        overall: r.overallQualityScore,
        engagement: r.engagementScore,
        clarity: r.clarityScore,
        empathy: r.empathyScore,
        objectionHandling: r.objectionHandlingScore,
        qualification: r.qualificationScore,
        closing: r.closingScore,
      },
      intelligence: {
        sentiment: r.sentiment,
        engagementLevel: r.engagementLevel,
        identityConfirmed: r.identityConfirmed,
        qualificationMet: r.qualificationMet,
      },
      issues: r.issues,
      recommendations: r.recommendations,
      promptUpdates: r.promptUpdates,
      transcript: r.fullTranscript?.substring(0, 500), // First 500 chars for preview
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Error exporting call quality data:`, error);
    return [];
  }
}
