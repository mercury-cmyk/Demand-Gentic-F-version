/**
 * Call Quality Tracker
 * 
 * Tracks call quality signals that affect carrier reputation:
 * - First 7 seconds hang-up detection (critical for spam flagging)
 * - Short call patterns
 * - Immediate disconnect rates
 * - Answer rate trends
 * 
 * These metrics feed into the number reputation system and
 * trigger automated cooldowns when thresholds are exceeded.
 * 
 * @see Anti-spam plan sections 1 & 4
 */

import { db } from "../db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { callSessions } from "@shared/schema";
import { numberReputation, numberCooldowns, telnyxNumbers, numberMetricsWindow } from "@shared/number-pool-schema";

// ==================== TYPES ====================

export interface CallQualityEvent {
  callId: string;
  numberId: string;
  phoneNumberE164: string;
  durationSeconds: number;
  answered: boolean;
  disconnectReason: 'completed' | 'hangup' | 'no_answer' | 'busy' | 'failed' | 'voicemail';
  disconnectedBy: 'agent' | 'prospect' | 'system' | 'unknown';
  firstResponseTimeMs?: number;
  prospectSpokeFirst: boolean;
}

export interface QualityMetrics {
  totalCalls: number;
  answeredCalls: number;
  answerRate: number;
  first7SecondHangups: number;
  first7SecondHangupRate: number;
  shortCalls: number;  // < 20 seconds
  shortCallRate: number;
  immediateHangups: number;  // < 3 seconds
  immediateHangupRate: number;
  avgDurationSeconds: number;
  prospectHangupRate: number;
}

export interface NumberHealthCheck {
  numberId: string;
  phoneNumber: string;
  healthScore: number;
  status: 'healthy' | 'warning' | 'critical' | 'burned';
  issues: string[];
  recommendations: string[];
  shouldCooldown: boolean;
  cooldownReason?: string;
  cooldownDurationHours?: number;
}

// ==================== CONSTANTS ====================

/**
 * Critical thresholds that trigger carrier attention
 */
const QUALITY_THRESHOLDS = {
  // First 7 seconds is CRITICAL - carriers heavily weight this
  FIRST_7_SEC_HANGUP_RATE_WARNING: 0.15,  // 15% = warning
  FIRST_7_SEC_HANGUP_RATE_CRITICAL: 0.25, // 25% = critical, cooldown

  // Short calls (< 20 seconds) indicate spam pattern
  SHORT_CALL_RATE_WARNING: 0.30,  // 30% = warning
  SHORT_CALL_RATE_CRITICAL: 0.50, // 50% = critical, cooldown

  // Immediate hangups (< 3 seconds) are worst signal
  IMMEDIATE_HANGUP_RATE_WARNING: 0.10,  // 10% = warning
  IMMEDIATE_HANGUP_RATE_CRITICAL: 0.20, // 20% = critical, immediate cooldown

  // Answer rate - low answer rate = potential spam labeling
  ANSWER_RATE_WARNING: 0.20,  // Below 20% = warning
  ANSWER_RATE_CRITICAL: 0.10, // Below 10% = critical

  // Consecutive bad calls trigger immediate action
  CONSECUTIVE_SHORT_CALLS_LIMIT: 3,
  CONSECUTIVE_NO_ANSWER_LIMIT: 5,

  // Minimum calls before metrics are meaningful
  MIN_CALLS_FOR_METRICS: 10,
};

/**
 * Time thresholds (in seconds)
 */
const TIME_THRESHOLDS = {
  IMMEDIATE_HANGUP: 3,
  FIRST_7_SECONDS: 7,
  SHORT_CALL: 20,
  MINIMUM_GOOD_CALL: 45,
};

/**
 * Cooldown durations based on severity
 */
const COOLDOWN_DURATIONS = {
  WARNING: 4,      // 4 hours
  CRITICAL: 12,    // 12 hours
  SEVERE: 24,      // 24 hours
  BURNED: 168,     // 7 days (168 hours)
};

// ==================== MAIN SERVICE ====================

/**
 * Record a call quality event and update number metrics
 */
