/**
 * Number Router Service
 * 
 * Selects the optimal Telnyx phone number for outbound calls based on:
 * - Campaign/agent assignments
 * - Number reputation scores
 * - Pacing limits (hourly/daily caps)
 * - Geographic matching (local presence)
 * - Cooldown status
 * - Concurrent call limits
 * - Number warmup status (new numbers have reduced limits)
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md
 */

import { db } from "../../db";
import { eq, and, or, gt, isNull, desc, sql } from "drizzle-orm";
import {
  telnyxNumbers,
  numberAssignments,
  numberReputation,
  numberCooldowns,
  numberMetricsWindow,
  numberRoutingDecisions,
  prospectCallSuppression,
  type TelnyxNumber,
  type NumberReputationRecord,
} from "@shared/number-pool-schema";
import { canMakeCallDuringWarmup, getNumberWarmupStatus } from "./number-warmup-service";

// ==================== TYPES ====================

export interface NumberSelectionRequest {
  campaignId: string;
  virtualAgentId?: string;
  prospectNumber: string;
  prospectRegion?: string;
  prospectTimezone?: string;
  excludeNumberIds?: string[];
}

export interface NumberSelectionResult {
  numberId: string | null;
  numberE164: string;
  selectionReason: string;
  jitterDelayMs: number;
  decisionId: string | null;
}

interface EligibleNumber extends TelnyxNumber {
  reputation: NumberReputationRecord | null;
  assignmentPriority: number;
}

interface RankedNumber extends EligibleNumber {
  rankScore: number;
  selectionReason: string;
}

interface FilterResult {
  available: EligibleNumber[];
  filtered: Record<string, number>;
}

// ==================== CONSTANTS ====================

const MAX_CALLS_PER_HOUR_DEFAULT = 40;
const MAX_CALLS_PER_DAY_DEFAULT = 500;
const JITTER_MIN_MS = 45_000;  // 45 seconds (base for unknown/new numbers)
const JITTER_MAX_MS = 90_000;  // 90 seconds

// In-memory tracking for concurrent calls (should be Redis in production)
const numbersInUse = new Set<string>();

// ==================== ERROR CLASSES ====================

export class NoAvailableNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoAvailableNumberError';
  }
}

export class CallRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CallRoutingError';
  }
}

/**
 * Error thrown when all numbers have reached their hourly call limit.
 * The orchestrator should pause calling until limits reset (next hour).
 */
export class AllNumbersAtHourlyLimitError extends Error {
  public readonly filterStats: Record<string, number>;
  public readonly totalNumbers: number;
  public readonly numbersAtHourlyCap: number;

  constructor(filterStats: Record<string, number>, totalNumbers: number) {
    const numbersAtHourlyCap = filterStats.at_hourly_cap || 0;
    super(`All ${totalNumbers} numbers at hourly limit (${numbersAtHourlyCap} at cap). Calls paused until limits reset.`);
    this.name = 'AllNumbersAtHourlyLimitError';
    this.filterStats = filterStats;
    this.totalNumbers = totalNumbers;
    this.numbersAtHourlyCap = numbersAtHourlyCap;
  }
}

// ==================== MAIN SERVICE ====================

/**
 * Select the best available number for an outbound call
 */
