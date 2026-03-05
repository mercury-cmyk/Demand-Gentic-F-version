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
import { eq, and, or, gt, desc, sql } from "drizzle-orm";
import {
  telnyxNumbers,
  numberAssignments,
  numberReputation,
  numberMetricsWindow,
  numberRoutingDecisions,
  type TelnyxNumber,
  type NumberReputationRecord,
} from "@shared/number-pool-schema";

// ==================== TYPES ====================

export interface NumberSelectionRequest {
  campaignId: string;
  virtualAgentId?: string;
  prospectNumber: string;
  prospectRegion?: string;
  prospectTimezone?: string;
  excludeNumberIds?: string[];
  /** Call engine override. If omitted, auto-detected from agentDefaults.defaultCallEngine */
  callEngine?: 'texml' | 'sip';
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

// ALL PER-NUMBER HOURLY/DAILY LIMITS REMOVED per user request.
// Only constraints: 1 concurrent call per number + 30s gap between calls.
const JITTER_MIN_MS = 500;   // Minimal jitter — limits removed
const JITTER_MAX_MS = 1500;  // Minimal jitter — limits removed

// In-memory tracking for concurrent calls (should be Redis in production)
// Map<numberId, lockedAtTimestamp> — timestamps allow stuck-number detection
const numbersInUse = new Map<string, number>();

// Maximum time a number can stay locked before auto-release (3 minutes)
// Reduced from 10min: if a number is locked >3min without explicit release,
// the call is already done or failed — keeping it locked starves the pool.
const MAX_NUMBER_LOCK_MS = 3 * 60 * 1000;
// How often to run the stale-lock cleanup sweep (30 seconds)
// Reduced from 60s to catch leaked locks faster and prevent pool exhaustion stalls.
const CLEANUP_INTERVAL_MS = 30 * 1000;

// === ELIGIBLE POOL CACHE ===
// The pool query (3-way JOIN) rarely changes but was firing on EVERY call attempt.
// Cache for 30s to avoid hammering the DB with identical queries.
let _poolCache: { key: string; pool: EligibleNumber[]; cachedAt: number } | null = null;
const POOL_CACHE_TTL_MS = 30_000;

/**
 * Periodic cleanup: auto-release numbers stuck in-use beyond MAX_NUMBER_LOCK_MS.
 * This prevents permanent lockouts from lost webhooks, crashed calls, or missed releaseNumber() calls.
 */
function cleanupStaleNumberLocks(): void {
  const now = Date.now();
  let released = 0;

  for (const [numberId, lockedAt] of Array.from(numbersInUse.entries())) {
    const ageMs = now - lockedAt;
    if (ageMs > MAX_NUMBER_LOCK_MS) {
      numbersInUse.delete(numberId);
      released++;
      console.warn(`[NumberRouter] ⏰ Auto-released stale number ${numberId} (locked for ${Math.round(ageMs / 1000)}s, max=${MAX_NUMBER_LOCK_MS / 1000}s)`);
    }
  }

  if (released > 0) {
    console.log(`[NumberRouter] Cleanup sweep: released ${released} stale number(s), ${numbersInUse.size} still in use`);
  }
}

// Start the periodic cleanup on module load
const _cleanupTimer = setInterval(cleanupStaleNumberLocks, CLEANUP_INTERVAL_MS);
// Allow Node to exit even if cleanup timer is running
if (_cleanupTimer.unref) _cleanupTimer.unref();

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
      console.warn('[NumberRouter] No numbers in eligible pool');
      // When pool is enabled, never fall back to legacy — throw so caller can re-queue
      throw new NoAvailableNumberError('No numbers in eligible pool');
    }

    // Step 2: Filter numbers
    const { available, filtered } = await filterNumbers(pool, request);

    if (available.length === 0) {
      console.warn('[NumberRouter] All numbers filtered:', filtered);

      // All numbers are currently in use (concurrent call guard). The caller should re-queue.
      throw new NoAvailableNumberError('All numbers temporarily in use (concurrent call guard)');
    }

    // Step 3: Rank candidates
    const ranked = rankCandidates(available, request);
    
    // Step 4: Select best (with Race Condition protection)
    // We re-check numbersInUse synchronously here to prevent double-booking
    // that can happen during the async filterNumbers phase.
    let selected: RankedNumber | null = null;

    for (const candidate of ranked) {
      if (!numbersInUse.has(candidate.id)) {
        // CRITICAL: Lock synchronously immediately
        markNumberInUse(candidate.id);
        console.log(`[NumberRouter] Locked number ${candidate.id} (${candidate.phoneNumberE164}) synchronously`);
        selected = candidate;
        break;
      } else {
        console.log(`[NumberRouter] Number ${candidate.id} (${candidate.phoneNumberE164}) was already busy (race preventer)`);
      }
    }

    if (!selected) {
      console.warn('[NumberRouter] All ranked candidates became busy during selection race');
      throw new NoAvailableNumberError('All numbers busy (race condition)');
    }
    
    // Step 5: Calculate jitter
    const jitterDelayMs = calculateJitter(selected);
    
    // Step 6: Record decision (fire-and-forget — audit insert should NOT block call initiation)
    // The decision ID is not critical for call flow; it's for post-hoc analytics.
    const decisionPromise = recordDecision({
      request,
      selected,
      candidatesCount: pool.length,
      filteredOut: filtered,
      latencyMs: Date.now() - startTime,
      jitterDelayMs,
    }).catch(err => {
      console.error(`[NumberRouter] Non-blocking recordDecision failed:`, err);
      return null;
    });
    
    // Await briefly (5ms) to get decisionId if it resolves fast, otherwise continue
    const decisionId = await Promise.race([
      decisionPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 5)),
    ]);
    
    console.log(`[NumberRouter] Selected ${selected.phoneNumberE164} for ${request.prospectNumber} (${selected.selectionReason})`);

    return {
      numberId: selected.id,
      numberE164: selected.phoneNumberE164,
      selectionReason: selected.selectionReason,
      jitterDelayMs,
      decisionId,
    };
  } catch (error) {
    // Re-throw typed errors so callers can handle them properly (re-queue, pause, etc.)
    // Do NOT swallow these into legacy fallback — that bypasses concurrent-call protection.
    if (error instanceof NoAvailableNumberError || error instanceof AllNumbersAtHourlyLimitError) {
      throw error;
    }
    console.error('[NumberRouter] Selection error:', error);
    if (isNumberPoolEnabled()) {
      // When pool is enabled, never fall back to legacy number — it has no concurrent-call tracking.
      // Re-throw so the caller can re-queue instead.
      throw new NoAvailableNumberError('Pool selection error — no legacy fallback when pool enabled');
    }
    return useFallbackNumber('error');
  }
}

