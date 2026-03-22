/**
 * Call Quality Analyzer
 *
 * Comprehensive call quality tracking and analysis system that:
 * - Analyzes transcripts against campaign-defined success criteria
 * - Scores conversation quality
 * - Identifies conversation breakdowns and failure points
 * - Provides actionable insights
 * - Tracks what makes calls successful vs unsuccessful
 *
 * This is the intelligence layer for understanding call performance.
 */

import { db } from "../db";
import {
  leads,
  campaigns,
  dialerCallAttempts,
  activityLog,
  contacts,
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";

const LOG_PREFIX = "[CallQualityAnalyzer]";

// ==================== TYPES ====================

export interface CampaignSuccessCriteria {
  // Required information to capture
  requiredFields: string[];

  // Qualification questions and acceptable responses
  qualificationQuestions: Array;

  // Scoring weights for different aspects
  scoringWeights: {
    contentInterest: number;
    permissionGiven: number;
    complianceConsent: number;
    qualificationAnswers: number;
    dataAccuracy: number;
    engagementLevel: number;
  };

  // Minimum scores to pass
  minimumQualityScore: number;
  minimumEngagementScore: number;

  // Call duration thresholds
  minimumCallDurationSeconds: number;
  optimalCallDurationRange: { min: number; max: number };

  // Objection handling indicators
  objectionKeywords: string[];
  positiveResponseKeywords: string[];
  negativeResponseKeywords: string[];
}

export interface CallQualityScore {
  overallScore: number; // 0-100
  engagementScore: number; // 0-100
  qualificationScore: number; // 0-100
  complianceScore: number; // 0-100

  // Breakdown
  breakdown: {
    callDuration: { score: number; reason: string };
    prospectEngagement: { score: number; reason: string };
    questionsCovered: { score: number; reason: string };
    objectionHandling: { score: number; reason: string };
    closingStrength: { score: number; reason: string };
    dataCapture: { score: number; reason: string };
  };

  // Success indicators
  qualificationStatus: "qualified" | "not_qualified" | "needs_review";
  qualificationReasons: string[];

  // Issues identified
  issues: Array;

  // Recommendations for improvement
  recommendations: string[];
}

export interface ConversationBreakdown {
  phase: string;
  breakdownType:
    | "early_hangup"
    | "objection_unhandled"
    | "no_engagement"
    | "compliance_failure"
    | "technical_issue"
    | "gatekeeper_block"
    | "unknown";
  description: string;
  atSeconds: number;
  transcript: string;
}

export interface CallAnalysisResult {
  callId: string;
  campaignId: string;
  contactId: string;
  analyzedAt: Date;

  // Core metrics
  qualityScore: CallQualityScore;
  conversationBreakdown?: ConversationBreakdown;

  // Transcript analysis
  transcriptSummary: string;
  keyMoments: Array;

  // Campaign alignment
  campaignCriteriaMatch: {
    matched: string[];
    missed: string[];
    partial: string[];
  };

  // Actionable insights
  insights: string[];

  // Raw data for reference
  callDurationSeconds: number;
  disposition: string;
}

// ==================== DEFAULT SUCCESS CRITERIA ====================

const DEFAULT_SUCCESS_CRITERIA: CampaignSuccessCriteria = {
  requiredFields: ["interest_level", "contact_confirmed", "next_steps"],
  qualificationQuestions: [
    {
      question: "Are you the right person to speak to about this?",
      required: true,
      acceptableResponses: ["yes", "i am", "that's me", "correct"],
      weight: 20,
    },
    {
      question: "Is this a good time to talk?",
      required: false,
      acceptableResponses: ["yes", "sure", "go ahead", "i have a few minutes"],
      weight: 10,
    },
  ],
  scoringWeights: {
    contentInterest: 25,
    permissionGiven: 15,
    complianceConsent: 15,
    qualificationAnswers: 25,
    dataAccuracy: 10,
    engagementLevel: 10,
  },
  minimumQualityScore: 60,
  minimumEngagementScore: 40,
  minimumCallDurationSeconds: 30,
  optimalCallDurationRange: { min: 60, max: 300 },
  objectionKeywords: [
    "not interested",
    "no thanks",
    "don't call",
    "remove me",
    "busy",
    "wrong number",
    "not the right person",
  ],
  positiveResponseKeywords: [
    "interested",
    "tell me more",
    "sounds good",
    "yes",
    "sure",
    "okay",
    "go ahead",
    "schedule",
    "book",
    "meeting",
  ],
  negativeResponseKeywords: [
    "no",
    "not interested",
    "don't call",
    "stop calling",
    "remove",
    "unsubscribe",
    "busy",
    "bad time",
  ],
};

// ==================== CAMPAIGN CRITERIA LOADER ====================

/**
 * Load success criteria for a campaign
 */
async function loadCampaignCriteria(campaignId: string): Promise {
  try {
    const [campaign] = await db
      .select({
        type: campaigns.type,
        aiAgentSettings: campaigns.aiAgentSettings,
        qaParams: campaigns.qaParameters,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      console.warn(`${LOG_PREFIX} Campaign ${campaignId} not found, using defaults`);
      return DEFAULT_SUCCESS_CRITERIA;
    }

    // Build criteria from campaign settings
    const criteria = { ...DEFAULT_SUCCESS_CRITERIA };

    // Extract from QA params if available
    if (campaign.qaParams && typeof campaign.qaParams === "object") {
      const qaParams = campaign.qaParams as Record;

      if (qaParams.required_info && Array.isArray(qaParams.required_info)) {
        criteria.requiredFields = qaParams.required_info as string[];
      }

      if (qaParams.scoring_weights && typeof qaParams.scoring_weights === "object") {
        criteria.scoringWeights = {
          ...criteria.scoringWeights,
          ...(qaParams.scoring_weights as Partial),
        };
      }

      if (qaParams.min_score && typeof qaParams.min_score === "number") {
        criteria.minimumQualityScore = qaParams.min_score;
      }

      if (qaParams.qualification_questions && Array.isArray(qaParams.qualification_questions)) {
        criteria.qualificationQuestions = qaParams.qualification_questions as CampaignSuccessCriteria["qualificationQuestions"];
      }
    }

    // Extract from AI agent settings if available
    if (campaign.aiAgentSettings && typeof campaign.aiAgentSettings === "object") {
      const aiSettings = campaign.aiAgentSettings as Record;

      if (aiSettings.qualification && typeof aiSettings.qualification === "object") {
        const qual = aiSettings.qualification as Record;
        if (qual.requiredFields && Array.isArray(qual.requiredFields)) {
          criteria.requiredFields = qual.requiredFields as string[];
        }
      }

      if (aiSettings.objectionKeywords && Array.isArray(aiSettings.objectionKeywords)) {
        criteria.objectionKeywords = aiSettings.objectionKeywords as string[];
      }
    }

    return criteria;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading campaign criteria:`, error);
    return DEFAULT_SUCCESS_CRITERIA;
  }
}

// ==================== TRANSCRIPT ANALYSIS ====================

/**
 * Analyze transcript for key indicators
 */
function analyzeTranscript(
  transcript: string,
  criteria: CampaignSuccessCriteria
): {
  positiveSignals: string[];
  negativeSignals: string[];
  objections: string[];
  questionsAnswered: number;
  engagementLevel: number;
} {
  const lowerTranscript = transcript.toLowerCase();

  // Ensure criteria properties are arrays to prevent null/undefined errors
  const positiveKeywords = criteria.positiveResponseKeywords || [];
  const negativeKeywords = criteria.negativeResponseKeywords || [];
  const objectionKeywords = criteria.objectionKeywords || [];

  // Find positive signals
  const positiveSignals: string[] = [];
  for (const keyword of positiveKeywords) {
    if (keyword && lowerTranscript.includes(keyword.toLowerCase())) {
      positiveSignals.push(keyword);
    }
  }

  // Find negative signals
  const negativeSignals: string[] = [];
  for (const keyword of negativeKeywords) {
    if (keyword && lowerTranscript.includes(keyword.toLowerCase())) {
      negativeSignals.push(keyword);
    }
  }

  // Find objections
  const objections: string[] = [];
  for (const keyword of objectionKeywords) {
    if (keyword && lowerTranscript.includes(keyword.toLowerCase())) {
      objections.push(keyword);
    }
  }

  // Count questions answered (simplified - count responses after question marks)
  const questionMatches = transcript.match(/\?[^?]*[.!]/g) || [];
  const questionsAnswered = questionMatches.length;

  // Calculate engagement level based on signals
  const positiveWeight = positiveSignals.length * 15;
  const negativeWeight = negativeSignals.length * -20;
  const objectionWeight = objections.length * -10;
  const engagementLevel = Math.max(0, Math.min(100, 50 + positiveWeight + negativeWeight + objectionWeight));

  return {
    positiveSignals,
    negativeSignals,
    objections,
    questionsAnswered,
    engagementLevel,
  };
}

/**
 * Identify conversation breakdown point
 */
function identifyBreakdown(
  transcript: string,
  callDurationSeconds: number,
  criteria: CampaignSuccessCriteria
): ConversationBreakdown | undefined {
  const lowerTranscript = transcript.toLowerCase();

  // Early hangup (very short call)
  if (callDurationSeconds 
      pos && afterObjection.includes(pos.toLowerCase())
    );

    if (!hasPositiveRecovery && afterObjection.length 
    pos && lowerTranscript.includes(pos.toLowerCase())
  );
  if (!hasAnyPositive && callDurationSeconds = criteria.optimalCallDurationRange.min &&
    callDurationSeconds  criteria.optimalCallDurationRange.max) {
    durationScore = 70;
    durationReason = "Call longer than optimal, may indicate difficulties";
  } else {
    durationScore = 60;
    durationReason = "Call duration acceptable but below optimal";
  }

  // Prospect engagement score
  const engagementScore = analysis.engagementLevel;
  const engagementReason =
    engagementScore >= 70
      ? "Strong prospect engagement detected"
      : engagementScore >= 40
        ? "Moderate prospect engagement"
        : "Low prospect engagement";

  // Questions covered score
  const questionScore = Math.min(100, analysis.questionsAnswered * 25);
  const questionReason = `${analysis.questionsAnswered} qualification responses identified`;

  // Objection handling score
  let objectionScore = 100;
  let objectionReason = "No objections encountered";
  if (analysis.objections.length > 0) {
    // Check if objections were overcome (positive signals after objections)
    const wasOvercome =
      analysis.positiveSignals.length > 0 && analysis.positiveSignals.length >= analysis.objections.length;
    if (wasOvercome) {
      objectionScore = 80;
      objectionReason = `${analysis.objections.length} objection(s) successfully addressed`;
    } else {
      objectionScore = 30;
      objectionReason = `${analysis.objections.length} objection(s) not fully addressed`;
    }
  }

  // Closing strength score
  const closingKeywords = ["schedule", "book", "meeting", "follow up", "send", "email", "callback", "tomorrow"];
  const hasClosing = closingKeywords.some((k) => transcript.toLowerCase().includes(k));
  const closingScore = hasClosing ? 80 : 40;
  const closingReason = hasClosing ? "Clear next steps discussed" : "No clear next steps identified";

  // Data capture score (simplified - check for common data patterns)
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(transcript);
  const hasPhone = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(transcript);
  const dataScore = (hasEmail ? 50 : 0) + (hasPhone ? 50 : 0);
  const dataReason =
    dataScore >= 50
      ? "Contact information captured"
      : "Limited data capture during call";

  // Calculate overall scores
  const weights = criteria.scoringWeights;
  const totalWeight =
    weights.contentInterest +
    weights.permissionGiven +
    weights.complianceConsent +
    weights.qualificationAnswers +
    weights.dataAccuracy +
    weights.engagementLevel;

  const weightedScore =
    ((engagementScore * weights.engagementLevel) +
      (questionScore * weights.qualificationAnswers) +
      (durationScore * weights.contentInterest) +
      (objectionScore * weights.complianceConsent) +
      (closingScore * weights.permissionGiven) +
      (dataScore * weights.dataAccuracy)) /
    totalWeight;

  const overallScore = Math.round(weightedScore);
  const qualificationScore = Math.round((questionScore + engagementScore + closingScore) / 3);
  const complianceScore = Math.round((objectionScore + durationScore) / 2);

  // Determine qualification status
  let qualificationStatus: "qualified" | "not_qualified" | "needs_review" = "needs_review";
  const qualificationReasons: string[] = [];

  if (disposition === "qualified_lead" || disposition === "qualified") {
    if (overallScore >= criteria.minimumQualityScore) {
      qualificationStatus = "qualified";
      qualificationReasons.push("Meets quality threshold and marked as qualified");
    } else {
      qualificationStatus = "needs_review";
      qualificationReasons.push("Marked qualified but quality score below threshold");
    }
  } else if (disposition === "not_interested" || disposition === "do_not_call") {
    qualificationStatus = "not_qualified";
    qualificationReasons.push(`Disposition: ${disposition}`);
  } else {
    if (overallScore >= criteria.minimumQualityScore && engagementScore >= criteria.minimumEngagementScore) {
      qualificationStatus = "needs_review";
      qualificationReasons.push("Good quality indicators but needs human review");
    } else {
      qualificationStatus = "not_qualified";
      qualificationReasons.push("Quality or engagement scores below threshold");
    }
  }

  // Identify issues
  const issues: CallQualityScore["issues"] = [];
  if (callDurationSeconds  0 && objectionScore  {
  try {
    // Try to load from lead first
    let transcript = options.transcript;
    let callDurationSeconds = options.callDurationSeconds;
    let disposition = options.disposition;
    let campaignId = options.campaignId;
    let contactId = options.contactId;

    // Load from lead if not provided
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, callId))
      .limit(1);

    if (lead) {
      transcript = transcript || lead.transcript || "";
      callDurationSeconds = callDurationSeconds || lead.callDuration || 0;
      campaignId = campaignId || lead.campaignId || "";
      contactId = contactId || lead.contactId || "";
    }

    // Try call attempt if no lead found
    if (!transcript) {
      const [attempt] = await db
        .select()
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, callId))
        .limit(1);

      if (attempt) {
        const attemptTranscript =
          (attempt as any).fullTranscript ||
          (attempt as any).aiTranscript ||
          (attempt as any).transcript ||
          "";
        transcript = attemptTranscript;
        callDurationSeconds = attempt.callDurationSeconds || 0;
        disposition = attempt.disposition || undefined;
        campaignId = attempt.campaignId;
        contactId = attempt.contactId;
      }
    }

    if (!transcript || !campaignId) {
      console.warn(`${LOG_PREFIX} Cannot analyze call ${callId}: missing transcript or campaign`);
      return null;
    }

    // Load campaign criteria
    const criteria = await loadCampaignCriteria(campaignId);

    // Analyze transcript
    const transcriptAnalysis = analyzeTranscript(transcript, criteria);

    // Calculate quality score
    const qualityScore = calculateQualityScore(
      transcript,
      callDurationSeconds || 0,
      criteria,
      disposition
    );

    // Identify breakdown if call wasn't successful
    const conversationBreakdown =
      qualityScore.qualificationStatus !== "qualified"
        ? identifyBreakdown(transcript, callDurationSeconds || 0, criteria)
        : undefined;

    // Generate summary
    const transcriptSummary = generateSummary(transcript, qualityScore, transcriptAnalysis);

    // Extract key moments
    const keyMoments = extractKeyMoments(transcript, transcriptAnalysis, criteria);

    // Check campaign criteria alignment
    const campaignCriteriaMatch = checkCriteriaAlignment(transcript, criteria);

    // Generate insights
    const insights = generateInsights(qualityScore, transcriptAnalysis, conversationBreakdown);

    const result: CallAnalysisResult = {
      callId,
      campaignId: campaignId || "",
      contactId: contactId || "",
      analyzedAt: new Date(),
      qualityScore,
      conversationBreakdown,
      transcriptSummary,
      keyMoments,
      campaignCriteriaMatch,
      insights,
      callDurationSeconds: callDurationSeconds || 0,
      disposition: disposition || "unknown",
    };

    // Log analysis
    console.log(
      `${LOG_PREFIX} ✅ Analyzed call ${callId} | Score: ${qualityScore.overallScore} | Status: ${qualityScore.qualificationStatus}`
    );

    // Store analysis result
    if (lead) {
      try {
        // Ensure result is JSON serializable - remove any undefined or circular references
        const serializableResult = JSON.parse(JSON.stringify(result));
        await db
          .update(leads)
          .set({
            aiAnalysis: serializableResult as unknown as object,
            updatedAt: new Date(),
          })
          .where(eq(leads.id, callId));
      } catch (serializeErr) {
        console.error(`${LOG_PREFIX} Failed to serialize analysis result for lead ${callId}:`, serializeErr);
      }
    }

    // Log activity
    try {
      await db.insert(activityLog).values({
        entityType: "lead",
        entityId: callId,
        eventType: "qa_analysis_completed",
        payload: {
          overallScore: qualityScore.overallScore,
          qualificationStatus: qualityScore.qualificationStatus,
          issueCount: qualityScore.issues.length,
          insightCount: insights.length,
        },
        createdBy: null,
      });
    } catch (logErr) {
      // Ignore logging errors
    }

    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error analyzing call ${callId}:`, error);
    return null;
  }
}

// ==================== HELPER FUNCTIONS ====================

function generateSummary(
  transcript: string,
  qualityScore: CallQualityScore,
  analysis: ReturnType
): string {
  const parts: string[] = [];

  if (qualityScore.overallScore >= 70) {
    parts.push("Strong call performance.");
  } else if (qualityScore.overallScore >= 50) {
    parts.push("Moderate call performance.");
  } else {
    parts.push("Call did not meet quality thresholds.");
  }

  if (analysis.positiveSignals.length > 0) {
    parts.push(`Positive indicators: ${analysis.positiveSignals.slice(0, 3).join(", ")}.`);
  }

  if (analysis.objections.length > 0) {
    parts.push(`Objections encountered: ${analysis.objections.join(", ")}.`);
  }

  if (qualityScore.issues.length > 0) {
    const criticalIssues = qualityScore.issues.filter((i) => i.type === "critical");
    if (criticalIssues.length > 0) {
      parts.push(`Critical issues: ${criticalIssues.map((i) => i.message).join("; ")}.`);
    }
  }

  return parts.join(" ");
}

function extractKeyMoments(
  transcript: string,
  analysis: ReturnType,
  criteria: CampaignSuccessCriteria
): CallAnalysisResult["keyMoments"] {
  const moments: CallAnalysisResult["keyMoments"] = [];

  // Add positive moments
  for (const signal of analysis.positiveSignals.slice(0, 3)) {
    moments.push({
      type: "positive",
      moment: `Prospect expressed: "${signal}"`,
    });
  }

  // Add negative moments
  for (const signal of analysis.negativeSignals.slice(0, 2)) {
    moments.push({
      type: "negative",
      moment: `Prospect indicated: "${signal}"`,
    });
  }

  // Add objection moments
  for (const objection of analysis.objections.slice(0, 2)) {
    moments.push({
      type: "negative",
      moment: `Objection raised: "${objection}"`,
    });
  }

  return moments;
}

function checkCriteriaAlignment(
  transcript: string,
  criteria: CampaignSuccessCriteria
): CallAnalysisResult["campaignCriteriaMatch"] {
  const lowerTranscript = transcript.toLowerCase();
  const matched: string[] = [];
  const missed: string[] = [];
  const partial: string[] = [];

  // Check required fields (simplified keyword matching)
  const fieldKeywords: Record = {
    interest_level: ["interested", "tell me more", "sounds good"],
    contact_confirmed: ["yes", "that's me", "speaking", "this is"],
    next_steps: ["schedule", "meeting", "follow up", "call back"],
    budget: ["budget", "afford", "cost", "price", "invest"],
    timeline: ["when", "timeline", "soon", "urgent", "quarter"],
    authority: ["decide", "decision", "approval", "sign off"],
  };

  const requiredFields = criteria.requiredFields || [];
  for (const field of requiredFields) {
    if (!field) continue;
    const keywords = fieldKeywords[field] || [field];
    const foundCount = keywords.filter((k) => lowerTranscript.includes(k.toLowerCase())).length;

    if (foundCount >= 2) {
      matched.push(field);
    } else if (foundCount === 1) {
      partial.push(field);
    } else {
      missed.push(field);
    }
  }

  return { matched, missed, partial };
}

function generateInsights(
  qualityScore: CallQualityScore,
  analysis: ReturnType,
  breakdown?: ConversationBreakdown
): string[] {
  const insights: string[] = [];

  // Score-based insights
  if (qualityScore.overallScore >= 80) {
    insights.push("This call demonstrates effective conversation techniques.");
  } else if (qualityScore.overallScore = 70) {
    insights.push("High prospect engagement suggests good value proposition alignment.");
  } else if (analysis.engagementLevel  0 && qualityScore.breakdown.objectionHandling.score ;
}> {
  const { limit = 100, startDate, endDate, onlyUnanalyzed = true } = options;

  try {
    // Build query conditions
    const conditions = [eq(leads.campaignId, campaignId)];

    if (startDate) {
      conditions.push(gte(leads.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(leads.createdAt, endDate));
    }
    if (onlyUnanalyzed) {
      conditions.push(sql`${leads.aiAnalysis} IS NULL`);
    }

    const callsToAnalyze = await db
      .select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(limit);

    let totalScore = 0;
    let qualifiedCount = 0;
    let notQualifiedCount = 0;
    let needsReviewCount = 0;
    const issueCounter = new Map();

    for (const lead of callsToAnalyze) {
      const result = await analyzeCall(lead.id);
      if (result) {
        totalScore += result.qualityScore.overallScore;

        switch (result.qualityScore.qualificationStatus) {
          case "qualified":
            qualifiedCount++;
            break;
          case "not_qualified":
            notQualifiedCount++;
            break;
          case "needs_review":
            needsReviewCount++;
            break;
        }

        // Track issues
        for (const issue of result.qualityScore.issues) {
          const count = issueCounter.get(issue.message) || 0;
          issueCounter.set(issue.message, count + 1);
        }
      }
    }

    // Sort issues by frequency
    const commonIssues = Array.from(issueCounter.entries())
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      analyzed: callsToAnalyze.length,
      avgScore: callsToAnalyze.length > 0 ? Math.round(totalScore / callsToAnalyze.length) : 0,
      qualifiedCount,
      notQualifiedCount,
      needsReviewCount,
      commonIssues,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error analyzing campaign calls:`, error);
    return {
      analyzed: 0,
      avgScore: 0,
      qualifiedCount: 0,
      notQualifiedCount: 0,
      needsReviewCount: 0,
      commonIssues: [],
    };
  }
}

// ==================== EXPORTS ====================

export default {
  analyzeCall,
  analyzeCampaignCalls,
  loadCampaignCriteria,
};