export async function selectNumber(
  request: NumberSelectionRequest
): Promise<NumberSelectionResult> {
  const startTime = Date.now();
  
  try {
    // Step 1: Get eligible pool
    const pool = await getEligiblePool(request);
    
    if (pool.length === 0) {
      console.warn('[NumberRouter] No numbers in eligible pool, using fallback');
      return useFallbackNumber('no_pool');
    }

    // Step 2: Filter numbers
    const { available, filtered } = await filterNumbers(pool, request);

    if (available.length === 0) {
      console.warn('[NumberRouter] All numbers filtered:', filtered);

      // CRITICAL: If all numbers are at hourly limit, throw specific error
      // The orchestrator should PAUSE calling, not fall back to legacy number
      const atHourlyCap = filtered.at_hourly_cap || 0;
      const atDailyCap = filtered.at_daily_cap || 0;
      const warmupLimited = filtered.warmup_limited || 0;

      // If majority of filtering is due to hourly/daily caps, signal to pause
      if (atHourlyCap > 0 && atHourlyCap >= pool.length * 0.5) {
        console.warn(`[NumberRouter] 🚫 HOURLY LIMIT REACHED: ${atHourlyCap}/${pool.length} numbers at hourly cap`);
        throw new AllNumbersAtHourlyLimitError(filtered, pool.length);
      }

      if (atDailyCap > 0 && atDailyCap >= pool.length * 0.5) {
        console.warn(`[NumberRouter] 🚫 DAILY LIMIT REACHED: ${atDailyCap}/${pool.length} numbers at daily cap`);
        throw new AllNumbersAtHourlyLimitError(filtered, pool.length);
      }

      // For other filtering reasons (cooldown, warmup, concurrent), use fallback
      return useFallbackNumber('all_filtered');
    }

    // Step 3: Rank candidates
    const ranked = rankCandidates(available, request);
    
    // Step 4: Select best
    const selected = ranked[0];
    
    // Step 5: Calculate jitter
    const jitterDelayMs = calculateJitter(selected);
    
    // Step 6: Record decision
    const decisionId = await recordDecision({
      request,
      selected,
      candidatesCount: pool.length,
      filteredOut: filtered,
      latencyMs: Date.now() - startTime,
      jitterDelayMs,
    });
    
    // Step 7: Mark number in-use
    markNumberInUse(selected.id);

    console.log(`[NumberRouter] Selected ${selected.phoneNumberE164} for ${request.prospectNumber} (${selected.selectionReason})`);

    return {
      numberId: selected.id,
      numberE164: selected.phoneNumberE164,
      selectionReason: selected.selectionReason,
      jitterDelayMs,
      decisionId,
    };
  } catch (error) {
    console.error('[NumberRouter] Selection error:', error);
    return useFallbackNumber('error');
  }
}

/**
 * Release a number after call completes
 */
export function releaseNumber(numberId: string): void {
  numbersInUse.delete(numberId);
  console.log(`[NumberRouter] Released number ${numberId}`);
}

/**
 * Check if number pool routing is enabled
 */
export function isNumberPoolEnabled(): boolean {
  return process.env.TELNYX_NUMBER_POOL_ENABLED === 'true';
}

// ==================== INTERNAL FUNCTIONS ====================

/**
 * Get eligible number pool based on assignments
 */
async function getEligiblePool(request: NumberSelectionRequest): Promise<EligibleNumber[]> {
  // Get all active numbers with their reputation and assignments
  const results = await db
    .select({
      number: telnyxNumbers,
      reputation: numberReputation,
      assignmentPriority: numberAssignments.priority,
    })
    .from(telnyxNumbers)
    .leftJoin(numberReputation, eq(telnyxNumbers.id, numberReputation.numberId))
    .leftJoin(
      numberAssignments,
      and(
        eq(numberAssignments.numberId, telnyxNumbers.id),
        eq(numberAssignments.isActive, true),
        or(
          eq(numberAssignments.scope, 'global'),
          and(
            eq(numberAssignments.scope, 'campaign'),
            eq(numberAssignments.campaignId, request.campaignId)
          ),
          request.virtualAgentId
            ? and(
                eq(numberAssignments.scope, 'agent'),
                eq(numberAssignments.virtualAgentId, request.virtualAgentId)
              )
            : sql`false`
        )
      )
    )
    .where(eq(telnyxNumbers.status, 'active'));

  // Deduplicate and merge priorities
  const numberMap = new Map<string, EligibleNumber>();
  
  for (const row of results) {
    const existing = numberMap.get(row.number.id);
    const priority = row.assignmentPriority ?? 0;
    
    if (!existing || priority > existing.assignmentPriority) {
      numberMap.set(row.number.id, {
        ...row.number,
        reputation: row.reputation,
        assignmentPriority: priority,
      });
    }
  }

  return Array.from(numberMap.values());
}

