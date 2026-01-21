/**
 * Learning Loop Service
 * Records call outcomes, learns from signals, and adjusts future behavior
 * Central hub for training data feedback
 *
 * Enhanced with SMI Agent integration for:
 * - Role-based learning signals
 * - Industry-specific pattern detection
 * - Messaging effectiveness tracking
 * - Predictive score updates
 */

import { db } from "../db";
import { eq, and, desc, gte, lte } from "drizzle-orm";

const LOG_PREFIX = "[LearningLoop]";

// ============================================================================
// LEARNING RECORD TYPES
// ============================================================================

export interface CallOutcomeSignals {
  // Contact engagement signals
  engagement_level?: "high" | "medium" | "low";
  sentiment?: "positive" | "neutral" | "negative";
  interest_level?: "high_interest" | "maybe" | "not_interested";

  // Time-based signals
  time_pressure?: "explicit" | "implied" | "none";
  duration_seconds?: number;

  // Response quality
  clarity?: "clear" | "ambiguous" | "garbled";
  response_time_ms?: number;

  // Outcome signals
  right_party_confirmed?: boolean;
  gatekeeper_blocked?: "soft" | "hard" | false;
  voicemail_detected?: boolean;
  wrong_number?: boolean;

  // Objection signals
  objection_type?: "clarity" | "deflection" | "time" | "none";
  objection_intensity?: "soft" | "medium" | "hard";

  // Discomfort/resistance signals
  discomfort_level?: number; // 0-10
  pushback_intensity?: "none" | "mild" | "moderate" | "strong";

  // SMI Role signals (enhanced learning)
  roleSignals?: {
    roleMatchConfidence?: number; // 0-1, how well the mapped role matched reality
    decisionAuthorityConfirmed?: boolean; // Was the expected decision authority correct?
    actualDecisionAuthority?: "decision_maker" | "influencer" | "user" | "gatekeeper";
    buyingCommitteeRoleConfirmed?: boolean;
  };

  // SMI Industry signals (enhanced learning)
  industrySignals?: {
    challengesResonated?: string[]; // Which industry challenges resonated
    regulatoryMentioned?: boolean; // Did prospect mention regulatory concerns
    industryFitConfirmed?: boolean; // Did solution fit industry needs
  };

  // SMI Messaging signals (enhanced learning)
  messagingSignals?: {
    angleUsed?: string; // Which messaging angle was used
    angleEffectiveness?: number; // 0-1, how effective was the angle
    valuePropsPresented?: string[]; // Which value props were presented
    valuePropsResonated?: string[]; // Which value props resonated
    approachUsed?: "direct" | "consultative" | "educational" | "peer-based";
    approachEffectiveness?: number; // 0-1
  };

  // SMI Qualification signals
  qualificationSignals?: {
    budgetIndicated?: boolean;
    authorityConfirmed?: boolean;
    needIdentified?: boolean;
    timelineDiscussed?: boolean;
    competitorsmentioned?: string[];
  };
}

export interface CallOutcomeRecord {
  callId: string;
  campaignId?: string;
  contactId?: string;
  accountId?: string;
  outcome:
    | "RIGHT_PARTY_ENGAGED"
    | "RIGHT_PARTY_TIME_CONSTRAINED"
    | "GATEKEEPER_BLOCKED_SOFT"
    | "GATEKEEPER_BLOCKED_HARD"
    | "VOICEMAIL_DROPPED"
    | "WRONG_NUMBER"
    | "UNCLEAR_AUDIO"
    | "HARD_REFUSAL";
  signals: CallOutcomeSignals;
  timestamp: Date;
  agentName?: string;
  agentVersion?: string;

  // Coaching adjustments for next attempt
  adjustments?: {
    shorter_intro?: boolean;
    earlier_exit?: boolean;
    delay_asks?: boolean;
    skip_permission?: boolean;
    compress_flow?: boolean;
  };

  // Suppression recommendation
  suppressionRecommended?: boolean;
  suppressionCooldownDays?: number;
}

/**
 * Record a call outcome and extract learnings
 * Enhanced with SMI Agent integration for role/industry/messaging pattern learning
 */
