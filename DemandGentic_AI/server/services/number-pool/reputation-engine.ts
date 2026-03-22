/**
 * Reputation Engine
 * 
 * Computes and updates reputation scores for each Telnyx number based on:
 * - Answer rates
 * - Average call duration
 * - Short call percentage
 * - Immediate hangup rate
 * - Voicemail rate
 * - Failure rate
 * 
 * Triggers cooldowns when numbers fall below thresholds.
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md Section 6: Reputation Scoring Formula
 */

import { db } from "../../db";
import { eq, and, gt, sql, desc, count, avg, sum, gte, lte } from "drizzle-orm";
import {
  telnyxNumbers,
  numberReputation,
  numberMetricsWindow,
  numberCooldowns,
  numberPoolAlerts,
  type NumberReputationRecord,
} from "@shared/number-pool-schema";

// ==================== TYPES ====================

export type ReputationBand = 'excellent' | 'healthy' | 'warning' | 'risk' | 'burned';

export interface ReputationScoreDetails {
  score: number;
  band: ReputationBand;
  components: {
    answerRateScore: number;
    durationScore: number;
    shortCallPenalty: number;
    hangupPenalty: number;
    voicemailPenalty: number;
    failurePenalty: number;
  };
  metrics: {
    totalCalls: number;
    answeredCalls: number;
    answerRate: number;
    avgDuration: number;
    shortCallRate: number;
    hangupRate: number;
    voicemailRate: number;
    failureRate: number;
  };
  previousScore: number | null;
  scoreChange: number;
}

interface WindowMetrics {
  totalCalls: number;
  answeredCalls: number;
  totalDurationSec: number;
  shortCalls: number;
  immediateHangups: number;
  voicemailCalls: number;
  failedCalls: number;
}

// ==================== CONSTANTS ====================

// Scoring weights (must sum to 1.0)
const WEIGHTS = {
  ANSWER_RATE: 0.30,
  AVG_DURATION: 0.20,
  SHORT_CALLS: 0.15,
  HANGUPS: 0.15,
  VOICEMAIL: 0.10,
  FAILURES: 0.10,
};

// Reputation band thresholds
const BANDS = {
  HEALTHY: 70,   // >= 70
  WARNING: 50,   // >= 50
  RISK: 40,      // >= 40
  BURNED: 0,     //  15%
  SHORT_CALL_GOOD: 0.05,
  SHORT_CALL_BAD: 0.15,
  
  // Hangup: acceptable  10%
  HANGUP_GOOD: 0.03,
  HANGUP_BAD: 0.10,
  
  // Voicemail: acceptable  40%
  VOICEMAIL_GOOD: 0.20,
  VOICEMAIL_BAD: 0.40,
  
  // Failure: acceptable  8%
  FAILURE_GOOD: 0.02,
  FAILURE_BAD: 0.08,
};

// Rolling window for calculations
const WINDOW_HOURS = 24;

// ==================== MAIN FUNCTIONS ====================

/**
 * Recalculate reputation score for a specific number
 */
export async function calculateReputation(
  numberId: string
): Promise {
  // Get current reputation record
  const [currentRep] = await db
    .select()
    .from(numberReputation)
    .where(eq(numberReputation.numberId, numberId))
    .limit(1);

  // Get metrics from rolling window
  const metrics = await getWindowMetrics(numberId, WINDOW_HOURS);

  // Calculate component scores
  const components = calculateComponents(metrics);

  // Calculate final weighted score
  const score = Math.round(
    components.answerRateScore * WEIGHTS.ANSWER_RATE +
    components.durationScore * WEIGHTS.AVG_DURATION +
    (100 - components.shortCallPenalty) * WEIGHTS.SHORT_CALLS +
    (100 - components.hangupPenalty) * WEIGHTS.HANGUPS +
    (100 - components.voicemailPenalty) * WEIGHTS.VOICEMAIL +
    (100 - components.failurePenalty) * WEIGHTS.FAILURES
  );

  // Clamp to 0-100
  const clampedScore = Math.max(0, Math.min(100, score));

  // Determine band
  const band = determineBand(clampedScore);

  // Calculate rates for response
  const rateMetrics = {
    totalCalls: metrics.totalCalls,
    answeredCalls: metrics.answeredCalls,
    answerRate: metrics.totalCalls > 0 ? metrics.answeredCalls / metrics.totalCalls : 0,
    avgDuration: metrics.answeredCalls > 0 ? metrics.totalDurationSec / metrics.answeredCalls : 0,
    shortCallRate: metrics.answeredCalls > 0 ? metrics.shortCalls / metrics.answeredCalls : 0,
    hangupRate: metrics.answeredCalls > 0 ? metrics.immediateHangups / metrics.answeredCalls : 0,
    voicemailRate: metrics.totalCalls > 0 ? metrics.voicemailCalls / metrics.totalCalls : 0,
    failureRate: metrics.totalCalls > 0 ? metrics.failedCalls / metrics.totalCalls : 0,
  };

  const previousScore = currentRep?.score ?? null;
  const scoreChange = previousScore !== null ? clampedScore - previousScore : 0;

  // Update or create reputation record
  await upsertReputation(numberId, clampedScore, band, metrics, rateMetrics);

  // Check for band changes and trigger actions
  if (currentRep && band !== currentRep.band) {
    await handleBandChange(numberId, currentRep.band as ReputationBand, band);
  }

  console.log(`[ReputationEngine] ${numberId}: score=${clampedScore} (${band}), change=${scoreChange > 0 ? '+' : ''}${scoreChange}`);

  return {
    score: clampedScore,
    band,
    components,
    metrics: rateMetrics,
    previousScore,
    scoreChange,
  };
}

