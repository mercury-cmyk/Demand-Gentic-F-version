/**
 * Number Service
 * 
 * CRUD operations for Telnyx phone numbers:
 * - Sync numbers from Telnyx API
 * - Create/update/delete number records
 * - Manage number assignments to campaigns/agents
 * - Number pool administration
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md
 */

import { db } from "../../db";
import { eq, and, or, sql, desc, count, inArray, isNull } from "drizzle-orm";
import {
  telnyxNumbers,
  numberAssignments,
  numberReputation,
  numberCooldowns,
  numberMetricsDaily,
  numberPoolAlerts,
  type TelnyxNumber,
  type NumberAssignment,
  type NewTelnyxNumber,
  type NewNumberAssignment,
} from "@shared/number-pool-schema";

// ==================== TYPES ====================

export interface TelnyxApiNumber {
  id: string;
  phone_number: string;
  connection_id: string;
  connection_name: string;
  status: string;
  address_id?: string;
  messaging_profile_id?: string;
  billing_group_id?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  purchased_at?: string;
}

export interface NumberPoolSummary {
  totalNumbers: number;
  activeNumbers: number;
  pausedNumbers: number;
  cooldownNumbers: number;
  retiredNumbers: number;
  healthyNumbers: number;
  warningNumbers: number;
  riskNumbers: number;
  burnedNumbers: number;
  unassignedNumbers: number;
}

export interface NumberWithDetails extends TelnyxNumber {
  reputation: {
    score: number | null;
    band: string | null;
    avgDurationSec: string | null;
    totalCalls: number | null;
    answeredCalls: number | null;
  } | null;
  assignments: {
    scope: string;
    campaignId: string | null;
    virtualAgentId: string | null;
    region: string | null;
  }[];
  activeCooldown: {
    reason: string;
    endsAt: Date;
  } | null;
}

export interface CreateNumberInput {
  phoneNumberE164: string;
  telnyxNumberId?: string;
  telnyxConnectionId?: string;
  displayName?: string;
  region?: string;
  areaCode?: string;
  maxCallsPerHour?: number;
  maxCallsPerDay?: number;
  tags?: string[];
}

export interface UpdateNumberInput {
  displayName?: string;
  region?: string;
  status?: 'active' | 'cooling' | 'suspended' | 'retired';
  maxCallsPerHour?: number;
  maxCallsPerDay?: number;
  tags?: string[];
}

export interface CreateAssignmentInput {
  numberId: string;
  scope: 'global' | 'campaign' | 'agent' | 'region';
  campaignId?: string;
  virtualAgentId?: string;
  region?: string;
  priority?: number;
}

// ==================== TELNYX API SYNC ====================

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

/**
 * Sync numbers from Telnyx API
 */
export async function syncFromTelnyx(): Promise<{
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    throw new Error('TELNYX_API_KEY not configured');
  }

  const result = {
    added: 0,
    updated: 0,
    removed: 0,
    errors: [] as string[],
  };

  try {
    // Fetch all phone numbers from Telnyx
    const response = await fetch(`${TELNYX_API_BASE}/phone_numbers?page[size]=250`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Telnyx API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const telnyxNumbers_api: TelnyxApiNumber[] = data.data || [];

    // Get existing numbers from database
    const existingNumbers = await db
      .select()
      .from(telnyxNumbers);

    const existingMap = new Map(
      existingNumbers.map(n => [n.phoneNumberE164, n])
    );

    const telnyxNumberSet = new Set(
      telnyxNumbers_api.map(n => n.phone_number)
    );

    // Add/update numbers from Telnyx
    for (const telNum of telnyxNumbers_api) {
      try {
        const existing = existingMap.get(telNum.phone_number);

        if (existing) {
          // Update existing
          await db
            .update(telnyxNumbers)
            .set({
              telnyxNumberId: telNum.id,
              telnyxConnectionId: telNum.connection_id,
              updatedAt: new Date(),
            })
            .where(eq(telnyxNumbers.id, existing.id));

          result.updated++;
        } else {
          // Add new
          const areaCode = extractAreaCode(telNum.phone_number);

          await db.insert(telnyxNumbers).values({
            telnyxNumberId: telNum.id,
            phoneNumberE164: telNum.phone_number,
            telnyxConnectionId: telNum.connection_id,
            areaCode,
            status: 'active', // Default to active
          });

          // Initialize reputation record
          await initializeReputation(telNum.phone_number);

          result.added++;
        }
      } catch (error) {
        result.errors.push(`Failed to sync ${telNum.phone_number}: ${error}`);
      }
    }

    // Mark removed numbers (in DB but not in Telnyx)
    for (const [e164, existing] of existingMap) {
      if (!telnyxNumberSet.has(e164) && existing.status !== 'retired') {
        await db
          .update(telnyxNumbers)
          .set({
            status: 'retired',
            updatedAt: new Date(),
          })
          .where(eq(telnyxNumbers.id, existing.id));

        result.removed++;
      }
    }

    console.log(`[NumberService] Telnyx sync complete: +${result.added} /${result.updated} -${result.removed}`);

  } catch (error) {
    result.errors.push(`Sync failed: ${error}`);
    console.error('[NumberService] Telnyx sync error:', error);
  }

  return result;
}