export async function recordCallOutcome(record: CallOutcomeRecord): Promise<void> {
  try {
    console.log(`${LOG_PREFIX} Recording outcome: ${record.outcome} for call ${record.callId}`);

    // Analyze signals to determine coaching adjustments
    const adjustments = analyzeSignalsForAdjustments(record.signals, record.outcome);

    // Store in database (future: database table for learning records)
    // For now, log and track locally
    const learningEntry = {
      callId: record.callId,
      outcome: record.outcome,
      signals: JSON.stringify(record.signals),
      adjustments: JSON.stringify(adjustments),
      timestamp: record.timestamp,
      agentName: record.agentName,
    };

    console.log(`${LOG_PREFIX} Learning entry created:`, learningEntry);

    // Track suppression recommendation
    if (record.suppressionRecommended) {
      console.warn(
        `${LOG_PREFIX} SUPPRESSION RECOMMENDED for contact ${record.contactId}: ${record.suppressionCooldownDays} days`
      );
    }

    // SMI Agent integration: Record enhanced learning if SMI signals are present
    if (hasSMISignals(record.signals)) {
      await processSMILearning(record);
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error recording call outcome:`, error);
  }
}

/**
 * Check if the call outcome has SMI-specific signals
 */
function hasSMISignals(signals: CallOutcomeSignals): boolean {
  return !!(
    signals.roleSignals ||
    signals.industrySignals ||
    signals.messagingSignals ||
    signals.qualificationSignals
  );
}

/**
 * Process SMI-specific learning from call outcome
 * Feeds into the SMI learning aggregator and predictive scorer
 */
async function processSMILearning(record: CallOutcomeRecord): Promise<void> {
  try {
    // Dynamically import to avoid circular dependencies
    const { recordLearningOutcome, processCallOutcomeForSMI } = await import(
      './smi-agent/learning/feedback-processor'
    );

    // Map outcome to SMI format
    const outcomeCategory = mapOutcomeToCategory(record.outcome);
    const outcomeQualityScore = calculateOutcomeQuality(record);

    // Record in SMI learning system
    await recordLearningOutcome({
      callSessionId: record.callId,
      campaignId: record.campaignId || '',
      contactId: record.contactId || '',
      accountId: record.accountId || '',
      outcomeCode: record.outcome.toLowerCase(),
      outcomeCategory,
      outcomeQualityScore,
      engagementSignals: {
        sentiment: record.signals.sentiment || 'neutral',
        interestLevel: mapInterestLevel(record.signals.interest_level),
        timePressure: record.signals.time_pressure || 'none',
        attentiveness: mapEngagementLevel(record.signals.engagement_level),
        questionCount: 0,
      },
      objectionSignals: record.signals.objection_type ? {
        objectionType: record.signals.objection_type,
        objectionIntensity: record.signals.objection_intensity,
        objectionOvercome: record.outcome === 'RIGHT_PARTY_ENGAGED',
      } : undefined,
      qualificationSignals: record.signals.qualificationSignals,
      roleSignals: record.signals.roleSignals,
      industrySignals: record.signals.industrySignals,
      messagingSignals: record.signals.messagingSignals ? {
        angleUsed: record.signals.messagingSignals.angleUsed,
        angleResonated: (record.signals.messagingSignals.angleEffectiveness || 0) > 0.6,
        valuePropsResonated: record.signals.messagingSignals.valuePropsResonated,
      } : undefined,
      messagingAngleUsed: record.signals.messagingSignals?.angleUsed,
      approachUsed: record.signals.messagingSignals?.approachUsed,
      valuePropsPresented: record.signals.messagingSignals?.valuePropsPresented,
      adjustmentsApplied: record.adjustments,
      callDurationSeconds: record.signals.duration_seconds,
      callTimestamp: record.timestamp,
    });

    // Process for SMI learning updates (title mapping confidence, predictive scores)
    await processCallOutcomeForSMI({
      callSessionId: record.callId,
      campaignId: record.campaignId || '',
      contactId: record.contactId || '',
      accountId: record.accountId || '',
      outcomeCode: record.outcome.toLowerCase(),
      outcomeCategory,
      engagementSignals: {
        sentiment: record.signals.sentiment || 'neutral',
        interestLevel: mapInterestLevel(record.signals.interest_level),
        timePressure: record.signals.time_pressure || 'none',
        attentiveness: mapEngagementLevel(record.signals.engagement_level),
        questionCount: 0,
      },
      roleSignals: record.signals.roleSignals,
      callTimestamp: record.timestamp,
    });

    console.log(`${LOG_PREFIX} SMI learning processed for call ${record.callId}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing SMI learning:`, error);
    // Don't throw - SMI learning failure should not break main learning loop
  }
}

/**
 * Map outcome string to SMI outcome category
 */
function mapOutcomeToCategory(outcome: string): 'positive' | 'negative' | 'neutral' {
  switch (outcome) {
    case 'RIGHT_PARTY_ENGAGED':
      return 'positive';
    case 'RIGHT_PARTY_TIME_CONSTRAINED':
      return 'neutral';
    case 'HARD_REFUSAL':
    case 'GATEKEEPER_BLOCKED_HARD':
      return 'negative';
    default:
      return 'neutral';
  }
}

/**
 * Calculate overall outcome quality score (0-1)
 */
function calculateOutcomeQuality(record: CallOutcomeRecord): number {
  let score = 0.5; // Base neutral score

  // Positive outcomes
  if (record.outcome === 'RIGHT_PARTY_ENGAGED') {
    score = 0.9;
    if (record.signals.sentiment === 'positive') score = 0.95;
    if (record.signals.engagement_level === 'high') score = Math.min(1, score + 0.05);
  } else if (record.outcome === 'RIGHT_PARTY_TIME_CONSTRAINED') {
    score = 0.6;
  }

  // Negative outcomes
  if (record.outcome === 'HARD_REFUSAL') {
    score = 0.1;
  } else if (record.outcome === 'GATEKEEPER_BLOCKED_HARD') {
    score = 0.15;
  } else if (record.outcome === 'GATEKEEPER_BLOCKED_SOFT') {
    score = 0.4;
  }

  // Adjust for signals
  if (record.signals.sentiment === 'negative') score = Math.max(0.1, score - 0.15);
  if (record.signals.discomfort_level && record.signals.discomfort_level >= 7) {
    score = Math.max(0.1, score - 0.1);
  }

  return score;
}

/**
 * Map interest level string to numeric value (0-1)
 */
function mapInterestLevel(level?: string): number {
  switch (level) {
    case 'high_interest':
      return 0.9;
    case 'maybe':
      return 0.5;
    case 'not_interested':
      return 0.1;
    default:
      return 0.5;
  }
}

/**
 * Map engagement level to attentiveness string
 */
function mapEngagementLevel(level?: string): 'high' | 'medium' | 'low' {
  switch (level) {
    case 'high':
      return 'high';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Analyze call signals to determine behavioral adjustments
 * Learning rules: On failure, adjust by shortening, delaying, exiting earlier
 * NEVER by increasing pressure
 */
function analyzeSignalsForAdjustments(
  signals: CallOutcomeSignals,
  outcome: string
): Record<string, boolean | string> {
  const adjustments: Record<string, boolean | string> = {};

  // High discomfort → shorter intro
  if ((signals.discomfort_level || 0) >= 7) {
    adjustments.shorter_intro = true;
    adjustments.reasoning = "High discomfort detected";
  }

  // Hard refusal → exit earlier
  if (outcome === "HARD_REFUSAL" || signals.pushback_intensity === "strong") {
    adjustments.earlier_exit = true;
    adjustments.reasoning = "Strong refusal - exit earlier next time";
  }

  // Time pressure explicit → compress flow
  if (signals.time_pressure === "explicit") {
    adjustments.compress_flow = true;
    adjustments.skip_permission = true;
    adjustments.reasoning = "Prospect has explicit time constraints";
  }

  // Gatekeeper soft block → delay follow-up
  if (outcome === "GATEKEEPER_BLOCKED_SOFT") {
    adjustments.delay_asks = true;
    adjustments.reasoning = "Soft block - try again at recommended time";
  }

  // Unclear audio → may need different approach
  if (signals.clarity === "garbled") {
    adjustments.earlier_exit = true;
    adjustments.reasoning = "Audio quality too poor - exit and try different number/time";
  }

  // Negative sentiment → do not increase pressure
  if (signals.sentiment === "negative") {
    adjustments.do_not_increase_pressure = true;
    adjustments.reasoning = "Negative sentiment - do not escalate";
  }

  return adjustments;
}

/**
 * Get learning recommendations for a contact based on historical patterns
 */
export async function getLearningRecommendations(contactId: string): Promise<{
  previousOutcomes: string[];
  recommendedAdjustments: string[];
  suppressionStatus: boolean;
}> {
  try {
    // In production, query database for historical calls to this contact
    // For now, return empty (would aggregate call history)
    return {
      previousOutcomes: [],
      recommendedAdjustments: [],
      suppressionStatus: false,
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error getting learning recommendations:`, error);
    return {
      previousOutcomes: [],
      recommendedAdjustments: [],
      suppressionStatus: false,
    };
  }
}