export async function recordCallQuality(event: CallQualityEvent): Promise<void> {
  const {
    callId,
    numberId,
    durationSeconds,
    answered,
    disconnectReason,
    disconnectedBy,
    prospectSpokeFirst,
  } = event;

  // Classify the call quality
  const isImmediateHangup = answered && durationSeconds < TIME_THRESHOLDS.IMMEDIATE_HANGUP;
  const isFirst7SecHangup = answered && durationSeconds < TIME_THRESHOLDS.FIRST_7_SECONDS && disconnectedBy === 'prospect';
  const isShortCall = answered && durationSeconds < TIME_THRESHOLDS.SHORT_CALL;
  const isGoodCall = answered && durationSeconds >= TIME_THRESHOLDS.MINIMUM_GOOD_CALL;

  console.log(`[CallQuality] Call ${callId} classified:`, {
    numberId,
    duration: durationSeconds,
    answered,
    isImmediateHangup,
    isFirst7SecHangup,
    isShortCall,
    isGoodCall,
    disconnectedBy,
  });

  // Update number reputation
  await updateNumberReputation(numberId, {
    answered,
    durationSeconds,
    isImmediateHangup,
    isFirst7SecHangup,
    isShortCall,
    isGoodCall,
    disconnectedBy,
    disconnectReason,
  });

  // Check if number needs cooldown
  await checkAndApplyCooldown(numberId);
}

/**
 * Calculate quality metrics for a number over a time period
 * Uses numberMetricsWindow table which is designed for per-number tracking
 */
export async function calculateQualityMetrics(
  numberId: string,
  hours: number = 24
): Promise<QualityMetrics> {
  const since = new Date();
  since.setHours(since.getHours() - hours);

  // Get metrics from numberMetricsWindow (designed for per-number tracking)
  const metrics = await db
    .select()
    .from(numberMetricsWindow)
    .where(
      and(
        eq(numberMetricsWindow.numberId, numberId),
        gte(numberMetricsWindow.calledAt, since)
      )
    );

  const totalCalls = metrics.length;
  const answeredCalls = metrics.filter(m => m.answered).length;
  const answerRate = totalCalls > 0 ? answeredCalls / totalCalls : 0;

  // Duration-based metrics (using durationSec from metrics window)
  const answeredMetrics = metrics.filter(m => m.answered);
  
  const first7SecondHangups = answeredMetrics.filter(m => (m.durationSec ?? 0) < TIME_THRESHOLDS.FIRST_7_SECONDS).length;
  const shortCalls = answeredMetrics.filter(m => m.isShortCall).length;
  const immediateHangups = answeredMetrics.filter(m => m.isImmediateHangup).length;

  const totalDuration = answeredMetrics.reduce((sum, m) => sum + (m.durationSec ?? 0), 0);
  const avgDurationSeconds = answeredMetrics.length > 0 ? totalDuration / answeredMetrics.length : 0;

  // Prospect hangup rate (estimate from short calls)
  const prospectHangups = answeredMetrics.filter(m => 
    m.isShortCall || m.isImmediateHangup
  ).length;

  return {
    totalCalls,
    answeredCalls,
    answerRate,
    first7SecondHangups,
    first7SecondHangupRate: answeredCalls > 0 ? first7SecondHangups / answeredCalls : 0,
    shortCalls,
    shortCallRate: answeredCalls > 0 ? shortCalls / answeredCalls : 0,
    immediateHangups,
    immediateHangupRate: answeredCalls > 0 ? immediateHangups / answeredCalls : 0,
    avgDurationSeconds,
    prospectHangupRate: answeredCalls > 0 ? prospectHangups / answeredCalls : 0,
  };
}

/**
 * Perform a health check on a number
 */
