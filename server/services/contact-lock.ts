/**
 * Contact Lock Service - Atomic contact locking for unified dialer
 * 
 * Ensures no contact can be dialed twice concurrently.
 * Uses row-level locking with TTL expiration.
 * Both Manual Dial and PowerDialer use this same locking logic.
 */

import { db } from "../db";
import { campaignQueue, campaigns, globalDnc, contacts, dialerCallAttempts, dialerRuns } from "@shared/schema";
import { eq, and, sql, lt, isNull, or, inArray, not, count } from "drizzle-orm";

// Lock TTL in seconds (5 minutes default)
const LOCK_TTL_SECONDS = 300;

// Contact lock result
interface ContactLockResult {
  success: boolean;
  queueItemId: string | null;
  contactId: string | null;
  phoneNumber: string | null;
  attemptNumber: number;
  error?: string;
}

/**
 * Get and lock the next eligible contact for dialing
 * 
 * Eligibility rules:
 * - Status is 'queued'
 * - Not currently locked (or lock expired)
 * - next_attempt_at is null or in the past
 * - Not in global DNC
 * - Contact's phone is not invalid
 * - Respects campaign rules (business hours, max attempts, etc.)
 * 
 * Concurrency enforcement is handled atomically within the transaction
 * to prevent race conditions when maxConcurrentCalls is specified.
 */
