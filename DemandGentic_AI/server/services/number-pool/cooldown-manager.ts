/**
 * Cooldown Manager
 * 
 * Monitors call patterns and triggers automatic cooldowns when numbers
 * exceed risk thresholds:
 * - Consecutive failures
 * - Consecutive hangups
 * - High short-call rates
 * - Spam complaints
 * - Carrier blocks
 * - Manual review triggers
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md Section 7: Cooldown Triggers
 */

import { db } from "../../db";
import { eq, and, gt, lt, desc, sql, count } from "drizzle-orm";
import {
  telnyxNumbers,
  numberReputation,
  numberCooldowns,
  numberMetricsWindow,
  numberPoolAlerts,
  type TelnyxNumber,
  type NumberCooldown,
  type CooldownReason,
} from "@shared/number-pool-schema";

// Re-export CooldownReason for consumers
export type { CooldownReason };

export interface CooldownTrigger {
  reason: CooldownReason;
  threshold: number;
  windowMinutes: number;
  cooldownHours: number;
  description: string;
}

export interface CooldownCheckResult {
  shouldCooldown: boolean;
  reason?: CooldownReason;
  currentValue?: number;
  threshold?: number;
  cooldownHours?: number;
}

export interface CooldownStatus {
  numberId: string;
  isInCooldown: boolean;
  activeCooldown: NumberCooldown | null;
  endsAt: Date | null;
  remainingMinutes: number | null;
  reason: string | null;
}

// ==================== CONSTANTS ====================

/**
 * Cooldown trigger configuration
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md Section 7
 */
// ALL COOLDOWN TRIGGERS DISABLED per user request.
// Numbers should dial consistently with only a 30s gap between calls.
// The only restriction is 1 concurrent call per number + 30s release delay.
export const COOLDOWN_TRIGGERS: CooldownTrigger[] = [];

// ==================== MAIN FUNCTIONS ====================

/**
 * Check if a number should enter cooldown based on recent activity
 */
export async function checkCooldownTriggers(
  numberId: string
): Promise {
  // Check each trigger
  for (const trigger of COOLDOWN_TRIGGERS) {
    const result = await checkTrigger(numberId, trigger);
    if (result.shouldCooldown) {
      return result;
    }
  }

  return { shouldCooldown: false };
}

/**
 * Trigger a cooldown for a number
 */
export async function triggerCooldown(
  numberId: string,
  reason: CooldownReason,
  hours?: number
): Promise {
  const trigger = COOLDOWN_TRIGGERS.find(t => t.reason === reason);
  const cooldownHours = hours ?? trigger?.cooldownHours ?? 4;

  const now = new Date();
  const endsAt = new Date(now.getTime() + cooldownHours * 3600000);

  // Deactivate any existing cooldowns
  await db
    .update(numberCooldowns)
    .set({ isActive: false })
    .where(
      and(
        eq(numberCooldowns.numberId, numberId),
        eq(numberCooldowns.isActive, true)
      )
    );

  // Create new cooldown
  const [cooldown] = await db
    .insert(numberCooldowns)
    .values({
      numberId,
      reason,
      startedAt: now,
      endsAt,
      isActive: true,
    })
    .returning();

  // Update number status
  await db
    .update(telnyxNumbers)
    .set({
      status: 'cooling',
      updatedAt: now,
    })
    .where(eq(telnyxNumbers.id, numberId));

  // Create alert
  await db.insert(numberPoolAlerts).values({
    numberId,
    alertType: 'cooldown_triggered',
    severity: 'warning',
    title: `Cooldown triggered: ${reason}`,
    description: `Ends at ${endsAt.toISOString()}`,
    isAcknowledged: false,
  });

  console.log(`[CooldownManager] Triggered ${cooldownHours}h cooldown for ${numberId}: ${reason}`);

  return cooldown;
}

/**
 * Manually trigger a cooldown
 */