// ==================== CRUD OPERATIONS ====================

/**
 * Get all numbers with optional filtering
 */
export async function getNumbers(options?: {
  status?: string;
  band?: string;
  hasAssignment?: boolean;
  limit?: number;
  offset?: number;
}): Promise<TelnyxNumber[]> {
  let query = db.select().from(telnyxNumbers).$dynamic();

  if (options?.status) {
    query = query.where(eq(telnyxNumbers.status, options.status as any));
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.offset(options.offset);
  }

  return query.orderBy(desc(telnyxNumbers.createdAt));
}

/**
 * Get a single number by ID
 */
export async function getNumberById(
  numberId: string
): Promise<NumberWithDetails | null> {
  const [number] = await db
    .select()
    .from(telnyxNumbers)
    .where(eq(telnyxNumbers.id, numberId))
    .limit(1);

  if (!number) {
    return null;
  }

  // Get reputation
  const [reputation] = await db
    .select({
      score: numberReputation.score,
      band: numberReputation.band,
      avgDurationSec: numberReputation.avgDurationSec,
      totalCalls: numberReputation.totalCalls,
      answeredCalls: numberReputation.answeredCalls,
    })
    .from(numberReputation)
    .where(eq(numberReputation.numberId, numberId))
    .limit(1);

  // Get assignments
  const assignments = await db
    .select({
      scope: numberAssignments.scope,
      campaignId: numberAssignments.campaignId,
      virtualAgentId: numberAssignments.virtualAgentId,
      region: numberAssignments.region,
    })
    .from(numberAssignments)
    .where(
      and(
        eq(numberAssignments.numberId, numberId),
        eq(numberAssignments.isActive, true)
      )
    );

  // Get active cooldown
  const [cooldown] = await db
    .select({
      reason: numberCooldowns.reason,
      endsAt: numberCooldowns.endsAt,
    })
    .from(numberCooldowns)
    .where(
      and(
        eq(numberCooldowns.numberId, numberId),
        eq(numberCooldowns.isActive, true)
      )
    )
    .limit(1);

  return {
    ...number,
    reputation: reputation || null,
    assignments,
    activeCooldown: cooldown || null,
  };
}

/**
 * Get a number by E.164 phone number
 */
export async function getNumberByE164(
  e164: string
): Promise<TelnyxNumber | null> {
  const [number] = await db
    .select()
    .from(telnyxNumbers)
    .where(eq(telnyxNumbers.phoneNumberE164, e164))
    .limit(1);

  return number || null;
}

/**
 * Create a new number (manual entry, not synced from Telnyx)
 */
export async function createNumber(
  input: CreateNumberInput
): Promise<TelnyxNumber> {
  const areaCode = input.areaCode || extractAreaCode(input.phoneNumberE164);

  const [number] = await db
    .insert(telnyxNumbers)
    .values({
      telnyxNumberId: input.telnyxNumberId,
      phoneNumberE164: input.phoneNumberE164,
      telnyxConnectionId: input.telnyxConnectionId,
      displayName: input.displayName,
      region: input.region,
      areaCode,
      maxCallsPerHour: input.maxCallsPerHour ?? 20,
      maxCallsPerDay: input.maxCallsPerDay ?? 100,
      tags: input.tags,
      status: 'active',
    })
    .returning();

  // Initialize reputation
  await initializeReputation(input.phoneNumberE164);

  console.log(`[NumberService] Created number: ${input.phoneNumberE164}`);

  return number;
}

/**
 * Update a number
 */