/**
 * Release a number after call completes (with compulsory gap to prevent immediate re-dial)
 */
export function releaseNumber(numberId: string): void {
  // Enforce gap between calls on the same number.
  // 30s gap per user request — consistent dialing with minimal restriction.
  const COMPULSORY_DELAY_MS = 30000;

  const lockedAt = numbersInUse.get(numberId);
  const lockDurationSec = lockedAt ? Math.round((Date.now() - lockedAt) / 1000) : 0;

  console.log(`[NumberRouter] Scheduling release of number ${numberId} in ${COMPULSORY_DELAY_MS}ms (was locked for ${lockDurationSec}s)`);

  const timer = setTimeout(() => {
    numbersInUse.delete(numberId);
    console.log(`[NumberRouter] Released number ${numberId} after delay`);
  }, COMPULSORY_DELAY_MS);

  // Don't let this timer prevent Node from exiting
  if (timer.unref) timer.unref();
}

/**
 * Get current number pool lock status (for diagnostics)
 */
export function getNumberPoolStatus(): { inUse: number; numbers: Array<{ id: string; lockedForSec: number }> } {
  const now = Date.now();
  const numbers = Array.from(numbersInUse.entries()).map(([id, lockedAt]) => ({
    id,
    lockedForSec: Math.round((now - lockedAt) / 1000),
  }));
  return { inUse: numbersInUse.size, numbers };
}

/**
 * Force-release all numbers (emergency reset for stuck pools)
 */
export function forceReleaseAllNumbers(): number {
  const count = numbersInUse.size;
  numbersInUse.clear();
  console.warn(`[NumberRouter] 🚨 FORCE RELEASED all ${count} numbers from in-use pool`);
  return count;
}

/**
 * Release only numbers that have been locked longer than the given threshold.
 * Unlike forceReleaseAllNumbers(), this is safe to call during active calling
 * because it leaves legitimately-in-use numbers alone.
 */
export function releaseStaleNumbers(thresholdMs: number = 120_000): number {
  const now = Date.now();
  let released = 0;
  for (const [numberId, lockedAt] of Array.from(numbersInUse.entries())) {
    if (now - lockedAt > thresholdMs) {
      numbersInUse.delete(numberId);
      released++;
      console.warn(`[NumberRouter] 🔓 Released stale number ${numberId} (locked for ${Math.round((now - lockedAt) / 1000)}s, threshold=${thresholdMs / 1000}s)`);
    }
  }
  if (released > 0) {
    console.log(`[NumberRouter] Stale release: freed ${released} number(s), ${numbersInUse.size} still in use`);
  }
  return released;
}

/**
 * Invalidate the eligible pool cache (call when numbers are added/removed/deactivated)
 */
export function invalidatePoolCache(): void {
  _poolCache = null;
}

/**
 * Check if number pool routing is enabled
 */
export function isNumberPoolEnabled(): boolean {
  return process.env.TELNYX_NUMBER_POOL_ENABLED === 'true';
}

// ==================== INTERNAL FUNCTIONS ====================