export async function triggerManualCooldown(
  numberId: string,
  hours: number,
  notes?: string
): Promise {
  const cooldown = await triggerCooldown(numberId, 'manual_admin', hours);

  if (notes) {
    await db
      .update(numberCooldowns)
      .set({ reasonDetails: { notes } })
      .where(eq(numberCooldowns.id, cooldown.id));
  }

  return cooldown;
}

/**
 * End a cooldown early
 */
export async function endCooldown(
  cooldownId: string
): Promise {
  const now = new Date();

  // Get the cooldown to find the number
  const [cooldown] = await db
    .select()
    .from(numberCooldowns)
    .where(eq(numberCooldowns.id, cooldownId))
    .limit(1);

  if (!cooldown) {
    throw new Error(`Cooldown ${cooldownId} not found`);
  }

  // Deactivate cooldown
  await db
    .update(numberCooldowns)
    .set({
      isActive: false,
      endedEarlyAt: now,
    })
    .where(eq(numberCooldowns.id, cooldownId));

  // Reactivate number
  await db
    .update(telnyxNumbers)
    .set({
      status: 'active',
      updatedAt: now,
    })
    .where(eq(telnyxNumbers.id, cooldown.numberId));

  console.log(`[CooldownManager] Ended cooldown ${cooldownId} for ${cooldown.numberId}`);
}

/**
 * Get cooldown status for a number
 */
export async function getCooldownStatus(
  numberId: string
): Promise {
  const now = new Date();

  const [activeCooldown] = await db
    .select()
    .from(numberCooldowns)
    .where(
      and(
        eq(numberCooldowns.numberId, numberId),
        eq(numberCooldowns.isActive, true),
        gt(numberCooldowns.endsAt, now)
      )
    )
    .orderBy(desc(numberCooldowns.endsAt))
    .limit(1);

  if (!activeCooldown) {
    return {
      numberId,
      isInCooldown: false,
      activeCooldown: null,
      endsAt: null,
      remainingMinutes: null,
      reason: null,
    };
  }

  const remainingMs = activeCooldown.endsAt.getTime() - now.getTime();
  const remainingMinutes = Math.ceil(remainingMs / 60000);

  return {
    numberId,
    isInCooldown: true,
    activeCooldown,
    endsAt: activeCooldown.endsAt,
    remainingMinutes,
    reason: activeCooldown.reason,
  };
}

/**
 * Process expired cooldowns (run periodically)
 */
export async function processExpiredCooldowns(): Promise {
  const now = new Date();

  let expired: NumberCooldown[] = [];
  try {
    // Find expired cooldowns that are still marked active
    expired = await db
      .select()
      .from(numberCooldowns)
      .where(
        and(
          eq(numberCooldowns.isActive, true),
          lt(numberCooldowns.endsAt, now)
        )
      );
  } catch (error: any) {
    if (error?.code === '42P01') {
      console.warn('[CooldownManager] number_cooldowns table is missing. Run DB migrations for number pool features.');
      return 0;
    }
    throw error;
  }

  let processed = 0;

  for (const cooldown of expired) {
    // Deactivate cooldown
    await db
      .update(numberCooldowns)
      .set({
        isActive: false,
      })
      .where(eq(numberCooldowns.id, cooldown.id));

    // Check reputation before reactivating
    const [rep] = await db
      .select()
      .from(numberReputation)
      .where(eq(numberReputation.numberId, cooldown.numberId))
      .limit(1);

    if (!rep || rep.band === 'burned') {
      // Keep number paused if still burned
      await db
        .update(telnyxNumbers)
        .set({
          status: 'suspended',
          updatedAt: now,
        })
        .where(eq(telnyxNumbers.id, cooldown.numberId));

      console.log(`[CooldownManager] Cooldown expired but number ${cooldown.numberId} still burned - paused`);
    } else {
      // Reactivate number
      await db
        .update(telnyxNumbers)
        .set({
          status: 'active',
          updatedAt: now,
        })
        .where(eq(telnyxNumbers.id, cooldown.numberId));

      console.log(`[CooldownManager] Cooldown expired for ${cooldown.numberId} - reactivated`);
    }

    processed++;
  }

  if (processed > 0) {
    console.log(`[CooldownManager] Processed ${processed} expired cooldowns`);
  }

  return processed;
}