/**
 * Recalculate reputation for all active numbers
 */
export async function recalculateAllReputations(): Promise;
}> {
  const numbers = await db
    .select({ id: telnyxNumbers.id })
    .from(telnyxNumbers)
    .where(eq(telnyxNumbers.status, 'active'));

  const bandCounts: Record = {
    excellent: 0,
    healthy: 0,
    warning: 0,
    risk: 0,
    burned: 0,
  };

  let processed = 0;
  let failed = 0;

  for (const num of numbers) {
    try {
      const result = await calculateReputation(num.id);
      bandCounts[result.band]++;
      processed++;
    } catch (error) {
      console.error(`[ReputationEngine] Failed to calculate for ${num.id}:`, error);
      failed++;
    }
  }

  console.log(`[ReputationEngine] Recalculated ${processed}/${numbers.length} numbers. Bands:`, bandCounts);

  return { processed, failed, bandCounts };
}

/**
 * Update reputation incrementally after a single call
 */
export async function updateReputationAfterCall(
  numberId: string,
  callMetrics: {
    answered: boolean;
    durationSec: number;
    isShortCall: boolean;
    isHangup: boolean;
    isVoicemail: boolean;
    isFailed: boolean;
  }
): Promise {
  // Get current reputation
  const [currentRep] = await db
    .select()
    .from(numberReputation)
    .where(eq(numberReputation.numberId, numberId))
    .limit(1);

  if (!currentRep) {
    // First call - do full calculation
    await calculateReputation(numberId);
    return;
  }

  // Incremental update using exponential moving average
  const alpha = 0.1; // Smoothing factor
  const newTotal = (currentRep.totalCalls ?? 0) + 1;
  const newAnswered = (currentRep.answeredCalls ?? 0) + (callMetrics.answered ? 1 : 0);
  const currentAvgDur = parseFloat(currentRep.avgDurationSec?.toString() ?? '0');
  const prevTotalDuration = currentAvgDur * (currentRep.answeredCalls ?? 0);
  const newDuration = prevTotalDuration + callMetrics.durationSec;
  const newShortCalls = (currentRep.shortCalls ?? 0) + (callMetrics.isShortCall ? 1 : 0);
  const newHangups = (currentRep.immediateHangups ?? 0) + (callMetrics.isHangup ? 1 : 0);
  const newVoicemails = (currentRep.voicemailCalls ?? 0) + (callMetrics.isVoicemail ? 1 : 0);
  const newFailures = (currentRep.failedCalls ?? 0) + (callMetrics.isFailed ? 1 : 0);

  // Calculate new score
  const newAnswerRate = newTotal > 0 ? newAnswered / newTotal : 0;
  const newAvgDuration = newAnswered > 0 ? newDuration / newAnswered : 0;
  
  const components = calculateComponents({
    totalCalls: newTotal,
    answeredCalls: newAnswered,
    totalDurationSec: newDuration,
    shortCalls: newShortCalls,
    immediateHangups: newHangups,
    voicemailCalls: newVoicemails,
    failedCalls: newFailures,
  });

  const instantScore = 
    components.answerRateScore * WEIGHTS.ANSWER_RATE +
    components.durationScore * WEIGHTS.AVG_DURATION +
    (100 - components.shortCallPenalty) * WEIGHTS.SHORT_CALLS +
    (100 - components.hangupPenalty) * WEIGHTS.HANGUPS +
    (100 - components.voicemailPenalty) * WEIGHTS.VOICEMAIL +
    (100 - components.failurePenalty) * WEIGHTS.FAILURES;

  // EMA smoothing
  const previousScore = currentRep.score ?? 70;
  const newScore = Math.round(alpha * instantScore + (1 - alpha) * previousScore);
  const clampedScore = Math.max(0, Math.min(100, newScore));
  const band = determineBand(clampedScore);

  // Update record
  await db
    .update(numberReputation)
    .set({
      score: clampedScore,
      band,
      totalCalls: newTotal,
      answeredCalls: newAnswered,
      avgDurationSec: newAvgDuration.toFixed(2),
      shortCalls: newShortCalls,
      immediateHangups: newHangups,
      voicemailCalls: newVoicemails,
      failedCalls: newFailures,
      lastCalculatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(numberReputation.numberId, numberId));

  // Check for band changes
  if (band !== currentRep.band) {
    await handleBandChange(numberId, currentRep.band as ReputationBand, band);
  }
}

// ==================== INTERNAL FUNCTIONS ====================

/**
 * Get aggregated metrics from rolling window
 */
async function getWindowMetrics(
  numberId: string,
  hours: number
): Promise {
  const cutoff = new Date(Date.now() - hours * 3600000);

  const [result] = await db
    .select({
      totalCalls: count(),
      answeredCalls: sql`COUNT(CASE WHEN answered = true THEN 1 END)`.as('answered_calls'),
      totalDurationSec: sql`COALESCE(SUM(duration_sec), 0)`.as('total_duration'),
      shortCalls: sql`COUNT(CASE WHEN is_short_call = true THEN 1 END)`.as('short_calls'),
      immediateHangups: sql`COUNT(CASE WHEN is_immediate_hangup = true THEN 1 END)`.as('hangups'),
      voicemails: sql`COUNT(CASE WHEN is_voicemail = true THEN 1 END)`.as('voicemails'),
      failures: sql`COUNT(CASE WHEN is_failed = true THEN 1 END)`.as('failures'),
    })
    .from(numberMetricsWindow)
    .where(
      and(
        eq(numberMetricsWindow.numberId, numberId),
        gt(numberMetricsWindow.calledAt, cutoff)
      )
    );

  return {
    totalCalls: Number(result.totalCalls) || 0,
    answeredCalls: Number(result.answeredCalls) || 0,
    totalDurationSec: Number(result.totalDurationSec) || 0,
    shortCalls: Number(result.shortCalls) || 0,
    immediateHangups: Number(result.immediateHangups) || 0,
    voicemailCalls: Number(result.voicemails) || 0,
    failedCalls: Number(result.failures) || 0,
  };
}

/**
 * Calculate individual component scores
 */
function calculateComponents(metrics: WindowMetrics) {
  const { totalCalls, answeredCalls, totalDurationSec, shortCalls, immediateHangups, voicemailCalls, failedCalls } = metrics;

  // Answer rate score (0-100)
  const answerRate = totalCalls > 0 ? answeredCalls / totalCalls : 0;
  const answerRateScore = scaleScore(
    answerRate,
    SCORING_PARAMS.ANSWER_RATE_BASELINE,
    SCORING_PARAMS.ANSWER_RATE_TARGET
  );

  // Duration score (0-100)
  const avgDuration = answeredCalls > 0 ? totalDurationSec / answeredCalls : 0;
  const durationScore = scaleScore(
    avgDuration,
    SCORING_PARAMS.DURATION_BASELINE_SEC,
    SCORING_PARAMS.DURATION_TARGET_SEC
  );

  // Short call penalty (0-100, higher = worse)
  const shortCallRate = answeredCalls > 0 ? shortCalls / answeredCalls : 0;
  const shortCallPenalty = scalePenalty(
    shortCallRate,
    SCORING_PARAMS.SHORT_CALL_GOOD,
    SCORING_PARAMS.SHORT_CALL_BAD
  );

  // Hangup penalty (0-100, higher = worse)
  const hangupRate = answeredCalls > 0 ? immediateHangups / answeredCalls : 0;
  const hangupPenalty = scalePenalty(
    hangupRate,
    SCORING_PARAMS.HANGUP_GOOD,
    SCORING_PARAMS.HANGUP_BAD
  );

  // Voicemail penalty (0-100, higher = worse)
  const voicemailRate = totalCalls > 0 ? voicemailCalls / totalCalls : 0;
  const voicemailPenalty = scalePenalty(
    voicemailRate,
    SCORING_PARAMS.VOICEMAIL_GOOD,
    SCORING_PARAMS.VOICEMAIL_BAD
  );

  // Failure penalty (0-100, higher = worse)
  const failureRate = totalCalls > 0 ? failedCalls / totalCalls : 0;
  const failurePenalty = scalePenalty(
    failureRate,
    SCORING_PARAMS.FAILURE_GOOD,
    SCORING_PARAMS.FAILURE_BAD
  );

  return {
    answerRateScore,
    durationScore,
    shortCallPenalty,
    hangupPenalty,
    voicemailPenalty,
    failurePenalty,
  };
}

/**
 * Scale a value to 0-100 score (higher value = higher score)
 */
function scaleScore(value: number, baseline: number, target: number): number {
  if (value >= target) return 100;
  if (value = bad) return 100;
  return Math.round(((value - good) / (bad - good)) * 100);
}

/**
 * Determine reputation band from score
 */
function determineBand(score: number): ReputationBand {
  if (score >= 85) return 'excellent';
  if (score >= BANDS.HEALTHY) return 'healthy';
  if (score >= BANDS.WARNING) return 'warning';
  if (score >= BANDS.RISK) return 'risk';
  return 'burned';
}

/**
 * Upsert reputation record
 */
async function upsertReputation(
  numberId: string,
  score: number,
  band: ReputationBand,
  metrics: WindowMetrics,
  rates: {
    answerRate: number;
    avgDuration: number;
    shortCallRate: number;
    hangupRate: number;
    voicemailRate: number;
    failureRate: number;
  }
): Promise {
  // Try to update existing
  const result = await db
    .update(numberReputation)
    .set({
      score,
      band,
      totalCalls: metrics.totalCalls,
      answeredCalls: metrics.answeredCalls,
      avgDurationSec: rates.avgDuration.toFixed(2),
      shortCalls: metrics.shortCalls,
      immediateHangups: metrics.immediateHangups,
      voicemailCalls: metrics.voicemailCalls,
      failedCalls: metrics.failedCalls,
      lastCalculatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(numberReputation.numberId, numberId));

  // Insert if not exists
  if (!result.rowCount || result.rowCount === 0) {
    await db.insert(numberReputation).values({
      numberId,
      score,
      band,
      totalCalls: metrics.totalCalls,
      answeredCalls: metrics.answeredCalls,
      avgDurationSec: rates.avgDuration.toFixed(2),
      shortCalls: metrics.shortCalls,
      immediateHangups: metrics.immediateHangups,
      voicemailCalls: metrics.voicemailCalls,
      failedCalls: metrics.failedCalls,
      lastCalculatedAt: new Date(),
    }).onConflictDoNothing();
  }
}

/**
 * Handle reputation band change (trigger cooldowns/alerts)
 */
async function handleBandChange(
  numberId: string,
  oldBand: ReputationBand,
  newBand: ReputationBand
): Promise {
  console.log(`[ReputationEngine] Band change for ${numberId}: ${oldBand} → ${newBand}`);

  // If dropped to burned, log alert only (no automatic cooldown — too aggressive for cold calling)
  if (newBand === 'burned') {
    console.log(`[ReputationEngine] Number ${numberId} dropped to BURNED — skipping auto-cooldown (cold calling pattern)`);
    await createAlert(numberId, 'number_burned', 'critical',
      `Number dropped to BURNED status from ${oldBand}`);
  }
  
  // If dropped to risk from healthy/warning, create warning alert
  else if (newBand === 'risk' && (oldBand === 'healthy' || oldBand === 'warning')) {
    await createAlert(numberId, 'reputation_declining', 'warning',
      `Number dropped to RISK status from ${oldBand}`);
  }
  
  // If recovered from burned/risk to healthy, create info alert
  else if (newBand === 'healthy' && (oldBand === 'burned' || oldBand === 'risk')) {
    await createAlert(numberId, 'reputation_recovered', 'info',
      `Number recovered to HEALTHY status from ${oldBand}`);
  }
}

/**
 * Trigger a cooldown for a number
 */
async function triggerCooldown(
  numberId: string,
  reason: string,
  hours: number
): Promise {
  const now = new Date();
  const endsAt = new Date(now.getTime() + hours * 3600000);

  await db.insert(numberCooldowns).values({
    numberId,
    reason: reason as any,
    startedAt: now,
    endsAt,
    isActive: true,
  });

  // Update number status
  await db
    .update(telnyxNumbers)
    .set({
      status: 'cooling',
      updatedAt: now,
    })
    .where(eq(telnyxNumbers.id, numberId));

  console.log(`[ReputationEngine] Triggered ${hours}h cooldown for ${numberId}: ${reason}`);
}

/**
 * Create alert for number pool
 */
async function createAlert(
  numberId: string,
  alertType: string,
  severity: 'info' | 'warning' | 'critical',
  description: string
): Promise {
  await db.insert(numberPoolAlerts).values({
    numberId,
    alertType,
    severity,
    title: alertType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description,
    isAcknowledged: false,
  });
}

// ==================== EXPORTS ====================

export default {
  calculateReputation,
  recalculateAllReputations,
  updateReputationAfterCall,
};