export async function checkNumberHealth(numberId: string): Promise<NumberHealthCheck> {
  const [number] = await db
    .select()
    .from(telnyxNumbers)
    .where(eq(telnyxNumbers.id, numberId));

  if (!number) {
    throw new Error(`Number ${numberId} not found`);
  }

  const [reputation] = await db
    .select()
    .from(numberReputation)
    .where(eq(numberReputation.numberId, numberId));

  const metrics = await calculateQualityMetrics(numberId, 24);
  
  const issues: string[] = [];
  const recommendations: string[] = [];
  let healthScore = 100;
  let shouldCooldown = false;
  let cooldownReason: string | undefined;
  let cooldownDurationHours: number | undefined;

  // Only analyze if we have enough data
  if (metrics.totalCalls >= QUALITY_THRESHOLDS.MIN_CALLS_FOR_METRICS) {
    // Check first 7 second hangup rate (MOST IMPORTANT)
    if (metrics.first7SecondHangupRate >= QUALITY_THRESHOLDS.FIRST_7_SEC_HANGUP_RATE_CRITICAL) {
      issues.push(`Critical: ${(metrics.first7SecondHangupRate * 100).toFixed(1)}% of calls hung up within 7 seconds`);
      recommendations.push('Improve opening line - prospects are hanging up immediately');
      recommendations.push('Use permission-based openers: "Did I catch you at a bad time?"');
      healthScore -= 40;
      shouldCooldown = true;
      cooldownReason = 'High first-7-second hangup rate';
      cooldownDurationHours = COOLDOWN_DURATIONS.CRITICAL;
    } else if (metrics.first7SecondHangupRate >= QUALITY_THRESHOLDS.FIRST_7_SEC_HANGUP_RATE_WARNING) {
      issues.push(`Warning: ${(metrics.first7SecondHangupRate * 100).toFixed(1)}% first-7-second hangup rate`);
      recommendations.push('Monitor opening effectiveness');
      healthScore -= 20;
    }

    // Check immediate hangup rate
    if (metrics.immediateHangupRate >= QUALITY_THRESHOLDS.IMMEDIATE_HANGUP_RATE_CRITICAL) {
      issues.push(`Critical: ${(metrics.immediateHangupRate * 100).toFixed(1)}% immediate hangups (<3s)`);
      recommendations.push('Number may be spam-flagged - immediate cooldown recommended');
      healthScore -= 30;
      shouldCooldown = true;
      cooldownReason = cooldownReason || 'High immediate hangup rate';
      cooldownDurationHours = COOLDOWN_DURATIONS.SEVERE;
    }

    // Check short call rate
    if (metrics.shortCallRate >= QUALITY_THRESHOLDS.SHORT_CALL_RATE_CRITICAL) {
      issues.push(`Critical: ${(metrics.shortCallRate * 100).toFixed(1)}% short calls (<20s)`);
      recommendations.push('Improve conversation engagement - calls ending too quickly');
      healthScore -= 25;
      shouldCooldown = true;
      cooldownReason = cooldownReason || 'High short call rate';
      cooldownDurationHours = cooldownDurationHours || COOLDOWN_DURATIONS.CRITICAL;
    } else if (metrics.shortCallRate >= QUALITY_THRESHOLDS.SHORT_CALL_RATE_WARNING) {
      issues.push(`Warning: ${(metrics.shortCallRate * 100).toFixed(1)}% short call rate`);
      healthScore -= 10;
    }

    // Check answer rate
    if (metrics.answerRate < QUALITY_THRESHOLDS.ANSWER_RATE_CRITICAL) {
      issues.push(`Critical: Only ${(metrics.answerRate * 100).toFixed(1)}% answer rate`);
      recommendations.push('Number may be carrier-blocked - rotate to new number');
      healthScore -= 25;
      shouldCooldown = true;
      cooldownReason = cooldownReason || 'Very low answer rate';
      cooldownDurationHours = cooldownDurationHours || COOLDOWN_DURATIONS.SEVERE;
    } else if (metrics.answerRate < QUALITY_THRESHOLDS.ANSWER_RATE_WARNING) {
      issues.push(`Warning: ${(metrics.answerRate * 100).toFixed(1)}% answer rate`);
      recommendations.push('Consider local presence dialing');
      healthScore -= 10;
    }
  } else {
    recommendations.push(`Need ${QUALITY_THRESHOLDS.MIN_CALLS_FOR_METRICS - metrics.totalCalls} more calls for meaningful metrics`);
  }

  // Determine status
  let status: 'healthy' | 'warning' | 'critical' | 'burned';
  if (healthScore >= 80) {
    status = 'healthy';
  } else if (healthScore >= 60) {
    status = 'warning';
  } else if (healthScore >= 40) {
    status = 'critical';
  } else {
    status = 'burned';
    shouldCooldown = true;
    cooldownDurationHours = COOLDOWN_DURATIONS.BURNED;
    cooldownReason = 'Number health critically low';
  }

  return {
    numberId,
    phoneNumber: number.phoneNumberE164,
    healthScore: Math.max(0, healthScore),
    status,
    issues,
    recommendations,
    shouldCooldown,
    cooldownReason,
    cooldownDurationHours,
  };
}

/**
 * Get numbers with quality issues that need attention
 */
export async function getNumbersNeedingAttention(): Promise<NumberHealthCheck[]> {
  const activeNumbers = await db
    .select()
    .from(telnyxNumbers)
    .where(eq(telnyxNumbers.status, 'active'));

  const results: NumberHealthCheck[] = [];

  for (const number of activeNumbers) {
    const health = await checkNumberHealth(number.id);
    if (health.status !== 'healthy') {
      results.push(health);
    }
  }

  // Sort by health score (worst first)
  return results.sort((a, b) => a.healthScore - b.healthScore);
}