/**
 * Get all numbers currently in cooldown
 */
export async function getNumbersInCooldown(): Promise {
  const now = new Date();

  const activeCooldowns = await db
    .select({
      cooldown: numberCooldowns,
      number: telnyxNumbers,
    })
    .from(numberCooldowns)
    .innerJoin(telnyxNumbers, eq(numberCooldowns.numberId, telnyxNumbers.id))
    .where(
      and(
        eq(numberCooldowns.isActive, true),
        gt(numberCooldowns.endsAt, now)
      )
    )
    .orderBy(desc(numberCooldowns.endsAt));

  return activeCooldowns.map(({ cooldown }) => {
    const remainingMs = cooldown.endsAt.getTime() - now.getTime();
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    return {
      numberId: cooldown.numberId,
      isInCooldown: true,
      activeCooldown: cooldown,
      endsAt: cooldown.endsAt,
      remainingMinutes,
      reason: cooldown.reason,
    };
  });
}

// ==================== INTERNAL FUNCTIONS ====================

/**
 * Check a single cooldown trigger
 */
async function checkTrigger(
  numberId: string,
  trigger: CooldownTrigger
): Promise {
  switch (trigger.reason) {
    case 'repeated_failures':
      return checkConsecutiveFailures(numberId, trigger);
    
    case 'consecutive_short_calls':
      return checkConsecutiveHangups(numberId, trigger);
    
    case 'zero_answer_rate':
      return checkZeroAnswerRate(numberId, trigger);
    
    case 'reputation_threshold':
      return checkReputationDrop(numberId, trigger);
    
    // audio_quality_issues and carrier_block_suspected are triggered externally
    default:
      return { shouldCooldown: false };
  }
}

/**
 * Check for consecutive call failures
 */
async function checkConsecutiveFailures(
  numberId: string,
  trigger: CooldownTrigger
): Promise {
  const cutoff = new Date(Date.now() - trigger.windowMinutes * 60000);

  // Get last N calls
  const recentCalls = await db
    .select()
    .from(numberMetricsWindow)
    .where(
      and(
        eq(numberMetricsWindow.numberId, numberId),
        gt(numberMetricsWindow.calledAt, cutoff)
      )
    )
    .orderBy(desc(numberMetricsWindow.calledAt))
    .limit(trigger.threshold + 5);

  // Count consecutive failures from most recent
  let consecutiveFailures = 0;
  for (const call of recentCalls) {
    if (call.isFailed) {
      consecutiveFailures++;
    } else {
      break; // Stop counting on first non-failure
    }
  }

  return {
    shouldCooldown: consecutiveFailures >= trigger.threshold,
    reason: trigger.reason,
    currentValue: consecutiveFailures,
    threshold: trigger.threshold,
    cooldownHours: trigger.cooldownHours,
  };
}

/**
 * Check for consecutive immediate hangups
 */
async function checkConsecutiveHangups(
  numberId: string,
  trigger: CooldownTrigger
): Promise {
  const cutoff = new Date(Date.now() - trigger.windowMinutes * 60000);

  const recentCalls = await db
    .select()
    .from(numberMetricsWindow)
    .where(
      and(
        eq(numberMetricsWindow.numberId, numberId),
        gt(numberMetricsWindow.calledAt, cutoff),
        eq(numberMetricsWindow.answered, true) // Only answered calls
      )
    )
    .orderBy(desc(numberMetricsWindow.calledAt))
    .limit(trigger.threshold + 5);

  let consecutiveHangups = 0;
  for (const call of recentCalls) {
    if (call.isImmediateHangup) {
      consecutiveHangups++;
    } else {
      break;
    }
  }

  return {
    shouldCooldown: consecutiveHangups >= trigger.threshold,
    reason: trigger.reason,
    currentValue: consecutiveHangups,
    threshold: trigger.threshold,
    cooldownHours: trigger.cooldownHours,
  };
}