export async function updateNumber(
  numberId: string,
  input: UpdateNumberInput
): Promise<TelnyxNumber> {
  const [updated] = await db
    .update(telnyxNumbers)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(telnyxNumbers.id, numberId))
    .returning();

  if (!updated) {
    throw new Error(`Number ${numberId} not found`);
  }

  console.log(`[NumberService] Updated number: ${numberId}`);

  return updated;
}

/**
 * Delete (retire) a number
 */
export async function deleteNumber(numberId: string): Promise<void> {
  // Soft delete - mark as retired
  await db
    .update(telnyxNumbers)
    .set({
      status: 'retired',
      updatedAt: new Date(),
    })
    .where(eq(telnyxNumbers.id, numberId));

  // Deactivate all assignments
  await db
    .update(numberAssignments)
    .set({
      isActive: false,
    })
    .where(eq(numberAssignments.numberId, numberId));

  console.log(`[NumberService] Retired number: ${numberId}`);
}

// ==================== ASSIGNMENT OPERATIONS ====================

/**
 * Create a number assignment
 */
export async function createAssignment(
  input: CreateAssignmentInput
): Promise<NumberAssignment> {
  // Validate scope-specific fields
  if (input.scope === 'campaign' && !input.campaignId) {
    throw new Error('campaignId required for campaign scope');
  }
  if (input.scope === 'agent' && !input.virtualAgentId) {
    throw new Error('virtualAgentId required for agent scope');
  }
  if (input.scope === 'region' && !input.region) {
    throw new Error('region required for region scope');
  }

  const [assignment] = await db
    .insert(numberAssignments)
    .values({
      numberId: input.numberId,
      scope: input.scope,
      campaignId: input.campaignId,
      virtualAgentId: input.virtualAgentId,
      region: input.region,
      priority: input.priority ?? 0,
      isActive: true,
    })
    .returning();

  console.log(`[NumberService] Created assignment: ${input.numberId} → ${input.scope}`);

  return assignment;
}

/**
 * Get assignments for a number
 */
export async function getAssignments(
  numberId: string
): Promise<NumberAssignment[]> {
  return db
    .select()
    .from(numberAssignments)
    .where(eq(numberAssignments.numberId, numberId))
    .orderBy(desc(numberAssignments.priority));
}

/**
 * Get numbers assigned to a campaign
 */
export async function getNumbersForCampaign(
  campaignId: string
): Promise<TelnyxNumber[]> {
  const assignments = await db
    .select({ numberId: numberAssignments.numberId })
    .from(numberAssignments)
    .where(
      and(
        eq(numberAssignments.campaignId, campaignId),
        eq(numberAssignments.isActive, true)
      )
    );

  if (assignments.length === 0) {
    return [];
  }

  const numberIds = assignments.map(a => a.numberId);

  return db
    .select()
    .from(telnyxNumbers)
    .where(inArray(telnyxNumbers.id, numberIds));
}

/**
 * Update an assignment
 */
export async function updateAssignment(
  assignmentId: string,
  updates: Partial<Pick<NumberAssignment, 'priority' | 'isActive'>>
): Promise<NumberAssignment> {
  const [updated] = await db
    .update(numberAssignments)
    .set({
      ...updates,
    })
    .where(eq(numberAssignments.id, assignmentId))
    .returning();

  if (!updated) {
    throw new Error(`Assignment ${assignmentId} not found`);
  }

  return updated;
}

/**
 * Delete an assignment
 */
export async function deleteAssignment(assignmentId: string): Promise<void> {
  await db
    .delete(numberAssignments)
    .where(eq(numberAssignments.id, assignmentId));
}

// ==================== POOL SUMMARY ====================

/**
 * Get summary statistics for the number pool
 */
