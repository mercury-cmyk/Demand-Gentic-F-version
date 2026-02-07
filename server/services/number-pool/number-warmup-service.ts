/**
 * Number Warmup Service
 * 
 * Implements gradual ramp-up for new phone numbers to avoid carrier flagging.
 * New numbers start with reduced call limits that increase over 3-5 days.
 * 
 * Warmup Phases:
 * - Day 1: 3 calls/hour, 15 calls/day (15%)
 * - Day 2: 6 calls/hour, 30 calls/day (30%)
 * - Day 3: 10 calls/hour, 50 calls/day (50%)
 * - Day 4: 15 calls/hour, 75 calls/day (75%)
 * - Day 5+: Full limits (20/hour, 100/day)
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md
 */

import { db } from "../../db";
import { eq, and, lt, sql } from "drizzle-orm";
import { telnyxNumbers } from "@shared/number-pool-schema";

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
 * Warmup schedule: gradual increase over 5 days
 * These limits are MUCH more conservative than carriers expect,
 * making the number look like a legitimate business line.
 */
const WARMUP_SCHEDULE: WarmupPhase[] = [
  { day: 1, maxCallsPerHour: 3,  maxCallsPerDay: 15,  percentOfMax: 15 },
  { day: 2, maxCallsPerHour: 6,  maxCallsPerDay: 30,  percentOfMax: 30 },
  { day: 3, maxCallsPerHour: 10, maxCallsPerDay: 50,  percentOfMax: 50 },
  { day: 4, maxCallsPerHour: 15, maxCallsPerDay: 75,  percentOfMax: 75 },
  { day: 5, maxCallsPerHour: 20, maxCallsPerDay: 100, percentOfMax: 100 },
];

const WARMUP_DAYS = 5;

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
  }
): NumberWarmupStatus {
  const acquiredAt = number.acquiredAt || new Date();
  const daysSinceAcquisition = Math.floor(
    (Date.now() - acquiredAt.getTime()) / (24 * 60 * 60 * 1000)
  ) + 1; // Day 1 = first day

  const currentPhase = getWarmupPhase(daysSinceAcquisition);
  const isWarmedUp = daysSinceAcquisition >= WARMUP_DAYS;

  // Calculate effective limits (use warmup limits if still in warmup)
  const configuredMaxHour = number.maxCallsPerHour ?? 20;
  const configuredMaxDay = number.maxCallsPerDay ?? 100;

  const effectiveMaxCallsPerHour = isWarmedUp
    ? configuredMaxHour
    : Math.min(currentPhase.maxCallsPerHour, configuredMaxHour);

  const effectiveMaxCallsPerDay = isWarmedUp
    ? configuredMaxDay
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
  }
): { canCall: boolean; reason?: string; warmupStatus: NumberWarmupStatus } {
  const status = getNumberWarmupStatus(number);

  const callsThisHour = number.callsThisHour ?? 0;
  const callsToday = number.callsToday ?? 0;

  if (callsThisHour >= status.effectiveMaxCallsPerHour) {
    return {
      canCall: false,
      reason: `Warmup hourly limit reached (${callsThisHour}/${status.effectiveMaxCallsPerHour})`,
      warmupStatus: status,
    };
  }

  if (callsToday >= status.effectiveMaxCallsPerDay) {
    return {
      canCall: false,
      reason: `Warmup daily limit reached (${callsToday}/${status.effectiveMaxCallsPerDay})`,
      warmupStatus: status,
    };
  }

  return { canCall: true, warmupStatus: status };
}

/**
 * Get all numbers currently in warmup phase
 */
export async function getNumbersInWarmup(): Promise<NumberWarmupStatus[]> {
  const warmupCutoff = new Date();
  warmupCutoff.setDate(warmupCutoff.getDate() - WARMUP_DAYS);

  const numbers = await db
    .select()
    .from(telnyxNumbers)
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
  }));
}

/**
 * Get recommended number pool size for a given call volume
 * Rule: 1 DID per 8-12 calls/hour, with warmup consideration
 * 
 * @param targetCallsPerHour - Desired calls per hour across all agents
 * @param includeWarmupBuffer - Add 20% buffer for numbers in warmup
 */
export function calculateRequiredPoolSize(
  targetCallsPerHour: number,
  includeWarmupBuffer = true
): {
  minimumNumbers: number;
  recommendedNumbers: number;
  withWarmupBuffer: number;
} {
  // Conservative: 1 number per 8-12 calls/hour
  const callsPerNumberPerHour = 10; // Middle of 8-12 range
  
  const minimumNumbers = Math.ceil(targetCallsPerHour / 20); // Max 20/hr per number
  const recommendedNumbers = Math.ceil(targetCallsPerHour / callsPerNumberPerHour);
  
  // Add 20% buffer for numbers that are in warmup (reduced capacity)
  const withWarmupBuffer = includeWarmupBuffer
    ? Math.ceil(recommendedNumbers * 1.2)
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
    .select()
    .from(telnyxNumbers)
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
    });

    if (status.isWarmedUp) {
      warmedUpNumbers++;
    } else {
      warmingNumbers++;
    }

    totalHourlyCapacity += num.maxCallsPerHour ?? 20;
    totalDailyCapacity += num.maxCallsPerDay ?? 100;
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