/**
 * Filter out numbers that can't be used right now
 */
async function filterNumbers(
  pool: EligibleNumber[],
  request: NumberSelectionRequest
): Promise<FilterResult> {
  const filtered: Record<string, number> = {
    excluded: 0,
    at_hourly_cap: 0,
    at_daily_cap: 0,
    in_cooldown: 0,
    concurrent_in_use: 0,
    recently_called_prospect: 0,
    warmup_limited: 0,
  };
  
  const available: EligibleNumber[] = [];
  const now = new Date();

  for (const num of pool) {
    // Check exclusion list
    if (request.excludeNumberIds?.includes(num.id)) {
      filtered.excluded++;
      continue;
    }

    // Check warmup limits (new numbers have reduced caps, mature numbers get reputation bonus)
    const warmupCheck = canMakeCallDuringWarmup({
      id: num.id,
      phoneNumberE164: num.phoneNumberE164,
      acquiredAt: num.acquiredAt,
      maxCallsPerHour: num.maxCallsPerHour,
      maxCallsPerDay: num.maxCallsPerDay,
      callsThisHour: num.callsThisHour,
      callsToday: num.callsToday,
      reputationScore: num.reputation?.score ?? null,
      reputationBand: num.reputation?.band ?? null,
    });

    if (!warmupCheck.canCall) {
      console.log(`[NumberRouter] Number ${num.phoneNumberE164} filtered by warmup: ${warmupCheck.reason}`);
      filtered.warmup_limited++;
      continue;
    }

    // Check hourly cap (using warmup-adjusted effective limits)
    const effectiveMaxHourly = warmupCheck.warmupStatus.effectiveMaxCallsPerHour;
    if ((num.callsThisHour ?? 0) >= effectiveMaxHourly) {
      filtered.at_hourly_cap++;
      continue;
    }

    // Check daily cap (using warmup-adjusted effective limits)
    const effectiveMaxDaily = warmupCheck.warmupStatus.effectiveMaxCallsPerDay;
    if ((num.callsToday ?? 0) >= effectiveMaxDaily) {
      filtered.at_daily_cap++;
      continue;
    }

    // Check active cooldown
    const [activeCooldown] = await db
      .select()
      .from(numberCooldowns)
      .where(
        and(
          eq(numberCooldowns.numberId, num.id),
          eq(numberCooldowns.isActive, true),
          gt(numberCooldowns.endsAt, now)
        )
      )
      .limit(1);

    if (activeCooldown) {
      filtered.in_cooldown++;
      continue;
    }

    // Check concurrent calls (max 1 per DID)
    if (numbersInUse.has(num.id)) {
      filtered.concurrent_in_use++;
      continue;
    }

    // Check if we recently called this prospect from this number
    const recentCall = await checkRecentProspectCall(
      num.id,
      request.prospectNumber,
      24 // hours
    );
    if (recentCall) {
      filtered.recently_called_prospect++;
      continue;
    }

    available.push(num);
  }

  return { available, filtered };
}

/**
 * Rank candidates by selection criteria
 */