/**
 * Resolve the Telnyx connection ID for the active call engine.
 * Maps engine type to the correct connection so the pool only returns
 * numbers provisioned on that connection.
 *
 * Returns null if no filtering should be applied (unknown engine or no config).
 */
async function resolveConnectionIdForEngine(engine?: 'texml' | 'sip'): Promise<string | null> {
  let activeEngine = engine;

  // Auto-detect from DB if not explicitly passed
  if (!activeEngine) {
    try {
      const { agentDefaults } = await import("@shared/schema");
      const [defaults] = await db.select({ defaultCallEngine: agentDefaults.defaultCallEngine }).from(agentDefaults).limit(1);
      activeEngine = (defaults?.defaultCallEngine as 'texml' | 'sip') || 'texml';
    } catch {
      activeEngine = 'texml';
    }
  }

  if (activeEngine === 'sip') {
    return process.env.TELNYX_SIP_CONNECTION_ID || process.env.TELNYX_CONNECTION_ID || null;
  }
  // TeXML: use the TeXML app ID (numbers are assigned to it on Telnyx)
  return process.env.TELNYX_TEXML_APP_ID || null;
}

/**
 * Get eligible number pool based on assignments.
 * Results are cached for POOL_CACHE_TTL_MS to avoid per-call DB round-trips.
 * The pool (active numbers + reputation + assignments) rarely changes mid-campaign.
 *
 * Connection-aware: filters numbers by telnyxConnectionId matching the active call engine
 * so SIP calls only pick SIP-provisioned numbers and TeXML calls only pick TeXML numbers.
 */
async function getEligiblePool(request: NumberSelectionRequest): Promise<EligibleNumber[]> {
  // Resolve connection ID for the active engine
  const connectionId = await resolveConnectionIdForEngine(request.callEngine);

  // Check cache — keyed on campaignId + agentId + connectionId since assignments differ
  const cacheKey = `${request.campaignId}|${request.virtualAgentId || ''}|${connectionId || ''}`;
  if (_poolCache && _poolCache.key === cacheKey && (Date.now() - _poolCache.cachedAt) < POOL_CACHE_TTL_MS) {
    return _poolCache.pool;
  }

  // Build WHERE conditions
  const whereConditions = [eq(telnyxNumbers.status, 'active')];

  // Filter by connection ID if resolved (connection-aware pool)
  if (connectionId) {
    whereConditions.push(eq(telnyxNumbers.telnyxConnectionId, connectionId));
    console.log(`[NumberRouter] Filtering pool by connection ${connectionId} (engine: ${request.callEngine || 'auto'})`);
  }

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
    .where(and(...whereConditions));

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

  const pool = Array.from(numberMap.values());
  // Cache for subsequent calls
  _poolCache = { key: cacheKey, pool, cachedAt: Date.now() };

  return pool;
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
    concurrent_in_use: 0,
  };
  
  const available: EligibleNumber[] = [];
  const now = new Date();

  for (const num of pool) {
    // Check exclusion list
    if (request.excludeNumberIds?.includes(num.id)) {
      filtered.excluded++;
      continue;
    }

    // === ALL LIMITS REMOVED per user request ===
    // Only two guards remain:
    //   1. No concurrent calls on the same number (1 call at a time)
    //   2. 30-second gap enforced via releaseNumber delay

    // Guard 1: Check concurrent calls (max 1 per DID)
    if (numbersInUse.has(num.id)) {
      filtered.concurrent_in_use++;
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
 * Calculate jitter delay — minimal since all per-number limits removed.
 * The 30-second gap between calls on the same number is enforced by releaseNumber().
 */
function calculateJitter(_number: EligibleNumber): number {
  // Simple random jitter between 500ms–1500ms. No reputation/warmup penalties.
  return JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS));
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
 * Mark number as in-use (concurrent call guard) with timestamp for stale detection
 */
function markNumberInUse(numberId: string): void {
  numbersInUse.set(numberId, Date.now());
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
  // Only increment daily/hourly counters for calls that actually connected.
  // Failed calls (invalid number, network error, etc.) should not count
  // against the number's daily/hourly limits.
  const shouldCountTowardsLimits = !outcome.failed;

  await db
    .update(telnyxNumbers)
    .set({
      lastCallAt: new Date(),
      ...(shouldCountTowardsLimits
        ? {
            callsToday: sql`calls_today + 1`,
            callsThisHour: sql`calls_this_hour + 1`,
          }
        : {}),
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

  console.log(`[NumberRouter] Recorded outcome for ${numberId}: ${outcome.disposition} (${outcome.durationSec}s)${outcome.failed ? ' [FAILED - not counted towards limits]' : ''}`);
}

// ==================== EXPORTS ====================

export default {
  selectNumber,
  releaseNumber,
  recordCallOutcome,
  isNumberPoolEnabled,
  getNumberPoolStatus,
  forceReleaseAllNumbers,
  releaseStaleNumbers,
  invalidatePoolCache,
};