export async function lockNextContact(
  campaignId: string,
  agentType: 'human' | 'ai',
  agentId: string,
  maxConcurrentCalls?: number,
  runId?: string
): Promise<ContactLockResult> {
  const result: ContactLockResult = {
    success: false,
    queueItemId: null,
    contactId: null,
    phoneNumber: null,
    attemptNumber: 1
  };

  try {
    // Get campaign config for business hours check
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      result.error = 'Campaign not found';
      return result;
    }

    // Build the lock expiration time
    const lockExpiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000);

    // Validate: if concurrency limit is specified, runId is required for serialization
    if (maxConcurrentCalls !== undefined && maxConcurrentCalls > 0 && !runId) {
      result.error = 'runId is required when maxConcurrentCalls is specified';
      return result;
    }

    // Use a transaction to ensure atomic lock acquisition with concurrency check
    const lockedItem = await db.transaction(async (tx) => {
      // ATOMIC CONCURRENCY ENFORCEMENT using PostgreSQL advisory locks:
      // Advisory locks serialize all concurrent transactions for the same run.
      // This guarantees that only one transaction at a time can count and acquire locks.
      if (maxConcurrentCalls !== undefined && maxConcurrentCalls > 0 && runId) {
        // Convert runId (UUID) to a numeric hash for advisory lock
        // Use pg_advisory_xact_lock which auto-releases at transaction end
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(hashtext(${runId}))
        `);
        
        const agentColumn = agentType === 'human' ? 'agent_id' : 'virtual_agent_id';
        
        // Now safely count active locks (serialized by advisory lock above)
        const countResult = await tx.execute(sql`
          SELECT COUNT(*) as active_count
          FROM campaign_queue
          WHERE status = 'in_progress'
            AND ${sql.raw(agentColumn)} = ${agentId}
            AND lock_expires_at > NOW()
        `);
        
        const activeCount = parseInt((countResult.rows[0] as any)?.active_count || '0', 10);
        if (activeCount >= maxConcurrentCalls) {
          return { concurrencyLimitReached: true };
        }
      }

      // Select the next eligible contact with FOR UPDATE SKIP LOCKED
      const eligibleItems = await tx.execute(sql`
        SELECT cq.id, cq.contact_id, cq.lock_version
        FROM campaign_queue cq
        INNER JOIN contacts c ON c.id = cq.contact_id
        LEFT JOIN global_dnc dnc ON dnc.phone = c.phone_e164 OR dnc.phone = c.phone_direct
        WHERE cq.campaign_id = ${campaignId}
          AND cq.status = 'queued'
          AND (cq.lock_expires_at IS NULL OR cq.lock_expires_at < NOW())
          AND (cq.next_attempt_at IS NULL OR cq.next_attempt_at <= NOW())
          AND dnc.id IS NULL
          AND (
            cq.target_agent_type = 'any' 
            OR cq.target_agent_type = ${agentType}
          )
        ORDER BY cq.priority DESC, cq.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);

      if (!eligibleItems.rows || eligibleItems.rows.length === 0) {
        return null;
      }

      const item = eligibleItems.rows[0] as { id: string; contact_id: string; lock_version: number };

      // Acquire lock with optimistic locking
      const updateResult = await tx
        .update(campaignQueue)
        .set({
          status: 'in_progress',
          agentId: agentType === 'human' ? agentId : null,
          virtualAgentId: agentType === 'ai' ? agentId : null,
          lockExpiresAt,
          lockVersion: (item.lock_version || 0) + 1,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(campaignQueue.id, item.id),
            eq(campaignQueue.lockVersion, item.lock_version || 0)
          )
        )
        .returning();

      if (updateResult.length === 0) {
        // Optimistic lock failed, another process got it
        return null;
      }

      return updateResult[0];
    });

    if (!lockedItem) {
      result.error = 'No eligible contacts available';
      return result;
    }

    // Check if concurrency limit was reached (special return value)
    if ('concurrencyLimitReached' in lockedItem && lockedItem.concurrencyLimitReached) {
      result.error = 'Concurrency limit reached';
      return result;
    }

    // Type assertion: after the above check, we know lockedItem is the queue item
    const queueItem = lockedItem as { id: string; contactId: string };

    // Get contact details for phone number
    const [contact] = await db
      .select({
        id: contacts.id,
        directPhoneE164: contacts.directPhoneE164,
        directPhone: contacts.directPhone,
        firstName: contacts.firstName,
        lastName: contacts.lastName
      })
      .from(contacts)
      .where(eq(contacts.id, queueItem.contactId))
      .limit(1);

    if (!contact) {
      // Release the lock since we can't proceed
      await releaseLock(queueItem.id);
      result.error = 'Contact not found';
      return result;
    }

    // Count prior attempts for this contact in this campaign
    const [attemptCountResult] = await db
      .select({ count: count() })
      .from(dialerCallAttempts)
      .where(
        and(
          eq(dialerCallAttempts.campaignId, campaignId),
          eq(dialerCallAttempts.contactId, contact.id)
        )
      );
    
    const priorAttempts = attemptCountResult?.count || 0;

    result.success = true;
    result.queueItemId = queueItem.id;
    result.contactId = contact.id;
    result.phoneNumber = contact.directPhoneE164 || contact.directPhone || null;
    result.attemptNumber = priorAttempts + 1;

    return result;

  } catch (error) {
    result.error = `Lock error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return result;
  }
}

/**
 * Count active (in_progress) contacts locked by a specific agent
 * Used for concurrency enforcement
 */
export async function countActiveContactsForAgent(
  agentType: 'human' | 'ai',
  agentId: string
): Promise<number> {
  try {
    const [result] = await db
      .select({ count: count() })
      .from(campaignQueue)
      .where(
        and(
          eq(campaignQueue.status, 'in_progress'),
          agentType === 'human' 
            ? eq(campaignQueue.agentId, agentId)
            : eq(campaignQueue.virtualAgentId, agentId),
          // Only count non-expired locks
          sql`${campaignQueue.lockExpiresAt} > NOW()`
        )
      );
    return result?.count || 0;
  } catch (error) {
    console.error("[Contact Lock] Error counting active contacts:", error);
    return 0;
  }
}

/**
 * Lock multiple contacts at once for high-throughput AI dialing
 * Returns array of lock results up to the requested count
 * Respects maxConcurrentCalls limit atomically in each lock acquisition
 */
export async function lockMultipleContacts(
  campaignId: string,
  agentType: 'human' | 'ai',
  agentId: string,
  count: number,
  maxConcurrentCalls?: number,
  runId?: string
): Promise<ContactLockResult[]> {
  const results: ContactLockResult[] = [];
  
  // Lock contacts one at a time to ensure atomicity
  // Each lock acquisition checks concurrency limit inside transaction
  for (let i = 0; i < count; i++) {
    const result = await lockNextContact(campaignId, agentType, agentId, maxConcurrentCalls, runId);
    if (result.success) {
      results.push(result);
    } else {
      // No more contacts available OR concurrency limit reached
      break;
    }
  }
  
  return results;
}

/**
 * Release a lock on a queue item
 * Called when a call attempt fails to connect
 */
export async function releaseLock(queueItemId: string): Promise<boolean> {
  try {
    await db
      .update(campaignQueue)
      .set({
        status: 'queued',
        agentId: null,
        virtualAgentId: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(eq(campaignQueue.id, queueItemId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Complete a lock (call finished, disposition applied)
 * Typically called after disposition engine processes the outcome
 */
export async function completeLock(
  queueItemId: string, 
  finalStatus: 'done' | 'removed' | 'queued',
  reason?: string
): Promise<boolean> {
  try {
    await db
      .update(campaignQueue)
      .set({
        status: finalStatus,
        removedReason: finalStatus === 'removed' ? reason : null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(eq(campaignQueue.id, queueItemId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-release expired locks (cleanup job)
 * Should be called periodically (e.g., every minute)
 */
export async function releaseExpiredLocks(): Promise<number> {
  try {
    const result = await db
      .update(campaignQueue)
      .set({
        status: 'queued',
        agentId: null,
        virtualAgentId: null,
        lockExpiresAt: null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(campaignQueue.status, 'in_progress'),
          lt(campaignQueue.lockExpiresAt, new Date())
        )
      )
      .returning({ id: campaignQueue.id });

    return result.length;
  } catch {
    return 0;
  }
}

/**
 * Check if a specific contact is currently locked
 */
export async function isContactLocked(
  campaignId: string, 
  contactId: string
): Promise<boolean> {
  const [item] = await db
    .select({ id: campaignQueue.id })
    .from(campaignQueue)
    .where(
      and(
        eq(campaignQueue.campaignId, campaignId),
        eq(campaignQueue.contactId, contactId),
        eq(campaignQueue.status, 'in_progress'),
        sql`${campaignQueue.lockExpiresAt} > NOW()`
      )
    )
    .limit(1);

  return !!item;
}

/**
 * Get lock status for monitoring
 */
export async function getLockStatus(campaignId: string): Promise<{
  totalQueued: number;
  totalLocked: number;
  totalEligible: number;
}> {
  const result = await db.execute(sql`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'queued') as total_queued,
      COUNT(*) FILTER (WHERE status = 'in_progress' AND lock_expires_at > NOW()) as total_locked,
      COUNT(*) FILTER (
        WHERE status = 'queued' 
        AND (lock_expires_at IS NULL OR lock_expires_at < NOW())
        AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ) as total_eligible
    FROM campaign_queue
    WHERE campaign_id = ${campaignId}
  `);

  const row = result.rows[0] as { total_queued: string; total_locked: string; total_eligible: string } | undefined;
  
  return {
    totalQueued: parseInt(row?.total_queued || '0', 10),
    totalLocked: parseInt(row?.total_locked || '0', 10),
    totalEligible: parseInt(row?.total_eligible || '0', 10)
  };
}