/**
 * Check for short call spike
 */
async function checkShortCallSpike(
  numberId: string,
  trigger: CooldownTrigger
): Promise {
  const cutoff = new Date(Date.now() - trigger.windowMinutes * 60000);

  const [result] = await db
    .select({
      totalCalls: count(),
      shortCalls: sql`COUNT(CASE WHEN is_short_call = true THEN 1 END)`.as('short_calls'),
    })
    .from(numberMetricsWindow)
    .where(
      and(
        eq(numberMetricsWindow.numberId, numberId),
        gt(numberMetricsWindow.calledAt, cutoff),
        eq(numberMetricsWindow.answered, true)
      )
    );

  const total = Number(result.totalCalls) || 0;
  const shortCalls = Number(result.shortCalls) || 0;
  
  // Need at least 10 calls to trigger
  if (total = trigger.threshold,
    reason: trigger.reason,
    currentValue: Math.round(shortCallPercent),
    threshold: trigger.threshold,
    cooldownHours: trigger.cooldownHours,
  };
}

/**
 * Check for zero answer rate
 */
async function checkZeroAnswerRate(
  numberId: string,
  trigger: CooldownTrigger
): Promise {
  const cutoff = new Date(Date.now() - trigger.windowMinutes * 60000);

  const [result] = await db
    .select({
      totalCalls: count(),
      answeredCalls: sql`COUNT(CASE WHEN answered = true THEN 1 END)`.as('answered_calls'),
    })
    .from(numberMetricsWindow)
    .where(
      and(
        eq(numberMetricsWindow.numberId, numberId),
        gt(numberMetricsWindow.calledAt, cutoff)
      )
    );

  const total = Number(result.totalCalls) || 0;
  const answered = Number(result.answeredCalls) || 0;
  
  // Need at least threshold calls with 0 answers
  if (total  {
  const [rep] = await db
    .select()
    .from(numberReputation)
    .where(eq(numberReputation.numberId, numberId))
    .limit(1);

  if (!rep) {
    return { shouldCooldown: false };
  }

  return {
    shouldCooldown: (rep.score ?? 70)  {
  console.log(`[CooldownManager] Spam complaint received for ${numberId}`);
  
  // Use audio_quality_issues as closest match for spam complaints since spam_complaint is not in enum
  const cooldown = await triggerCooldown(numberId, 'audio_quality_issues');

  // Create critical alert
  await db.insert(numberPoolAlerts).values({
    numberId,
    alertType: 'spam_complaint',
    severity: 'critical',
    title: 'Spam complaint received',
    description: complaintDetails || 'No details provided.',
    isAcknowledged: false,
  });

  return cooldown;
}

/**
 * Handle carrier block (call from call result handler)
 */
export async function handleCarrierBlock(
  numberId: string,
  sipCode: number,
  sipReason?: string
): Promise {
  console.log(`[CooldownManager] Carrier block detected for ${numberId}: SIP ${sipCode}`);
  
  const cooldown = await triggerCooldown(numberId, 'carrier_block_suspected');

  // Create critical alert
  await db.insert(numberPoolAlerts).values({
    numberId,
    alertType: 'carrier_block',
    severity: 'critical',
    title: `Carrier block detected (SIP ${sipCode})`,
    description: sipReason || 'Unknown carrier rejection',
    isAcknowledged: false,
  });

  return cooldown;
}

// ==================== EXPORTS ====================

export default {
  checkCooldownTriggers,
  triggerCooldown,
  triggerManualCooldown,
  endCooldown,
  getCooldownStatus,
  processExpiredCooldowns,
  getNumbersInCooldown,
  handleSpamComplaint,
  handleCarrierBlock,
  COOLDOWN_TRIGGERS,
};