function rankCandidates(
  candidates: EligibleNumber[],
  request: NumberSelectionRequest
): RankedNumber[] {
  const prospectAreaCode = extractAreaCode(request.prospectNumber);

  return candidates
    .map((num) => {
      let score = 0;
      let reason = '';

      // Local match bonus (20 points)
      if (num.areaCode === prospectAreaCode) {
        score += 20;
        reason = 'local_match';
      }

      // Region match bonus (10 points)
      if (request.prospectRegion && num.region === request.prospectRegion) {
        score += 10;
        if (!reason) reason = 'region_match';
      }

      // Reputation score (0-100 scaled to 0-50)
      const repScore = ((num.reputation?.score ?? 70) / 2);
      score += repScore;

      if (!reason && repScore >= 40) {
        reason = 'highest_reputation';
      }

      // Assignment priority bonus (5 points per level)
      score += num.assignmentPriority * 5;

      // Least recently used bonus (up to 10 points)
      if (num.lastCallAt) {
        const hoursSinceLastCall = (Date.now() - num.lastCallAt.getTime()) / 3600000;
        score += Math.min(10, hoursSinceLastCall);
      } else {
        score += 10; // Never used = full bonus
      }

      // Lower short-call rate bonus (up to 10 points)
      if (num.reputation?.totalCalls && num.reputation.totalCalls > 0) {
        const shortCallRate = (num.reputation.shortCalls ?? 0) / num.reputation.totalCalls;
        score += (1 - shortCallRate) * 10;
      }

      return {
        ...num,
        rankScore: score,
        selectionReason: reason || 'pool_selection',
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

/**
 * Calculate jitter delay for carrier-safe pacing
 */
function calculateJitter(number: EligibleNumber): number {
  // Base jitter: random between 45-90 seconds
  let jitter = JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);

  // Reputation-based adjustment — reward good numbers, penalize bad
  const rep = number.reputation?.score ?? 70;
  const band = number.reputation?.band ?? 'healthy';

  if (band === 'excellent' || rep >= 85) {
    // Excellent: 50% jitter reduction — proven safe number
    jitter *= 0.5;
  } else if (band === 'healthy' || rep >= 70) {
    // Healthy: 30% jitter reduction
    jitter *= 0.7;
  } else if (rep < 40) {
    // Burned: 3x delay (shouldn't be using burned numbers)
    jitter *= 3.0;
  } else if (rep < 50) {
    // Risk: 2x delay
    jitter *= 2.0;
  } else if (rep < 60) {
    // Warning: 1.5x delay
    jitter *= 1.5;
  }

  // Age-based trust bonus — numbers over 14 days get additional reduction
  const daysSinceAcquired = number.acquiredAt
    ? Math.floor((Date.now() - number.acquiredAt.getTime()) / (24 * 60 * 60 * 1000)) + 1
    : 1;

  if (daysSinceAcquired >= 30 && rep >= 70) {
    // Established + healthy: additional 20% reduction
    jitter *= 0.8;
  } else if (daysSinceAcquired >= 14 && rep >= 70) {
    // Mature + healthy: additional 10% reduction
    jitter *= 0.9;
  }

  // High volume adjustment — scale with total hourly cap, not fixed threshold
  const effectiveHourlyCap = number.maxCallsPerHour ?? 50;
  if ((number.callsThisHour ?? 0) > effectiveHourlyCap * 0.75) {
    jitter *= 1.25;
  }

  // Floor: never go below 15 seconds (carrier safety)
  return Math.max(15_000, Math.floor(jitter));
}

/**
 * Use fallback to legacy single number
 */
function useFallbackNumber(reason: string): NumberSelectionResult {
  const legacyNumber = process.env.TELNYX_FROM_NUMBER;
  
  if (!legacyNumber) {
    throw new CallRoutingError('No numbers available and no fallback configured');
  }

  console.log(`[NumberRouter] Using legacy fallback: ${legacyNumber} (reason: ${reason})`);

  return {
    numberId: null,
    numberE164: legacyNumber,
    selectionReason: `legacy_fallback_${reason}`,
    jitterDelayMs: 0,
    decisionId: null,
  };
}

/**
 * Check if we recently called this prospect from this number
 */
async function checkRecentProspectCall(
  numberId: string,
  prospectNumber: string,
  hoursAgo: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - hoursAgo * 3600000);

  const [recentCall] = await db
    .select()
    .from(numberMetricsWindow)
    .where(
      and(
        eq(numberMetricsWindow.numberId, numberId),
        eq(numberMetricsWindow.prospectNumberE164, prospectNumber),
        gt(numberMetricsWindow.calledAt, cutoff)
      )
    )
    .limit(1);

  return !!recentCall;
}

/**
 * Mark number as in-use (concurrent call guard)
 */
function markNumberInUse(numberId: string): void {
  numbersInUse.add(numberId);
}

/**
 * Record routing decision for audit
 */
async function recordDecision(params: {
  request: NumberSelectionRequest;
  selected: RankedNumber;
  candidatesCount: number;
  filteredOut: Record<string, number>;
  latencyMs: number;
  jitterDelayMs: number;
}): Promise<string> {
  const prospectAreaCode = extractAreaCode(params.request.prospectNumber);

  const [decision] = await db
    .insert(numberRoutingDecisions)
    .values({
      campaignId: params.request.campaignId,
      virtualAgentId: params.request.virtualAgentId,
      prospectNumberE164: params.request.prospectNumber,
      prospectAreaCode,
      prospectRegion: params.request.prospectRegion,
      selectedNumberId: params.selected.id,
      selectedNumberE164: params.selected.phoneNumberE164,
      selectionReason: params.selected.selectionReason,
      candidatesCount: params.candidatesCount,
      candidatesFilteredOut: params.filteredOut,
      routingLatencyMs: params.latencyMs,
      jitterDelayMs: params.jitterDelayMs,
    })
    .returning({ id: numberRoutingDecisions.id });

  return decision.id;
}

/**
 * Extract area code from E.164 phone number
 */
function extractAreaCode(phoneNumber: string): string | undefined {
  // Remove +1 prefix and get first 3 digits
  const digits = phoneNumber.replace(/\D/g, '');
  
  if (digits.startsWith('1') && digits.length >= 4) {
    return digits.substring(1, 4);
  }
  
  if (digits.length >= 3) {
    return digits.substring(0, 3);
  }

  return undefined;
}

// ==================== CALL OUTCOME RECORDING ====================

export interface CallOutcome {
  callSessionId?: string;
  dialerAttemptId?: string;
  answered: boolean;
  durationSec: number;
  disposition: string;
  failed: boolean;
  failureReason?: string;
  prospectNumber: string;
  campaignId?: string;
}

/**
 * Record call outcome for a number (updates usage counters and metrics)
 */
export async function recordCallOutcome(
  numberId: string,
  outcome: CallOutcome
): Promise<void> {
  // Update number usage counters
  await db
    .update(telnyxNumbers)
    .set({
      lastCallAt: new Date(),
      callsToday: sql`calls_today + 1`,
      callsThisHour: sql`calls_this_hour + 1`,
      ...(outcome.answered ? { lastAnsweredAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(telnyxNumbers.id, numberId));

  // Record in metrics window
  await db.insert(numberMetricsWindow).values({
    numberId,
    callSessionId: outcome.callSessionId,
    dialerAttemptId: outcome.dialerAttemptId,
    calledAt: new Date(),
    answered: outcome.answered,
    durationSec: outcome.durationSec,
    disposition: outcome.disposition,
    isShortCall: outcome.durationSec > 0 && outcome.durationSec < 8,
    isImmediateHangup: outcome.durationSec > 0 && outcome.durationSec < 3,
    isVoicemail: outcome.disposition === 'voicemail',
    isFailed: outcome.failed,
    failureReason: outcome.failureReason,
    prospectNumberE164: outcome.prospectNumber,
    campaignId: outcome.campaignId,
  });

  // Release the number
  releaseNumber(numberId);

  console.log(`[NumberRouter] Recorded outcome for ${numberId}: ${outcome.disposition} (${outcome.durationSec}s)`);
}

// ==================== EXPORTS ====================

export default {
  selectNumber,
  releaseNumber,
  recordCallOutcome,
  isNumberPoolEnabled,
};
