/**
 * Number Warmup Service
 *
 * Implements gradual ramp-up for new phone numbers to avoid carrier flagging.
 * New numbers start with reduced call limits that increase daily over 14 days.
 *
 * Warmup Phases (aggressive ramp-up to 500 calls/day max):
 * - Day 1:  20 calls/hour, 100 calls/day (20%)
 * - Day 2:  25 calls/hour, 125 calls/day (25%)
 * - Day 3:  30 calls/hour, 150 calls/day (30%)
 * - Day 4:  40 calls/hour, 200 calls/day (40%)
 * - Day 5:  50 calls/hour, 250 calls/day (50%)
 * - Day 6:  50 calls/hour, 250 calls/day (50%)
 * - Day 7:  60 calls/hour, 300 calls/day (60%)
 * - Day 8:  70 calls/hour, 350 calls/day (70%)
 * - Day 9:  80 calls/hour, 400 calls/day (80%)
 * - Day 10: 90 calls/hour, 450 calls/day (90%)
 * - Day 11-14: Gradual increase to max
 * - Day 14+: Full limits (100/hour, 500/day)
 *
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md
 */

import { db } from "../../db";
import { eq, and, lt, sql } from "drizzle-orm";
import { telnyxNumbers, numberReputation } from "@shared/number-pool-schema";

// ==================== TYPES ====================

export interface WarmupPhase {
  day: number;
  maxCallsPerHour: number;
  maxCallsPerDay: number;
  percentOfMax: number;
}

export interface NumberWarmupStatus {
  numberId: string;
  phoneNumber: string;
  acquiredAt: Date;
  daysSinceAcquisition: number;
  currentPhase: WarmupPhase;
  isWarmedUp: boolean;
  effectiveMaxCallsPerHour: number;
  effectiveMaxCallsPerDay: number;
}

// ==================== CONSTANTS ====================

/**
 * Warmup schedule: gradual increase over 14 days
 * Aggressive ramp-up to reach 500 calls/day max capacity
 * Day 1-7: Initial ramp to build carrier trust
 * Day 8-13: Accelerated growth phase
 * Day 14+: Fully warmed up — reputation-based bonus kicks in
 */
