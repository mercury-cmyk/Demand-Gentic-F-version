import { storage } from "../storage";
import type { AgentQueue, Contact, Campaign, ManualQueueFilters } from "@shared/schema";
import { eq, and, or, sql, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { agentQueue, contacts, accounts, campaigns, suppressionEmails, suppressionPhones, campaignSuppressionAccounts, campaignSuppressionContacts, campaignSuppressionEmails, campaignSuppressionDomains } from "@shared/schema";
import { getBestPhoneForContact, normalizePhoneWithCountryCode } from "../lib/phone-utils";
import { batchCheckAccountCaps, batchCheckCampaignSuppression } from "../lib/campaign-suppression";

interface QueueConfig {
  lockTimeoutSec: number; // How long a contact stays locked before auto-release
  maxRetries: number;
  priorityBoost: number; // Priority increase per manual retry
}

const DEFAULT_CONFIG: QueueConfig = {
  lockTimeoutSec: 300, // 5 minutes
  maxRetries: 3,
  priorityBoost: 10,
};

export class ManualQueueService {
  private config: QueueConfig;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add contacts to agent's manual queue based on filters
   * Uses bulk prefetching of suppression lists to avoid N+1 queries
   */
  async addContactsToAgentQueue(
    agentId: string,
    campaignId: string,
    filters: ManualQueueFilters,
    limit: number = 50000
  ): Promise<{ added: number; skipped: number }> {
    try {
      // Get campaign to verify it's in manual mode
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign || campaign.dialMode !== 'manual') {
        throw new Error("Campaign must be in manual dial mode");
      }

      // Build contact query based on filters
      const eligibleContacts = await this.getEligibleContacts(campaignId, filters, limit);

      if (eligibleContacts.length === 0) {
        return { added: 0, skipped: 0 };
      }

      // Get already queued contacts in this campaign (bulk check)
      const contactIds = eligibleContacts.map(c => c.id);
      const alreadyQueued = await db
        .select({ contactId: agentQueue.contactId })
        .from(agentQueue)
        .where(
          and(
            eq(agentQueue.campaignId, campaignId),
            inArray(agentQueue.contactId, contactIds),
            or(
              eq(agentQueue.queueState, 'queued'),
              eq(agentQueue.queueState, 'locked'),
              eq(agentQueue.queueState, 'in_progress')
            )!
          )
        );
      
      const alreadyQueuedSet = new Set(alreadyQueued.map(q => q.contactId));

      // STEP 1: Bulk check account caps (more efficient than per-account checks)
      const accountIds = eligibleContacts.map(c => c.accountId).filter((id): id is string => Boolean(id));
      const uniqueAccountIds = Array.from(new Set(accountIds));
      const accountCapResults = await batchCheckAccountCaps(campaignId, uniqueAccountIds);

      // VALIDATION: Check for missing account cap results
      if (accountCapResults.size !== uniqueAccountIds.length) {
        console.warn(`[ManualQueue] MISMATCH: Account cap check returned ${accountCapResults.size} results for ${uniqueAccountIds.length} accounts`);
        console.warn(`[ManualQueue] Missing ${uniqueAccountIds.length - accountCapResults.size} account cap results - these will default to "no cap"`);
      }

      // STEP 2: Bulk check campaign-level suppressions (includes domain/company matching + cap=1 logic)
      const suppressionResults = await batchCheckCampaignSuppression(campaignId, contactIds);

      // VALIDATION: Check for missing suppression results
      if (suppressionResults.size !== contactIds.length) {
        console.warn(`[ManualQueue] MISMATCH: Suppression check returned ${suppressionResults.size} results for ${contactIds.length} contacts`);
        console.warn(`[ManualQueue] Missing ${contactIds.length - suppressionResults.size} suppression results - these will default to "not suppressed"`);
      }

      // STEP 3: Prefetch global suppression sets (email/phone DNC)
      const globalSuppressionSets = await this.prefetchGlobalSuppressionSets(eligibleContacts);

      // Filter contacts using bulk suppression results, account caps, global DNC, AND phone country validation
      const contactsToAdd = eligibleContacts.filter(contact => {
        // Skip if already queued
        if (alreadyQueuedSet.has(contact.id)) {
          return false;
        }

        // Check account cap enforcement
        if (contact.accountId) {
          const capCheck = accountCapResults.get(contact.accountId);
          if (capCheck?.capReached) {
            console.log(`[ManualQueue] Contact ${contact.id} filtered: ${capCheck.reason}`);
            return false;
          }
        }

        // Check campaign-level suppression (includes domain/company name matching + cap=1 logic)
        // DEFENSIVE: Default to not suppressed if contact wasn't in the batch (shouldn't happen)
        const suppressionCheck = suppressionResults.get(contact.id);
        if (suppressionCheck === undefined) {
          console.warn(`[ManualQueue] Contact ${contact.id} missing from suppression results - treating as not suppressed`);
          // Continue processing - don't block contacts that weren't checked
        } else if (suppressionCheck.suppressed) {
          console.log(`[ManualQueue] Contact ${contact.id} suppressed: ${suppressionCheck.reason}`);
          return false;
        }

        // Check global email suppression (DNC)
        if (contact.email) {
          const emailNorm = contact.email.toLowerCase().trim();
          if (globalSuppressionSets.emailsNorm.has(emailNorm)) {
            console.log(`[ManualQueue] Email ${contact.email} is globally suppressed`);
            return false;
          }
        }

        // Check global phone suppression (DNC)
        if (contact.directPhoneE164 && globalSuppressionSets.phonesE164.has(contact.directPhoneE164)) {
          console.log(`[ManualQueue] Direct phone is on global DNC`);
          return false;
        }
        if (contact.mobilePhoneE164 && globalSuppressionSets.phonesE164.has(contact.mobilePhoneE164)) {
          console.log(`[ManualQueue] Mobile phone is on global DNC`);
          return false;
        }

        // PHONE COUNTRY VALIDATION: Only include contacts with phone matching their country
        const bestPhone = getBestPhoneForContact(contact);
        if (!bestPhone.phone) {
          console.log(`[ManualQueue] Contact ${contact.id} filtered: no valid phone matching country ${contact.country}`);
          return false;
        }

        return true;
      });

      console.log(`[ManualQueue] Filtered ${eligibleContacts.length} contacts: ${contactsToAdd.length} to add, ${eligibleContacts.length - contactsToAdd.length} suppressed/queued`);

      // Bulk insert all non-suppressed contacts
      if (contactsToAdd.length === 0) {
        return { added: 0, skipped: eligibleContacts.length };
      }

      // Update contacts with normalized phone numbers if needed
      const directPhoneUpdates: Array<{id: string, directPhoneE164: string}> = [];
      const mobilePhoneUpdates: Array<{id: string, mobilePhoneE164: string}> = [];
      
      const queueEntries = contactsToAdd.map(contact => {
        // Normalize and update phone numbers - ONLY update the specific field that needs normalization
        const bestPhone = getBestPhoneForContact(contact);
        
        // Update E164 fields if missing (only for contact-owned phones, not HQ)
        if (bestPhone.type === 'direct' && !contact.directPhoneE164 && contact.directPhone) {
          const normalized = normalizePhoneWithCountryCode(contact.directPhone, contact.country);
          if (normalized.e164) {
            directPhoneUpdates.push({ id: contact.id, directPhoneE164: normalized.e164 });
          }
        } else if (bestPhone.type === 'mobile' && !contact.mobilePhoneE164 && contact.mobilePhone) {
          const normalized = normalizePhoneWithCountryCode(contact.mobilePhone, contact.country);
          if (normalized.e164) {
            mobilePhoneUpdates.push({ id: contact.id, mobilePhoneE164: normalized.e164 });
          }
        }
        // Note: 'hq' phone type is read-only from account table, no update needed

        return {
          id: sql`gen_random_uuid()`,
          agentId,
          campaignId,
          contactId: contact.id,
          accountId: contact.accountId,
          dialedNumber: bestPhone.phone || null, // CRITICAL: Store exact dialed number for Telnyx recording sync
          queueState: 'queued' as const,
          priority: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      // Update contacts with normalized phone numbers - separate updates to avoid data loss
      for (const update of directPhoneUpdates) {
        await db
          .update(contacts)
          .set({
            directPhoneE164: update.directPhoneE164,
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, update.id));
      }

      for (const update of mobilePhoneUpdates) {
        await db
          .update(contacts)
          .set({
            mobilePhoneE164: update.mobilePhoneE164,
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, update.id));
      }

      const totalUpdates = directPhoneUpdates.length + mobilePhoneUpdates.length;
      console.log(`[ManualQueue] Updated ${totalUpdates} contacts with normalized phone numbers (${directPhoneUpdates.length} direct, ${mobilePhoneUpdates.length} mobile)`);

      // Bulk insert with conflict handling
      const result = await db.insert(agentQueue)
        .values(queueEntries)
        .onConflictDoNothing({
          target: [agentQueue.campaignId, agentQueue.contactId],
          where: sql`${agentQueue.queueState} IN ('queued', 'locked', 'in_progress')`,
        })
        .returning({ id: agentQueue.id });

      const added = result.length;
      const skipped = eligibleContacts.length - added;

      console.log(`[ManualQueue] Added ${added} contacts to agent ${agentId} queue, skipped ${skipped}`);
      return { added, skipped };

    } catch (error) {
      console.error("[ManualQueue] Error adding contacts to queue:", error);
      throw error;
    }
  }

  /**
   * Pull next contact from agent's queue (with locking)
   * Uses transaction with FOR UPDATE SKIP LOCKED for race-free pulls
   */
  async pullNextContact(agentId: string, campaignId: string): Promise<AgentQueue | null> {
    try {
      // Use a transaction to atomically select and lock in one operation
      const result = await db.transaction(async (tx) => {
        // SELECT ... FOR UPDATE SKIP LOCKED ensures:
        // 1. Only one agent can lock a row at a time
        // 2. Other agents skip locked rows and get the next available one
        // 3. No race conditions or deadlocks
        // Also filters out contacts that are suppressed (next_call_eligible_at > NOW())
        const selectResult = await tx.execute(sql`
          SELECT aq.id, aq.lock_version
          FROM agent_queue aq
          INNER JOIN contacts c ON aq.contact_id = c.id
          WHERE aq.agent_id = ${agentId}
            AND aq.campaign_id = ${campaignId}
            AND aq.queue_state = 'queued'
            AND (aq.scheduled_for IS NULL OR aq.scheduled_for <= NOW())
            AND (c.next_call_eligible_at IS NULL OR c.next_call_eligible_at <= NOW())
          ORDER BY aq.ai_priority_score DESC NULLS LAST, aq.priority DESC, aq.created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `);

        const row = selectResult.rows[0];
        if (!row) {
          return null;
        }

        // Update with optimistic concurrency (lock_version check)
        const updateResult = await tx.execute(sql`
          UPDATE agent_queue
          SET 
            queue_state = 'locked',
            locked_by = ${agentId},
            locked_at = NOW(),
            lock_expires_at = NOW() + INTERVAL '15 minutes',
            lock_version = lock_version + 1,
            updated_at = NOW()
          WHERE id = ${row.id}
            AND queue_state = 'queued'
            AND lock_version = ${row.lock_version}
          RETURNING *
        `);

        const updated = updateResult.rows[0];
        return updated || null;
      });

      // Fetch full contact details if lock was successful
      if (result) {
        const fullItem = await db.query.agentQueue.findFirst({
          where: eq(agentQueue.id, result.id as string),
        });
        return fullItem || null;
      }

      return null;

    } catch (error) {
      console.error("[ManualQueue] Error pulling next contact:", error);
      throw error;
    }
  }

  /**
   * Mark queue item as in progress (agent is calling)
   */
  async markInProgress(queueItemId: string, agentId: string): Promise<void> {
    await db
      .update(agentQueue)
      .set({
        queueState: 'in_progress',
        updatedAt: new Date(),
      })
      .where(and(
        eq(agentQueue.id, queueItemId),
        eq(agentQueue.lockedBy, agentId)
      ));
  }

  /**
   * Mark queue item as completed
   */
  async markCompleted(queueItemId: string, agentId: string): Promise<void> {
    await db
      .update(agentQueue)
      .set({
        queueState: 'completed',
        updatedAt: new Date(),
      })
      .where(and(
        eq(agentQueue.id, queueItemId),
        eq(agentQueue.lockedBy, agentId)
      ));
  }

  /**
   * Remove contact from queue with reason
   */
  async removeFromQueue(
    queueItemId: string,
    agentId: string,
    reason: string
  ): Promise<void> {
    await db
      .update(agentQueue)
      .set({
        queueState: 'removed',
        removedReason: reason,
        updatedAt: new Date(),
      })
      .where(and(
        eq(agentQueue.id, queueItemId),
        eq(agentQueue.lockedBy, agentId)
      ));
  }

  /**
   * Release lock on queue item (put back to queued)
   */
  async releaseLock(queueItemId: string, agentId: string): Promise<void> {
    await db
      .update(agentQueue)
      .set({
        queueState: 'queued',
        lockedBy: null,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(agentQueue.id, queueItemId),
        eq(agentQueue.lockedBy, agentId)
      ));
  }

  /**
   * Boost priority for retry
   */
  async boostPriority(queueItemId: string): Promise<void> {
    await db
      .update(agentQueue)
      .set({
        priority: sql`${agentQueue.priority} + ${this.config.priorityBoost}`,
        updatedAt: new Date(),
      })
      .where(eq(agentQueue.id, queueItemId));
  }

  /**
   * Get agent's queue stats
   */
  async getQueueStats(agentId: string, campaignId: string) {
    const stats = await db
      .select({
        queueState: agentQueue.queueState,
        count: sql<number>`count(*)`,
      })
      .from(agentQueue)
      .where(and(
        eq(agentQueue.agentId, agentId),
        eq(agentQueue.campaignId, campaignId)
      ))
      .groupBy(agentQueue.queueState);

    return stats.reduce((acc, row) => {
      acc[row.queueState] = Number(row.count);
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Release stale locks (locked > timeout)
   */
  private async releaseStaleLocksForAgent(agentId: string, campaignId: string): Promise<void> {
    const timeoutDate = new Date(Date.now() - this.config.lockTimeoutSec * 1000);

    await db
      .update(agentQueue)
      .set({
        queueState: 'queued',
        lockedBy: null,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(agentQueue.agentId, agentId),
        eq(agentQueue.campaignId, campaignId),
        eq(agentQueue.queueState, 'locked'),
        sql`${agentQueue.lockedAt} < ${timeoutDate}`
      ));
  }

  /**
   * Get eligible contacts based on filters
   * INCLUDES account/HQ phone data for phone prioritization logic
   */
  private async getEligibleContacts(
    campaignId: string,
    filters: ManualQueueFilters,
    limit: number
  ): Promise<Contact[]> {
    const conditions = [];

    // Apply filters
    if (filters.accountIds && filters.accountIds.length > 0) {
      conditions.push(inArray(contacts.accountId, filters.accountIds));
    }

    if (filters.industries && filters.industries.length > 0) {
      conditions.push(
        sql`${contacts.accountId} IN (
          SELECT id FROM ${accounts} WHERE ${accounts.industryStandardized} = ANY(ARRAY[${sql.join(filters.industries.map(i => sql`${i}`), sql`, `)}])
        )`
      );
    }

    if (filters.regions && filters.regions.length > 0) {
      conditions.push(
        sql`${contacts.accountId} IN (
          SELECT id FROM ${accounts} WHERE ${accounts.hqState} = ANY(ARRAY[${sql.join(filters.regions.map(r => sql`${r}`), sql`, `)}])
        )`
      );
    }

    if (filters.hasEmail) {
      conditions.push(sql`${contacts.email} IS NOT NULL AND ${contacts.email} != ''`);
    }

    if (filters.hasPhone) {
      conditions.push(sql`(${contacts.directPhone} IS NOT NULL AND ${contacts.directPhone} != '') OR (${contacts.mobilePhone} IS NOT NULL AND ${contacts.mobilePhone} != '')`);
    }

    // Join with accounts to get HQ phone data for fallback logic
    const results = await db
      .select()
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit);

    // Map results to include HQ phone data on contact objects
    const eligibleContacts = results.map(row => ({
      ...row.contacts,
      // Include HQ phone data for phone prioritization logic
      hqPhone: row.accounts?.mainPhone,
      hqPhoneE164: row.accounts?.mainPhoneE164,
      hqCountry: row.accounts?.hqCountry,
    })) as Contact[];

    return eligibleContacts;
  }

  /**
   * Prefetch global suppression sets (email/phone DNC) in bulk
   * Campaign-level suppressions are handled by batchCheckCampaignSuppression
   */
  private async prefetchGlobalSuppressionSets(
    contacts: Contact[]
  ): Promise<{
    emailsNorm: Set<string>;
    phonesE164: Set<string>;
  }> {
    const emails = contacts.map(c => c.email).filter(Boolean) as string[];
    const emailsNorm = emails.map(e => e.toLowerCase().trim());
    
    // Extract all phone numbers from contacts
    const phones: string[] = [];
    for (const contact of contacts) {
      if (contact.directPhoneE164) phones.push(contact.directPhoneE164);
      if (contact.mobilePhoneE164) phones.push(contact.mobilePhoneE164);
    }

    // Parallel bulk queries for global suppressions only
    const [globalEmails, globalPhones] = await Promise.all([
      // Global email suppressions
      emailsNorm.length > 0
        ? db.select({ email: suppressionEmails.email })
            .from(suppressionEmails)
            .where(inArray(suppressionEmails.email, emailsNorm))
        : Promise.resolve([]),
      
      // Global phone suppressions
      phones.length > 0
        ? db.select({ phoneE164: suppressionPhones.phoneE164 })
            .from(suppressionPhones)
            .where(inArray(suppressionPhones.phoneE164, phones))
        : Promise.resolve([]),
    ]);

    return {
      emailsNorm: new Set(globalEmails.map(e => e.email)),
      phonesE164: new Set(globalPhones.map(p => p.phoneE164)),
    };
  }


  /**
   * Bulk clear completed items from queue
   */
  async clearCompletedItems(agentId: string, campaignId: string): Promise<number> {
    const result = await db
      .delete(agentQueue)
      .where(and(
        eq(agentQueue.agentId, agentId),
        eq(agentQueue.campaignId, campaignId),
        eq(agentQueue.queueState, 'completed')
      ))
      .returning({ id: agentQueue.id });

    return result.length;
  }

  /**
   * Get current queue for agent
   */
  async getAgentQueue(
    agentId: string,
    campaignId: string,
    includeCompleted: boolean = false
  ) {
    const conditions = [
      eq(agentQueue.agentId, agentId),
      eq(agentQueue.campaignId, campaignId),
    ];

    if (!includeCompleted) {
      conditions.push(
        or(
          eq(agentQueue.queueState, 'queued'),
          eq(agentQueue.queueState, 'locked'),
          eq(agentQueue.queueState, 'in_progress')
        )!
      );
    }

    return await db.query.agentQueue.findMany({
      where: and(...conditions),
      with: {
        contact: true,
        account: true,
      },
      orderBy: [sql`${agentQueue.aiPriorityScore} DESC NULLS LAST`, sql`${agentQueue.priority} DESC`, sql`${agentQueue.createdAt} ASC`],
    });
  }
}

// Export singleton instance
export const manualQueueService = new ManualQueueService();