/**
 * Get campaign-level learnings (what's working across the portfolio)
 */
export async function getCampaignLearnings(campaignId: string): Promise<{
  successPatterns: string[];
  failurePatterns: string[];
  adjustedStrategies: string[];
  engagementRate: number;
}> {
  try {
    // Query for patterns in campaign outcomes
    // For now, return template
    return {
      successPatterns: [],
      failurePatterns: [],
      adjustedStrategies: [],
      engagementRate: 0,
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error getting campaign learnings:`, error);
    return {
      successPatterns: [],
      failurePatterns: [],
      adjustedStrategies: [],
      engagementRate: 0,
    };
  }
}

/**
 * Training pattern: On success, reinforce behaviors
 * Extract and log what worked for this call
 */
export function extractSuccessfulBehaviors(signals: CallOutcomeSignals): string[] {
  const behaviors: string[] = [];

  if (signals.engagement_level === "high") {
    behaviors.push("high_engagement_achieved");
  }

  if (signals.sentiment === "positive") {
    behaviors.push("positive_sentiment");
  }

  if (signals.time_pressure === "none" && signals.response_time_ms && signals.response_time_ms < 3000) {
    behaviors.push("patient_silence");
  }

  if (signals.clarity === "clear") {
    behaviors.push("clear_communication");
  }

  return behaviors;
}

/**
 * Generate coaching message based on outcome
 * Tells the agent what to adjust for next time
 */
export function generateCoachingMessage(
  outcome: string,
  signals: CallOutcomeSignals,
  previousAttempts?: number
): string {
  const lines: string[] = [];

  if (outcome === "RIGHT_PARTY_TIME_CONSTRAINED") {
    lines.push("✓ Right party reached but time-constrained.");
    lines.push("→ Next time: Ask one short reflective question, skip permission request.");
  }

  if (outcome === "GATEKEEPER_BLOCKED_SOFT") {
    lines.push("✓ Soft block received - person not available.");
    lines.push("→ Next time: Log best extension/time and exit politely.");
    if (signals.response_time_ms && signals.response_time_ms > 5000) {
      lines.push("→ Reduce explanation time - stay under 20 seconds.");
    }
  }

  if (outcome === "GATEKEEPER_BLOCKED_HARD") {
    lines.push("! Hard refusal received.");
    lines.push("→ Action: Suppress contact for 90 days. Do not retry.");
  }

  if (outcome === "UNCLEAR_AUDIO") {
    lines.push("⚠ Unclear audio received.");
    lines.push("→ Next time: Ask to repeat up to 2x, then exit gracefully.");
  }

  if (outcome === "RIGHT_PARTY_ENGAGED") {
    lines.push("✓ Right party engaged successfully!");
    const behaviors = extractSuccessfulBehaviors(signals);
    lines.push(`→ Behaviors that worked: ${behaviors.join(", ")}`);
    lines.push("→ Reinforce these in next similar calls.");
  }

  return lines.join("\n");
}