export async function getPoolSummary(): Promise<NumberPoolSummary> {
  // Get status counts
  const statusCounts = await db
    .select({
      status: telnyxNumbers.status,
      count: count(),
    })
    .from(telnyxNumbers)
    .groupBy(telnyxNumbers.status);

  const statusMap = Object.fromEntries(
    statusCounts.map(s => [s.status, Number(s.count)])
  );

  // Get reputation band counts
  const bandCounts = await db
    .select({
      band: numberReputation.band,
      count: count(),
    })
    .from(numberReputation)
    .innerJoin(telnyxNumbers, eq(numberReputation.numberId, telnyxNumbers.id))
    .where(eq(telnyxNumbers.status, 'active'))
    .groupBy(numberReputation.band);

  const bandMap = Object.fromEntries(
    bandCounts.map(b => [b.band, Number(b.count)])
  );

  // Count unassigned numbers
  const [unassigned] = await db
    .select({ count: count() })
    .from(telnyxNumbers)
    .leftJoin(
      numberAssignments,
      and(
        eq(numberAssignments.numberId, telnyxNumbers.id),
        eq(numberAssignments.isActive, true)
      )
    )
    .where(
      and(
        eq(telnyxNumbers.status, 'active'),
        isNull(numberAssignments.id)
      )
    );

  const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

  return {
    totalNumbers: total,
    activeNumbers: statusMap['active'] || 0,
    pausedNumbers: statusMap['paused'] || 0,
    cooldownNumbers: statusMap['cooldown'] || 0,
    retiredNumbers: statusMap['retired'] || 0,
    healthyNumbers: bandMap['healthy'] || 0,
    warningNumbers: bandMap['warning'] || 0,
    riskNumbers: bandMap['risk'] || 0,
    burnedNumbers: bandMap['burned'] || 0,
    unassignedNumbers: Number(unassigned?.count) || 0,
  };
}

// ==================== COUNTER MANAGEMENT ====================

/**
 * Reset hourly call counters (run on the hour)
 */
export async function resetHourlyCounters(): Promise<number> {
  const result = await db
    .update(telnyxNumbers)
    .set({
      callsThisHour: 0,
      updatedAt: new Date(),
    })
    .where(sql`calls_this_hour > 0`);

  const count = result.rowCount || 0;
  console.log(`[NumberService] Reset hourly counters for ${count} numbers`);

  return count;
}

/**
 * Reset daily call counters (run at midnight)
 */
export async function resetDailyCounters(): Promise<number> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  // Archive daily metrics before reset
  const numbersWithCalls = await db
    .select()
    .from(telnyxNumbers)
    .where(sql`calls_today > 0`);

  for (const num of numbersWithCalls) {
    const metricDateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD format
    await db.insert(numberMetricsDaily).values({
      numberId: num.id,
      metricDate: metricDateStr,
      totalCalls: num.callsToday ?? 0,
      answeredCalls: 0, // Would need to track this separately
      avgDurationSec: '0',
      shortCalls: 0,
      immediateHangups: 0,
      voicemailCalls: 0,
      failedCalls: 0,
    }).onConflictDoNothing();
  }

  // Reset counters
  const result = await db
    .update(telnyxNumbers)
    .set({
      callsToday: 0,
      updatedAt: new Date(),
    })
    .where(sql`calls_today > 0`);

  const count = result.rowCount || 0;
  console.log(`[NumberService] Reset daily counters for ${count} numbers`);

  return count;
}

// ==================== INTERNAL HELPERS ====================

/**
 * Extract area code from E.164 phone number
 */
function extractAreaCode(phoneNumber: string): string | undefined {
  const digits = phoneNumber.replace(/\D/g, '');
  
  if (digits.startsWith('1') && digits.length >= 4) {
    return digits.substring(1, 4);
  }
  
  if (digits.length >= 3) {
    return digits.substring(0, 3);
  }

  return undefined;
}

/**
 * Initialize reputation record for a new number
 */
async function initializeReputation(phoneNumberE164: string): Promise<void> {
  const [number] = await db
    .select({ id: telnyxNumbers.id })
    .from(telnyxNumbers)
    .where(eq(telnyxNumbers.phoneNumberE164, phoneNumberE164))
    .limit(1);

  if (!number) return;

  await db
    .insert(numberReputation)
    .values({
      numberId: number.id,
      score: 70, // Start with healthy score
      band: 'healthy',
      totalCalls: 0,
      answeredCalls: 0,
      avgDurationSec: '0',
      shortCalls: 0,
      immediateHangups: 0,
      voicemailCalls: 0,
      failedCalls: 0,
      lastCalculatedAt: new Date(),
    })
    .onConflictDoNothing();
}

// ==================== EXPORTS ====================

export default {
  syncFromTelnyx,
  getNumbers,
  getNumberById,
  getNumberByE164,
  createNumber,
  updateNumber,
  deleteNumber,
  createAssignment,
  getAssignments,
  getNumbersForCampaign,
  updateAssignment,
  deleteAssignment,
  getPoolSummary,
  resetHourlyCounters,
  resetDailyCounters,
};
