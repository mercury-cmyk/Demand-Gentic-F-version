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
export const COOLDOWN_TRIGGERS: CooldownTrigger[] = [
  {
    reason: 'repeated_failures',
    threshold: 20, // Relaxed: 20 consecutive failures (was 5)
    windowMinutes: 60,
    cooldownHours: 1, // Reduced from 4h to 1h
    description: '20+ consecutive call failures in 1 hour',
  },
  {
    reason: 'consecutive_short_calls',
    threshold: 30, // Relaxed: 30 hangups (was 10) — cold calling has high hangup rates
    windowMinutes: 60,
    cooldownHours: 1, // Reduced from 2h to 1h
    description: '30+ consecutive immediate hangups (<3s) in 1 hour',
  },
  {
    reason: 'zero_answer_rate',
    threshold: 50, // Relaxed: 50 calls with 0 answers (was 10)
    windowMinutes: 120,
    cooldownHours: 2, // Reduced from 6h to 2h
    description: '0% answer rate over 50+ calls in 2 hour window',
  },
  {
    reason: 'audio_quality_issues',
    threshold: 1,
    windowMinutes: 0, // Immediate
    cooldownHours: 4, // Reduced from 48h to 4h
    description: 'Audio quality issues detected',
  },
  {
    reason: 'carrier_block_suspected',
    threshold: 1,
    windowMinutes: 0, // Immediate — keep strict for carrier blocks
    cooldownHours: 24, // Reduced from 72h to 24h
    description: 'Carrier block detected (SIP 603, 607)',
  },
  // reputation_threshold DISABLED — cold calling naturally produces low scores
  // Reputation is tracked for monitoring but should not trigger automatic cooldowns
];

// ==================== MAIN FUNCTIONS ====================

/**
 * Check if a number should enter cooldown based on recent activity
 */
export async function checkCooldownTriggers(
  numberId: string
): Promise<CooldownCheckResult> {
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
): Promise<NumberCooldown> {
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
): Promise<NumberCooldown> {
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
): Promise<void> {
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
): Promise<CooldownStatus> {
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
export async function processExpiredCooldowns(): Promise<number> {
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
export async function getNumbersInCooldown(): Promise<CooldownStatus[]> {
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
): Promise<CooldownCheckResult> {
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
): Promise<CooldownCheckResult> {
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
): Promise<CooldownCheckResult> {
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
): Promise<CooldownCheckResult> {
  const cutoff = new Date(Date.now() - trigger.windowMinutes * 60000);

  const [result] = await db
    .select({
      totalCalls: count(),
      shortCalls: sql<number>`COUNT(CASE WHEN is_short_call = true THEN 1 END)`.as('short_calls'),
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
  if (total < 10) {
    return { shouldCooldown: false };
  }

  const shortCallPercent = (shortCalls / total) * 100;

  return {
    shouldCooldown: shortCallPercent >= trigger.threshold,
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
): Promise<CooldownCheckResult> {
  const cutoff = new Date(Date.now() - trigger.windowMinutes * 60000);

  const [result] = await db
    .select({
      totalCalls: count(),
      answeredCalls: sql<number>`COUNT(CASE WHEN answered = true THEN 1 END)`.as('answered_calls'),
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
  if (total < trigger.threshold) {
    return { shouldCooldown: false };
  }

  return {
    shouldCooldown: answered === 0,
    reason: trigger.reason,
    currentValue: 0, // 0% answer rate
    threshold: trigger.threshold,
    cooldownHours: trigger.cooldownHours,
  };
}

/**
 * Check if reputation dropped to burned
 */
async function checkReputationDrop(
  numberId: string,
  trigger: CooldownTrigger
): Promise<CooldownCheckResult> {
  const [rep] = await db
    .select()
    .from(numberReputation)
    .where(eq(numberReputation.numberId, numberId))
    .limit(1);

  if (!rep) {
    return { shouldCooldown: false };
  }

  return {
    shouldCooldown: (rep.score ?? 70) < trigger.threshold,
    reason: trigger.reason,
    currentValue: rep.score ?? 70,
    threshold: trigger.threshold,
    cooldownHours: trigger.cooldownHours,
  };
}

// ==================== EXTERNAL TRIGGERS ====================

/**
 * Handle spam complaint (call from webhook handler)
 */
export async function handleSpamComplaint(
  numberId: string,
  complaintDetails?: string
): Promise<NumberCooldown> {
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
): Promise<NumberCooldown> {
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