const WARMUP_SCHEDULE: WarmupPhase[] = [
  { day: 1,  maxCallsPerHour: 100, maxCallsPerDay: 200,  percentOfMax: 40 },
  { day: 2,  maxCallsPerHour: 125, maxCallsPerDay: 250,  percentOfMax: 50 },
  { day: 3,  maxCallsPerHour: 150, maxCallsPerDay: 300,  percentOfMax: 60 },
  { day: 4,  maxCallsPerHour: 175, maxCallsPerDay: 400,  percentOfMax: 80 },
  { day: 5,  maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
  { day: 6,  maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
  { day: 7,  maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
  { day: 8,  maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
  { day: 9,  maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
  { day: 10, maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
  { day: 11, maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
  { day: 12, maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
  { day: 13, maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
  { day: 14, maxCallsPerHour: 200, maxCallsPerDay: 500,  percentOfMax: 100 },
];

const WARMUP_DAYS = 14;

// ==================== MAIN SERVICE ====================

/**
 * Get the current warmup status for a number
 */
export function getNumberWarmupStatus(
  number: {
    id: string;
    phoneNumberE164: string;
    acquiredAt: Date | null;
    maxCallsPerHour: number | null;
    maxCallsPerDay: number | null;
    reputationScore?: number | null;
    reputationBand?: string | null;
  }
): NumberWarmupStatus {
  const acquiredAt = number.acquiredAt || new Date();
  const daysSinceAcquisition = Math.floor(
    (Date.now() - acquiredAt.getTime()) / (24 * 60 * 60 * 1000)
  ) + 1; // Day 1 = first day

  const currentPhase = getWarmupPhase(daysSinceAcquisition);
  const isWarmedUp = daysSinceAcquisition >= WARMUP_DAYS;

  // Base configured limits (higher defaults for mature numbers)
  // Max capacity: 100 calls/hour, 500 calls/day after full warmup
  const configuredMaxHour = number.maxCallsPerHour ?? 100;
  const configuredMaxDay = number.maxCallsPerDay ?? 500;

  // Calculate reputation + age bonus multiplier
  // Numbers with proven track records earn higher limits
  const reputationMultiplier = getReputationMultiplier(
    number.reputationScore ?? null,
    number.reputationBand ?? null,
    daysSinceAcquisition
  );

  const effectiveMaxCallsPerHour = isWarmedUp
    ? Math.round(configuredMaxHour * reputationMultiplier)
    : Math.min(currentPhase.maxCallsPerHour, configuredMaxHour);

  const effectiveMaxCallsPerDay = isWarmedUp
    ? Math.round(configuredMaxDay * reputationMultiplier)
    : Math.min(currentPhase.maxCallsPerDay, configuredMaxDay);

  return {
    numberId: number.id,
    phoneNumber: number.phoneNumberE164,
    acquiredAt,
    daysSinceAcquisition,
    currentPhase,
    isWarmedUp,
    effectiveMaxCallsPerHour,
    effectiveMaxCallsPerDay,
  };
}

/**
 * Reputation + Age multiplier for call limits.
 *
 * After 14-day warmup, reputation and age combine for bonus capacity:
 * - Excellent numbers with 60+ days can reach 750 calls/day (500 * 1.5)
 *
 * Reputation Band │ Days 14-29 │ Days 30-59 │ Days 60+
 * ────────────────┼────────────┼────────────┼─────────
 * excellent (≥85) │    1.0     │    1.3     │   1.5
 * healthy  (≥70)  │    1.0     │    1.2     │   1.3
 * warning  (≥50)  │    0.85    │    0.9     │   0.95
 * risk     (≥40)  │    0.5     │    0.5     │   0.5
 * burned   (<40)  │    0.25    │    0.25    │   0.25
 * no data         │    0.9     │    1.0     │   1.0
 */
function getReputationMultiplier(
  score: number | null,
  band: string | null,
  daysSinceAcquisition: number
): number {
  // Age tiers (adjusted for 14-day warmup)
  const isVeteran = daysSinceAcquisition >= 60;
  const isEstablished = daysSinceAcquisition >= 30;
  const isMature = daysSinceAcquisition >= 14;
  // const isFresh = daysSinceAcquisition < 14;  // still in warmup

  // No reputation data yet — be slightly conservative
  if (score === null || score === undefined) {
    return isEstablished ? 1.0 : isMature ? 0.9 : 0.8;
  }

  switch (band) {
    case 'excellent': // ≥ 85
      return isVeteran ? 1.5 : isEstablished ? 1.3 : 1.0;
    case 'healthy':   // ≥ 70
      return isVeteran ? 1.3 : isEstablished ? 1.2 : 1.0;
    case 'warning':   // ≥ 50
      return isVeteran ? 0.95 : isEstablished ? 0.9 : 0.85;
    case 'risk':      // ≥ 40
      return 0.5;
    case 'burned':    // < 40
      return 0.25;
    default:
      return isEstablished ? 1.0 : 0.9;
  }
}

/**
 * Get the warmup phase for a given day
 */
export function getWarmupPhase(day: number): WarmupPhase {
  if (day >= WARMUP_DAYS) {
    return WARMUP_SCHEDULE[WARMUP_SCHEDULE.length - 1];
  }
  return WARMUP_SCHEDULE[Math.max(0, day - 1)];
}

/**
 * Check if a number can make another call given warmup constraints
 */
export function canMakeCallDuringWarmup(
  number: {
    id: string;
    phoneNumberE164: string;
    acquiredAt: Date | null;
    maxCallsPerHour: number | null;
    maxCallsPerDay: number | null;
    callsThisHour: number | null;
    callsToday: number | null;
    reputationScore?: number | null;
    reputationBand?: string | null;
  }
): { canCall: boolean; reason?: string; warmupStatus: NumberWarmupStatus } {
  // ALL WARMUP LIMITS REMOVED per user request.
  // Numbers can make unlimited calls — only concurrent-call + 30s gap guards remain.
  const status = getNumberWarmupStatus(number);
  return { canCall: true, warmupStatus: status };
}

/**
 * Get all numbers currently in warmup phase
 */
export async function getNumbersInWarmup(): Promise<NumberWarmupStatus[]> {
  const warmupCutoff = new Date();
  warmupCutoff.setDate(warmupCutoff.getDate() - WARMUP_DAYS);

  const numbers = await db
    .select({
      id: telnyxNumbers.id,
      phoneNumberE164: telnyxNumbers.phoneNumberE164,
      acquiredAt: telnyxNumbers.acquiredAt,
      maxCallsPerHour: telnyxNumbers.maxCallsPerHour,
      maxCallsPerDay: telnyxNumbers.maxCallsPerDay,
      reputationScore: numberReputation.score,
      reputationBand: numberReputation.band,
    })
    .from(telnyxNumbers)
    .leftJoin(numberReputation, eq(telnyxNumbers.id, numberReputation.numberId))
    .where(
      and(
        eq(telnyxNumbers.status, 'active'),
        sql`${telnyxNumbers.acquiredAt} > ${warmupCutoff}`
      )
    );

  return numbers.map(num => getNumberWarmupStatus({
    id: num.id,
    phoneNumberE164: num.phoneNumberE164,
    acquiredAt: num.acquiredAt,
    maxCallsPerHour: num.maxCallsPerHour,
    maxCallsPerDay: num.maxCallsPerDay,
    reputationScore: num.reputationScore,
    reputationBand: num.reputationBand,
  }));
}

/**
 * Get recommended number pool size for a given call volume
 * Rule: 1 DID per 50-100 calls/hour after warmup
 *
 * @param targetCallsPerHour - Desired calls per hour across all agents
 * @param includeWarmupBuffer - Add 25% buffer for numbers in warmup
 */
export function calculateRequiredPoolSize(
  targetCallsPerHour: number,
  includeWarmupBuffer = true
): {
  minimumNumbers: number;
  recommendedNumbers: number;
  withWarmupBuffer: number;
} {
  // With reputation-based limits: excellent numbers can do up to 150/hr (100 * 1.5)
  // Conservative estimate uses 50/hr per number for planning
  const callsPerNumberPerHour = 50;

  const minimumNumbers = Math.ceil(targetCallsPerHour / 100); // Max 100/hr per fully warmed number
  const recommendedNumbers = Math.ceil(targetCallsPerHour / callsPerNumberPerHour);

  // Add 25% buffer for numbers that are in warmup (reduced capacity during 14-day ramp)
  const withWarmupBuffer = includeWarmupBuffer
    ? Math.ceil(recommendedNumbers * 1.25)
    : recommendedNumbers;

  return {
    minimumNumbers,
    recommendedNumbers,
    withWarmupBuffer,
  };
}

/**
 * Estimate total capacity of the current number pool
 */
export async function estimatePoolCapacity(): Promise<{
  totalNumbers: number;
  warmedUpNumbers: number;
  warmingNumbers: number;
  totalHourlyCapacity: number;
  totalDailyCapacity: number;
  effectiveHourlyCapacity: number;
  effectiveDailyCapacity: number;
}> {
  const activeNumbers = await db
    .select({
      id: telnyxNumbers.id,
      phoneNumberE164: telnyxNumbers.phoneNumberE164,
      acquiredAt: telnyxNumbers.acquiredAt,
      maxCallsPerHour: telnyxNumbers.maxCallsPerHour,
      maxCallsPerDay: telnyxNumbers.maxCallsPerDay,
      reputationScore: numberReputation.score,
      reputationBand: numberReputation.band,
    })
    .from(telnyxNumbers)
    .leftJoin(numberReputation, eq(telnyxNumbers.id, numberReputation.numberId))
    .where(eq(telnyxNumbers.status, 'active'));

  let warmedUpNumbers = 0;
  let warmingNumbers = 0;
  let totalHourlyCapacity = 0;
  let totalDailyCapacity = 0;
  let effectiveHourlyCapacity = 0;
  let effectiveDailyCapacity = 0;

  for (const num of activeNumbers) {
    const status = getNumberWarmupStatus({
      id: num.id,
      phoneNumberE164: num.phoneNumberE164,
      acquiredAt: num.acquiredAt,
      maxCallsPerHour: num.maxCallsPerHour,
      maxCallsPerDay: num.maxCallsPerDay,
      reputationScore: num.reputationScore,
      reputationBand: num.reputationBand,
    });

    if (status.isWarmedUp) {
      warmedUpNumbers++;
    } else {
      warmingNumbers++;
    }

    totalHourlyCapacity += num.maxCallsPerHour ?? 100;
    totalDailyCapacity += num.maxCallsPerDay ?? 500;
    effectiveHourlyCapacity += status.effectiveMaxCallsPerHour;
    effectiveDailyCapacity += status.effectiveMaxCallsPerDay;
  }

  return {
    totalNumbers: activeNumbers.length,
    warmedUpNumbers,
    warmingNumbers,
    totalHourlyCapacity,
    totalDailyCapacity,
    effectiveHourlyCapacity,
    effectiveDailyCapacity,
  };
}

// ==================== EXPORTS ====================

export default {
  getNumberWarmupStatus,
  getWarmupPhase,
  canMakeCallDuringWarmup,
  getNumbersInWarmup,
  calculateRequiredPoolSize,
  estimatePoolCapacity,
  WARMUP_SCHEDULE,
  WARMUP_DAYS,
};