// ==================== INTERNAL FUNCTIONS ====================

/**
 * Update number reputation based on call outcome
 */
async function updateNumberReputation(
  numberId: string,
  outcome: {
    answered: boolean;
    durationSeconds: number;
    isImmediateHangup: boolean;
    isFirst7SecHangup: boolean;
    isShortCall: boolean;
    isGoodCall: boolean;
    disconnectedBy: string;
    disconnectReason: string;
  }
): Promise<void> {
  const { answered, isImmediateHangup, isShortCall } = outcome;

  // Get current reputation or create new
  const [existing] = await db
    .select()
    .from(numberReputation)
    .where(eq(numberReputation.numberId, numberId));

  if (existing) {
    // Update existing reputation
    await db
      .update(numberReputation)
      .set({
        totalCalls: sql`${numberReputation.totalCalls} + 1`,
        answeredCalls: answered ? sql`${numberReputation.answeredCalls} + 1` : numberReputation.answeredCalls,
        shortCalls: isShortCall ? sql`${numberReputation.shortCalls} + 1` : numberReputation.shortCalls,
        immediateHangups: isImmediateHangup ? sql`${numberReputation.immediateHangups} + 1` : numberReputation.immediateHangups,
        updatedAt: new Date(),
      })
      .where(eq(numberReputation.numberId, numberId));
  } else {
    // Create new reputation record
    await db.insert(numberReputation).values({
      numberId,
      totalCalls: 1,
      answeredCalls: answered ? 1 : 0,
      shortCalls: isShortCall ? 1 : 0,
      immediateHangups: isImmediateHangup ? 1 : 0,
    });
  }

  // Update lastCallAt/lastAnsweredAt on the main telnyxNumbers table
  // NOTE: Do NOT increment callsToday/callsThisHour here — that is handled
  // exclusively by recordCallOutcome() in number-router-service.ts to avoid
  // double-counting which inflates warmup limits.
  await db
    .update(telnyxNumbers)
    .set({
      lastCallAt: new Date(),
      lastAnsweredAt: answered ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(telnyxNumbers.id, numberId));
}

/**
 * Check if number needs cooldown and apply if necessary
 */
async function checkAndApplyCooldown(numberId: string): Promise<void> {
  const health = await checkNumberHealth(numberId);

  if (health.shouldCooldown && health.cooldownReason && health.cooldownDurationHours) {
    const endsAt = new Date();
    endsAt.setHours(endsAt.getHours() + health.cooldownDurationHours);

    // Check if already in cooldown
    const [existingCooldown] = await db
      .select()
      .from(numberCooldowns)
      .where(
        and(
          eq(numberCooldowns.numberId, numberId),
          eq(numberCooldowns.isActive, true)
        )
      );

    if (!existingCooldown) {
      // Create cooldown
      await db.insert(numberCooldowns).values({
        numberId,
        reason: mapReasonToEnum(health.cooldownReason),
        startedAt: new Date(),
        endsAt,
        isActive: true,
        triggeredBy: 'quality_tracker',
        reasonDetails: { issues: health.issues },
      });

      // Update number status
      await db
        .update(telnyxNumbers)
        .set({
          status: 'cooling',
          statusReason: health.cooldownReason,
          statusChangedAt: new Date(),
        })
        .where(eq(telnyxNumbers.id, numberId));

      console.log(`[CallQuality] Number ${numberId} put in cooldown: ${health.cooldownReason} for ${health.cooldownDurationHours} hours`);
    }
  }
}

/**
 * Map cooldown reason string to enum value
 */
function mapReasonToEnum(reason: string): 'consecutive_short_calls' | 'zero_answer_rate' | 'repeated_failures' | 'audio_quality_issues' | 'reputation_threshold' | 'manual_admin' | 'carrier_block_suspected' {
  if (reason.includes('immediate hangup')) return 'consecutive_short_calls';
  if (reason.includes('answer rate')) return 'zero_answer_rate';
  if (reason.includes('short call')) return 'consecutive_short_calls';
  if (reason.includes('critically low')) return 'reputation_threshold';
  return 'reputation_threshold';
}

// ==================== EXPORTS ====================

export default {
  recordCallQuality,
  calculateQualityMetrics,
  checkNumberHealth,
  getNumbersNeedingAttention,
  QUALITY_THRESHOLDS,
  TIME_THRESHOLDS,
  COOLDOWN_DURATIONS,
};
