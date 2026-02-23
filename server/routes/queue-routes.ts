import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import { sql, and, eq, isNull, or, inArray, notInArray } from 'drizzle-orm';
import { requireAuth, requireRole } from '../auth';
import { requireFeatureFlag } from '../feature-flags';
import { z } from 'zod';
import { buildFilterQuery } from '../filter-builder';
import { contacts, accounts, campaigns, agentQueue, campaignAudienceSnapshots, lists, segments, globalDnc } from '@shared/schema';
import type { FilterGroup } from '@shared/filter-types';
import { getBestPhoneForContact } from '../lib/phone-utils';
import { batchCheckCampaignSuppression, batchCheckAccountCaps } from '../lib/campaign-suppression';
import { detectContactTimezone, isWithinBusinessHours, getBusinessHoursForCountry, type BusinessHoursConfig } from '../utils/business-hours';
import { analyzeCampaignTimezones } from '../services/campaign-timezone-analyzer';

const router = Router();

/**
 * Resolve list recordIds to contact IDs, handling both contact-type and account-type lists.
 * Account-type lists store account IDs in recordIds — we resolve those to contact IDs.
 */
async function resolveListToContactIds(
  list: { entityType: string; recordIds: string[] },
  dbOrTx: typeof db,
  logPrefix: string = '[queue]'
): Promise<string[]> {
  if (list.entityType === 'account') {
    // Account-type list: recordIds are account IDs — resolve to contacts belonging to those accounts
    const contactIds: string[] = [];
    const batchSize = 1000;
    for (let i = 0; i < list.recordIds.length; i += batchSize) {
      const batch = list.recordIds.slice(i, i + batchSize);
      const accountContacts = await dbOrTx.select({ id: contacts.id })
        .from(contacts)
        .where(inArray(contacts.accountId, batch));
      accountContacts.forEach(c => contactIds.push(c.id));
    }
    console.log(`${logPrefix} Resolved ${list.recordIds.length} account IDs -> ${contactIds.length} contact IDs`);
    return contactIds;
  }
  // Contact-type list: recordIds are already contact IDs
  return list.recordIds;
}

// Schema for a single filter condition
const filterConditionSchema = z.object({
  id: z.string(),
  field: z.string(),
  operator: z.string(),
  values: z.array(z.any()).optional(), // Array of values for the filter
});

// Schema for filter group (matches FilterGroup from @shared/filter-types)
const filterGroupSchema = z.object({
  logic: z.enum(['AND', 'OR']),
  conditions: z.array(filterConditionSchema),
});

// Schema for queue set request
const queueSetSchema = z.object({
  agent_id: z.string(),
  filters: filterGroupSchema.optional(),
  per_account_cap: z.number().int().positive().optional().nullable(),
  max_queue_size: z.number().int().positive().optional().nullable(),
  keep_in_progress: z.boolean().optional().default(false),
  dry_run: z.boolean().optional().default(false),
  allow_sharing: z.boolean().optional().default(false), // Allow multiple agents to queue same contacts
  scope_by_timezone: z.boolean().optional().default(false), // Only queue contacts currently within business hours
});

// Schema for queue clear request
const queueClearSchema = z.object({
  agent_id: z.string(),
});

/**
 * POST /api/campaigns/:campaignId/queues/set
 * Set Queue (Replace) - Clear agent's current queue and assign new contacts based on filters
 * 
 * Body:
 * - agent_id: string (required) - The agent whose queue to replace
 * - filters: object (optional) - Filter criteria
 *   - first_name_contains: string (optional) - Filter contacts by first name
 * - per_account_cap: number (optional) - Max contacts per account
 * - max_queue_size: number (optional) - Max total queue size
 * - keep_in_progress: boolean (optional, default: true) - Keep in_progress items
 * - dry_run: boolean (optional, default: false) - Preview mode without changes
 * 
 * Returns:
 * - released: number - Count of released queue items
 * - assigned: number - Count of newly assigned contacts
 * - skipped_due_to_collision: number - Count of contacts already assigned to other agents
 */
router.post(
  '/campaigns/:campaignId/queues/set',
  requireAuth,
  requireFeatureFlag('queue_replace_v1'),
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.campaignId;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'unauthorized', message: 'User not authenticated' });
      }

      // Validate request body
      const validation = queueSetSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'validation_error', 
          details: validation.error.errors 
        });
      }

      const {
        agent_id,
        filters,
        per_account_cap = null,
        max_queue_size = null,
        keep_in_progress = true,
        dry_run = false,
        allow_sharing = false,
        scope_by_timezone = false,
      } = validation.data;

      // RBAC: Agents can only manage their own queue, Managers/Admins can manage any agent's queue
      const userRoles = req.user?.roles || [req.user?.role];
      const isAdminOrManager = userRoles.includes('admin') || userRoles.includes('campaign_manager');
      
      if (!isAdminOrManager && agent_id !== userId) {
        return res.status(403).json({ 
          error: 'forbidden', 
          message: 'You can only manage your own queue' 
        });
      }

      // Dry run mode: preview without making changes
      if (dry_run) {
        // TODO: Implement dry-run preview by running the query in a rolled-back transaction
        // For now, return a placeholder response
        return res.json({
          preview_only: true,
          note: 'Dry-run preview mode - implement by running query in rolled-back transaction',
          released: 0,
          assigned: 0,
          skipped_due_to_collision: 0,
        });
      }

      // Execute queue replacement using filter system
      const result = await db.transaction(async (tx) => {
        // Step 1: Release existing queued/locked items BUT preserve scheduled retry dates
        // CRITICAL: Don't delete contacts with future scheduledFor dates (voicemail/callback retries)
        const releaseConditions = [
          eq(agentQueue.agentId, agent_id),
          eq(agentQueue.campaignId, campaignId),
          // PRESERVE contacts with future retry dates
          sql`(${agentQueue.scheduledFor} IS NULL OR ${agentQueue.scheduledFor} <= NOW())`,
        ];
        
        if (keep_in_progress) {
          releaseConditions.push(
            or(
              eq(agentQueue.queueState, 'queued'),
              eq(agentQueue.queueState, 'locked')
            )!
          );
        }

        const releaseResult = await tx.delete(agentQueue)
          .where(and(...releaseConditions))
          .returning();
        
        const released = releaseResult.length;
        
        console.log(`[queues:set] Released ${released} items (preserved scheduled retries)`);

        // Step 2: Get campaign to check audience refs
        const [campaign] = await tx.select()
          .from(campaigns)
          .where(eq(campaigns.id, campaignId))
          .limit(1);

        if (!campaign) {
          return res.status(404).json({ error: 'not_found', message: 'Campaign not found' });
        }

        // Step 3: Get campaign audience (from snapshot or resolve dynamically)
        let campaignContactIds: string[] = [];
        
        // Try snapshot first (most efficient)
        const snapshot = await tx.select({
          contactIds: campaignAudienceSnapshots.contactIds,
        })
        .from(campaignAudienceSnapshots)
        .where(eq(campaignAudienceSnapshots.campaignId, campaignId))
        .orderBy(sql`${campaignAudienceSnapshots.createdAt} DESC`)
        .limit(1);

        if (snapshot[0]?.contactIds && snapshot[0].contactIds.length > 0) {
          campaignContactIds = snapshot[0].contactIds;
          console.log(`[queues:set] Using snapshot with ${campaignContactIds.length} contacts`);
        } else if (campaign.audienceRefs) {
          // No snapshot - resolve audience dynamically from campaign refs
          console.log('[queues:set] No snapshot - resolving audience from campaign refs');
          const audienceRefs = campaign.audienceRefs as any;
          const uniqueContactIds = new Set<string>();
          
          // Resolve from filterGroup (advanced filters)
          if (audienceRefs.filterGroup) {
            const filterSQL = buildFilterQuery(audienceRefs.filterGroup as FilterGroup, contacts);
            if (filterSQL) {
              const audienceContacts = await tx.select({ id: contacts.id })
                .from(contacts)
                .where(filterSQL);
              audienceContacts.forEach(c => uniqueContactIds.add(c.id));
              console.log(`[queues:set] Found ${audienceContacts.length} contacts from filterGroup`);
            }
          }
          
          // Resolve from lists (handles both contact-type and account-type lists)
          if (audienceRefs.lists && Array.isArray(audienceRefs.lists)) {
            for (const listId of audienceRefs.lists) {
              const [list] = await tx.select()
                .from(lists)
                .where(eq(lists.id, listId))
                .limit(1);

              if (list && list.recordIds && list.recordIds.length > 0) {
                const resolvedIds = await resolveListToContactIds(list as any, tx as any, '[queues:set]');
                resolvedIds.forEach((id: string) => uniqueContactIds.add(id));
                console.log(`[queues:set] Found ${resolvedIds.length} contacts from list ${listId} (entityType: ${list.entityType})`);
              }
            }
          }

          // Resolve from selectedLists (alternate field name)
          if (audienceRefs.selectedLists && Array.isArray(audienceRefs.selectedLists)) {
            for (const listId of audienceRefs.selectedLists) {
              const [list] = await tx.select()
                .from(lists)
                .where(eq(lists.id, listId))
                .limit(1);

              if (list && list.recordIds && list.recordIds.length > 0) {
                const resolvedIds = await resolveListToContactIds(list as any, tx as any, '[queues:set]');
                resolvedIds.forEach((id: string) => uniqueContactIds.add(id));
                console.log(`[queues:set] Found ${resolvedIds.length} contacts from selectedList ${listId} (entityType: ${list.entityType})`);
              }
            }
          }

          // Resolve from segments
          if (audienceRefs.segments && Array.isArray(audienceRefs.segments)) {
            for (const segmentId of audienceRefs.segments) {
              const [segment] = await tx.select()
                .from(segments)
                .where(eq(segments.id, segmentId))
                .limit(1);
              
              if (segment && segment.definitionJson) {
                const filterSQL = buildFilterQuery(segment.definitionJson as FilterGroup, contacts);
                if (filterSQL) {
                  const segmentContacts = await tx.select({ id: contacts.id })
                    .from(contacts)
                    .where(filterSQL);
                  segmentContacts.forEach(c => uniqueContactIds.add(c.id));
                  console.log(`[queues:set] Found ${segmentContacts.length} contacts from segment ${segmentId}`);
                }
              }
            }
          }
          
          campaignContactIds = Array.from(uniqueContactIds);
          console.log(`[queues:set] Total resolved: ${campaignContactIds.length} unique contacts from audience refs`);
        }

        // If campaign has no audience defined, return error with details
        if (campaignContactIds.length === 0) {
          const hasSnapshot = snapshot[0]?.contactIds && snapshot[0].contactIds.length > 0;
          const hasAudienceRefs = !!campaign.audienceRefs;
          const audienceRefsDetails = campaign.audienceRefs ? {
            hasFilterGroup: !!(campaign.audienceRefs as any).filterGroup,
            hasLists: !!((campaign.audienceRefs as any).lists?.length),
            hasSelectedLists: !!((campaign.audienceRefs as any).selectedLists?.length),
            hasSegments: !!((campaign.audienceRefs as any).segments?.length),
          } : null;

          console.log('[queues:set] Campaign has no audience defined');
          console.log('[queues:set] Audience debug info:', {
            hasSnapshot,
            hasAudienceRefs,
            audienceRefsDetails,
            campaignId,
            campaignName: campaign.name
          });

          return {
            released,
            assigned: 0,
            skipped_due_to_collision: 0,
            filtered_contacts: [],
            error: 'Campaign has no audience defined. Please configure campaign audience first.',
            debug_info: {
              has_snapshot: hasSnapshot,
              has_audience_refs: hasAudienceRefs,
              audience_refs_details: audienceRefsDetails
            }
          };
        }

        // Step 4: Apply agent's filters WITHIN campaign audience
        console.log('[queues:set] ========== FILTER DEBUGGING ==========');
        console.log('[queues:set] Campaign audience size:', campaignContactIds.length);
        console.log('[queues:set] Filters received:', filters ? 'yes' : 'no');
        if (filters) {
          console.log('[queues:set] Filter logic:', filters.logic);
          console.log('[queues:set] Filter conditions count:', filters.conditions?.length || 0);
          filters.conditions?.forEach((condition: any, idx: number) => {
            console.log(`[queues:set] Condition ${idx + 1}:`, {
              field: condition.field,
              operator: condition.operator,
              values: condition.values,
              valuesLength: condition.values?.length || 0
            });
          });
        }

        // For large campaigns, batch the inArray to avoid PostgreSQL parameter limits
        let eligibleContacts: any[] = [];
        const BATCH_SIZE = 500;

        // Build filter SQL once (applies to all batches)
        const filterPart = filters && filters.conditions && filters.conditions.length > 0
          ? buildFilterQuery(filters as FilterGroup, contacts)
          : undefined;

        console.log('[queues:set] Filter SQL generated:', filterPart ? 'yes' : 'no (undefined/no conditions)');
        
        // Process campaign contact IDs in batches
        for (let i = 0; i < campaignContactIds.length; i += BATCH_SIZE) {
          const batch = campaignContactIds.slice(i, i + BATCH_SIZE);
          
          if (per_account_cap) {
            // Use window function to limit contacts per account
            const baseQuery = sql`
              SELECT id, account_id
              FROM (
                SELECT 
                  c.id,
                  c.account_id,
                  ROW_NUMBER() OVER (PARTITION BY c.account_id ORDER BY c.id) as rn
                FROM ${contacts} c
                WHERE 
                  c.id = ANY(ARRAY[${sql.join(batch.map(id => sql`${id}`), sql`, `)}])
                  ${filterPart ? sql`AND ${filterPart}` : sql``}
              ) t
              WHERE rn <= ${per_account_cap}
              ORDER BY id
            `;
            
            const queryResult = await tx.execute(baseQuery);
            const batchResults = queryResult.rows.map((row: any) => ({
              id: row.id,
              accountId: row.account_id,
            }));
            eligibleContacts.push(...batchResults);
          } else {
            // Simple query without per-account cap
            const whereConditions: any[] = [inArray(contacts.id, batch)];
            if (filterPart) {
              whereConditions.push(filterPart);
            }
            
            const batchResults = await tx.select({
              id: contacts.id,
              accountId: contacts.accountId,
            })
            .from(contacts)
            .where(and(...whereConditions))
            .orderBy(contacts.id);
            
            eligibleContacts.push(...batchResults);
          }
          
          // Stop if we've reached max_queue_size
          if (max_queue_size && eligibleContacts.length >= max_queue_size) {
            eligibleContacts = eligibleContacts.slice(0, max_queue_size);
            break;
          }
        }
        
        console.log(`[queues:set] Eligible contacts after filtering: ${eligibleContacts.length}`);
        if (filterPart) {
          console.log('[queues:set] Agent filters applied within campaign audience');
        }

        // Track filtered contacts with reasons for visibility
        const filteredContacts: Array<{ contactId: string; reason: string }> = [];

        // Step 4: PHONE VALIDATION - Fetch full contact data and filter for callable numbers
        const contactIds = eligibleContacts.map(c => c.id);
        
        console.log('[queues:set] Step 4 - Eligible contacts before phone validation:', contactIds.length);
        
        if (contactIds.length === 0) {
          console.log('[queues:set] No eligible contacts found');
          return {
            released,
            assigned: 0,
            skipped_due_to_collision: 0,
            filtered_contacts: [],
          };
        }

        // Fetch full contact data with account/HQ phone info for validation (batch to avoid parameter limits)
        const fullContacts: any[] = [];
        for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
          const batch = contactIds.slice(i, i + BATCH_SIZE);
          const batchResults = await tx
            .select()
            .from(contacts)
            .leftJoin(accounts, eq(contacts.accountId, accounts.id))
            .where(inArray(contacts.id, batch));
          fullContacts.push(...batchResults);
        }

        // Create a map to quickly look up full contact data
        const fullContactMap = new Map(fullContacts.map(row => [row.contacts.id, row]));

        // Filter contacts with callable phone numbers (contact phone OR HQ phone with country match)
        const contactsWithCallablePhones = fullContacts.filter(row => {
          const contact = row.contacts;
          const account = row.accounts;
          
          // Check if contact has a valid callable phone
          const bestPhone = getBestPhoneForContact({
            directPhone: contact.directPhone,
            directPhoneE164: contact.directPhoneE164,
            mobilePhone: contact.mobilePhone,
            mobilePhoneE164: contact.mobilePhoneE164,
            country: contact.country,
            hqPhone: account?.mainPhone,
            hqPhoneE164: account?.mainPhoneE164,
            hqCountry: account?.hqCountry,
          });
          
          if (!bestPhone.phone) {
            console.log(`[queues:set] Contact ${contact.id} filtered: no valid callable phone`);
            filteredContacts.push({ contactId: contact.id, reason: 'No valid callable phone number' });
            return false;
          }
          
          return true;
        }).map(row => ({
          id: row.contacts.id,
          accountId: row.contacts.accountId,
          isInvalid: row.contacts.isInvalid,
        }));

        console.log(`[queues:set] Phone validation: ${contactsWithCallablePhones.length}/${contactIds.length} contacts have callable phones`);

        const skippedNoPhone = contactIds.length - contactsWithCallablePhones.length;
        
        // Step 5: CRITICAL FIX - Bulk filter invalid, suppressed, and DNC contacts
        // All filtering must happen BEFORE collision/scheduling checks to prevent reintroduction
        
        // 5a. Filter out invalid contacts (marked as wrong_number/invalid_data)
        const validContactIds = contactsWithCallablePhones
          .filter(c => {
            if (c.isInvalid) {
              filteredContacts.push({ contactId: c.id, reason: 'Contact marked as invalid' });
              return false;
            }
            return true;
          })
          .map(c => c.id);
        
        const skippedInvalid = contactsWithCallablePhones.length - validContactIds.length;
        console.log(`[queues:set] Invalid contact check: ${skippedInvalid} contacts filtered (marked as invalid)`);
        
        if (validContactIds.length === 0) {
          return {
            released,
            assigned: 0,
            skipped_no_phone: skippedNoPhone,
            skipped_invalid: skippedInvalid,
            skipped_campaign_suppression: 0,
            skipped_global_dnc: 0,
            skipped_account_cap: 0,
            skipped_outside_business_hours: 0,
            skipped_scheduled_retry: 0,
            skipped_due_to_collision: 0,
            total_skipped: skippedNoPhone + skippedInvalid,
            filtered_contacts: filteredContacts,
          };
        }
        
        // 5b. Check campaign suppressions (not_interested, qualified, etc.) - BULK
        const suppressionResults = await batchCheckCampaignSuppression(campaignId, validContactIds);
        
        // Guard against undefined - FAIL CLOSED for safety
        const nonSuppressedContactIds = validContactIds.filter(contactId => {
          const suppressionCheck = suppressionResults.get(contactId);
          if (suppressionCheck === undefined) {
            // CRITICAL: Fail closed - if check failed/missing, treat as suppressed for safety
            console.error(`[queues:set] Contact ${contactId} missing from suppression results - FAILING CLOSED (treating as suppressed)`);
            filteredContacts.push({ contactId, reason: 'Suppression check failed - treated as suppressed for safety' });
            return false;
          }
          if (suppressionCheck.suppressed) {
            console.log(`[queues:set] Contact ${contactId} filtered: ${suppressionCheck.reason}`);
            filteredContacts.push({ contactId, reason: suppressionCheck.reason || 'Campaign suppression' });
            return false;
          }
          return true;
        });
        
        const skippedSuppression = validContactIds.length - nonSuppressedContactIds.length;
        console.log(`[queues:set] Campaign suppression check: ${skippedSuppression} contacts filtered (suppressed)`);
        
        if (nonSuppressedContactIds.length === 0) {
          return {
            released,
            assigned: 0,
            skipped_no_phone: skippedNoPhone,
            skipped_invalid: skippedInvalid,
            skipped_campaign_suppression: skippedSuppression,
            skipped_global_dnc: 0,
            skipped_account_cap: 0,
            skipped_outside_business_hours: 0,
            skipped_scheduled_retry: 0,
            skipped_due_to_collision: 0,
            total_skipped: skippedNoPhone + skippedInvalid + skippedSuppression,
            filtered_contacts: filteredContacts,
          };
        }
        
        // 5c. Check global DNC list - SINGLE BULK QUERY
        const globalDncResults = await tx.select({
          contactId: globalDnc.contactId,
        })
        .from(globalDnc)
        .where(inArray(globalDnc.contactId, nonSuppressedContactIds));
        
        const globalDncContactIds = new Set(globalDncResults.map(d => d.contactId));
        const nonDncContactIds = nonSuppressedContactIds.filter(contactId => {
          if (globalDncContactIds.has(contactId)) {
            console.log(`[queues:set] Contact ${contactId} filtered: on global DNC list`);
            filteredContacts.push({ contactId, reason: 'On global Do Not Call list' });
            return false;
          }
          return true;
        });
        
        const skippedGlobalDnc = nonSuppressedContactIds.length - nonDncContactIds.length;
        console.log(`[queues:set] Global DNC check: ${skippedGlobalDnc} contacts filtered (on DNC list)`);
        
        if (nonDncContactIds.length === 0) {
          return {
            released,
            assigned: 0,
            skipped_no_phone: skippedNoPhone,
            skipped_invalid: skippedInvalid,
            skipped_campaign_suppression: skippedSuppression,
            skipped_global_dnc: skippedGlobalDnc,
            skipped_account_cap: 0,
            skipped_outside_business_hours: 0,
            skipped_scheduled_retry: 0,
            skipped_due_to_collision: 0,
            total_skipped: skippedNoPhone + skippedInvalid + skippedSuppression + skippedGlobalDnc,
            filtered_contacts: filteredContacts,
          };
        }
        
        // 5d. Check account caps - BULK (exclude contacts from accounts that reached their cap)
        // Get unique account IDs for contacts still in the running
        const accountIdsToCheck = [...new Set(
          contactsWithCallablePhones
            .filter(c => nonDncContactIds.includes(c.id))
            .map(c => c.accountId)
            .filter(Boolean)
        )] as string[];
        
        const accountCapResults = await batchCheckAccountCaps(campaignId, accountIdsToCheck);
        
        const finalContactIds = nonDncContactIds.filter(contactId => {
          const contact = contactsWithCallablePhones.find(c => c.id === contactId);
          if (!contact?.accountId) {
            // No account ID - can't check cap, allow through
            return true;
          }
          
          const capCheck = accountCapResults.get(contact.accountId);
          if (capCheck === undefined) {
            // CRITICAL: Fail closed - if check failed/missing, treat as capped for safety
            console.error(`[queues:set] Account ${contact.accountId} missing from cap results - FAILING CLOSED (treating as capped)`);
            return false;
          }
          
          if (capCheck.capReached) {
            console.log(`[queues:set] Contact ${contactId} filtered: ${capCheck.reason}`);
            filteredContacts.push({ contactId, reason: capCheck.reason || 'Account cap reached' });
            return false;
          }
          
          return true;
        });
        
        const skippedAccountCap = nonDncContactIds.length - finalContactIds.length;
        console.log(`[queues:set] Account cap check: ${skippedAccountCap} contacts filtered (account cap reached)`);

        if (finalContactIds.length === 0) {
          return {
            released,
            assigned: 0,
            skipped_no_phone: skippedNoPhone,
            skipped_invalid: skippedInvalid,
            skipped_campaign_suppression: skippedSuppression,
            skipped_global_dnc: skippedGlobalDnc,
            skipped_account_cap: skippedAccountCap,
            skipped_outside_business_hours: 0,
            skipped_scheduled_retry: 0,
            skipped_due_to_collision: 0,
            total_skipped: skippedNoPhone + skippedInvalid + skippedSuppression + skippedGlobalDnc + skippedAccountCap,
            filtered_contacts: filteredContacts,
          };
        }

        // 5e. TIMEZONE BUSINESS HOURS FILTER - Only queue contacts within business hours
        let timezoneFilteredContactIds = finalContactIds;
        let skippedOutsideBusinessHours = 0;

        if (scope_by_timezone) {
          console.log('[queues:set] Timezone scoping enabled - filtering contacts outside business hours');

          // Get campaign's business hours config (or use defaults)
          const campaignBizHours = campaign.businessHoursConfig as BusinessHoursConfig | null;
          const now = new Date();

          timezoneFilteredContactIds = finalContactIds.filter(contactId => {
            const fullContactRow = fullContactMap.get(contactId);
            const fullContact = fullContactRow?.contacts;

            if (!fullContact) return true; // Allow through if no data

            const contactTimezoneInfo = {
              timezone: fullContact.timezone || undefined,
              state: fullContact.state || fullContact.stateAbbr || undefined,
              country: fullContact.country || undefined,
            };

            // Determine business hours config: campaign config or country-specific default
            let bizConfig: BusinessHoursConfig;
            if (campaignBizHours && campaignBizHours.enabled) {
              bizConfig = { ...campaignBizHours };
              // If campaign respects contact timezone, detect it
              if (bizConfig.respectContactTimezone) {
                const contactTz = detectContactTimezone(contactTimezoneInfo);
                if (contactTz) {
                  bizConfig.timezone = contactTz;
                  bizConfig.respectContactTimezone = false; // We already resolved it
                }
              }
            } else {
              // No campaign config - use country-specific defaults
              bizConfig = getBusinessHoursForCountry(fullContact.country);
              const contactTz = detectContactTimezone(contactTimezoneInfo);
              if (contactTz) {
                bizConfig.timezone = contactTz;
                bizConfig.respectContactTimezone = false;
              }
            }

            const canCall = isWithinBusinessHours(bizConfig, undefined, now);

            if (!canCall) {
              const detectedTz = detectContactTimezone(contactTimezoneInfo) || 'unknown';
              filteredContacts.push({
                contactId,
                reason: `Outside business hours (${bizConfig.startTime}-${bizConfig.endTime} ${detectedTz})`
              });
              return false;
            }

            return true;
          });

          skippedOutsideBusinessHours = finalContactIds.length - timezoneFilteredContactIds.length;
          console.log(`[queues:set] Timezone scoping: ${skippedOutsideBusinessHours} contacts filtered (outside business hours)`);

          if (timezoneFilteredContactIds.length === 0) {
            return {
              released,
              assigned: 0,
              skipped_no_phone: skippedNoPhone,
              skipped_invalid: skippedInvalid,
              skipped_campaign_suppression: skippedSuppression,
              skipped_global_dnc: skippedGlobalDnc,
              skipped_account_cap: skippedAccountCap,
              skipped_outside_business_hours: skippedOutsideBusinessHours,
              skipped_scheduled_retry: 0,
              skipped_due_to_collision: 0,
              total_skipped: skippedNoPhone + skippedInvalid + skippedSuppression + skippedGlobalDnc + skippedAccountCap + skippedOutsideBusinessHours,
              filtered_contacts: filteredContacts,
            };
          }
        }

        // Map final contact IDs back to contact objects for downstream processing
        const finalContactIdSet = new Set(timezoneFilteredContactIds);
        let availableContacts = contactsWithCallablePhones.filter(c => finalContactIdSet.has(c.id));
        let skippedCollision = 0;
        let skippedScheduled = 0;

        // Step 6: Exclude contacts already scheduled for future retry (preserved in Step 1)
        // Query for contacts that STILL EXIST in queue with future scheduledFor dates
        const availableContactIds = availableContacts.map(c => c.id);
        
        // Batch to avoid parameter limits
        const scheduledContacts: any[] = [];
        for (let i = 0; i < availableContactIds.length; i += BATCH_SIZE) {
          const batch = availableContactIds.slice(i, i + BATCH_SIZE);
          const batchResults = await tx.select({
            contactId: agentQueue.contactId,
            scheduledFor: agentQueue.scheduledFor,
          })
          .from(agentQueue)
          .where(
            and(
              eq(agentQueue.campaignId, campaignId),
              eq(agentQueue.agentId, agent_id),
              inArray(agentQueue.contactId, batch),
              sql`${agentQueue.scheduledFor} IS NOT NULL AND ${agentQueue.scheduledFor} > NOW()`
            )
          );
          scheduledContacts.push(...batchResults);
        }

        console.log('[queues:set] Contacts preserved with future scheduled dates:', scheduledContacts.length);
        
        const scheduledContactIds = new Set(scheduledContacts.map(s => s.contactId));
        if (scheduledContacts.length > 0) {
          const beforeScheduleFilter = availableContacts.length;
          availableContacts = availableContacts.filter(c => !scheduledContactIds.has(c.id));
          skippedScheduled = beforeScheduleFilter - availableContacts.length;
          console.log('[queues:set] Excluded contacts with future retry dates:', skippedScheduled);
          scheduledContacts.forEach(sc => {
            console.log(`  - Contact ${sc.contactId} scheduled for ${sc.scheduledFor}`);
          });
        }

        // Step 7: Collision prevention (only if sharing is disabled)
        if (!allow_sharing) {
          console.log('[queues:set] Collision prevention enabled - checking for conflicts');
          // Only check active states from OTHER agents - released/completed contacts can be reassigned
          const activeStates: Array<'queued' | 'locked' | 'in_progress'> = ['queued', 'locked', 'in_progress'];
          
          // Batch to avoid parameter limits
          const availableContactIds = availableContacts.map(c => c.id);
          const existingAssignments: any[] = [];
          for (let i = 0; i < availableContactIds.length; i += BATCH_SIZE) {
            const batch = availableContactIds.slice(i, i + BATCH_SIZE);
            const batchResults = await tx.select({
              contactId: agentQueue.contactId,
            })
            .from(agentQueue)
            .where(
              and(
                eq(agentQueue.campaignId, campaignId),
                inArray(agentQueue.contactId, batch),
                inArray(agentQueue.queueState, activeStates),
                sql`${agentQueue.agentId} != ${agent_id}`
              )
            );
            existingAssignments.push(...batchResults);
          }

          console.log('[queues:set] Existing assignments in campaign (other agents):', existingAssignments.length);

          const assignedContactIds = new Set(existingAssignments.map(a => a.contactId));
          availableContacts = availableContacts.filter(c => !assignedContactIds.has(c.id));
          skippedCollision = existingAssignments.length;

          console.log('[queues:set] Available contacts after collision check:', availableContacts.length);
          console.log('[queues:set] Skipped due to collision:', skippedCollision);
        } else {
          console.log('[queues:set] Contact sharing enabled - allowing duplicates across agents');
        }

        const totalSkipped = skippedNoPhone + skippedInvalid + skippedSuppression + skippedGlobalDnc + skippedAccountCap + skippedOutsideBusinessHours + skippedScheduled + skippedCollision;
        console.log('[queues:set] Total skipped:', totalSkipped,
          '(no phone:', skippedNoPhone,
          ', invalid:', skippedInvalid,
          ', suppressed:', skippedSuppression,
          ', global DNC:', skippedGlobalDnc,
          ', account cap:', skippedAccountCap,
          ', outside biz hours:', skippedOutsideBusinessHours,
          ', scheduled:', skippedScheduled,
          ', collision:', skippedCollision, ')');

        // Step 8: Delete existing entries for this agent + contacts (to avoid unique constraint violation)
        if (availableContacts.length > 0) {
          const availableContactIds = availableContacts.map(c => c.id);
          
          console.log('[queues:set] Deleting old entries for', availableContactIds.length, 'contacts');
          // Batch delete to avoid parameter limits
          for (let i = 0; i < availableContactIds.length; i += BATCH_SIZE) {
            const batch = availableContactIds.slice(i, i + BATCH_SIZE);
            await tx.delete(agentQueue)
              .where(
                and(
                  eq(agentQueue.agentId, agent_id),
                  eq(agentQueue.campaignId, campaignId),
                  inArray(agentQueue.contactId, batch)
                )
              );
          }
          
          console.log('[queues:set] Inserting', availableContacts.length, 'new contacts for agent', agent_id);
          await tx.insert(agentQueue)
            .values(
              availableContacts.map(contact => {
                // Get full contact data from map
                const fullContactRow = fullContactMap.get(contact.id);
                const fullContact = fullContactRow?.contacts;
                const fullAccount = fullContactRow?.accounts;
                
                const bestPhone = getBestPhoneForContact({
                  directPhone: fullContact?.directPhone,
                  directPhoneE164: fullContact?.directPhoneE164,
                  mobilePhone: fullContact?.mobilePhone,
                  mobilePhoneE164: fullContact?.mobilePhoneE164,
                  country: fullContact?.country,
                  hqPhone: fullAccount?.mainPhone,
                  hqPhoneE164: fullAccount?.mainPhoneE164,
                  hqCountry: fullAccount?.hqCountry,
                });
                
                return {
                  campaignId,
                  agentId: agent_id,
                  contactId: contact.id,
                  accountId: contact.accountId,
                  dialedNumber: bestPhone.phone || null, // CRITICAL: Store exact dialed number for Telnyx recording sync
                  queueState: 'queued' as const,
                  queuedAt: new Date(),
                  createdBy: userId,
                };
              })
            );
          console.log('[queues:set] Successfully inserted contacts');
        }

        return {
          released,
          assigned: availableContacts.length,
          skipped_no_phone: skippedNoPhone,
          skipped_invalid: skippedInvalid,
          skipped_campaign_suppression: skippedSuppression,
          skipped_global_dnc: skippedGlobalDnc,
          skipped_account_cap: skippedAccountCap,
          skipped_outside_business_hours: skippedOutsideBusinessHours,
          skipped_scheduled_retry: skippedScheduled,
          skipped_due_to_collision: skippedCollision,
          total_skipped: totalSkipped,
          filtered_contacts: filteredContacts,
        };
      });

      return res.json(result);
    } catch (error: any) {
      console.error('[queues:set] Error:', error);
      return res.status(500).json({ 
        error: 'queue_replace_failed', 
        message: error.message 
      });
    }
  }
);

/**
 * POST /api/campaigns/:campaignId/queues/preview
 * Queue Preview - Get count of contacts that would be queued with given filters
 * 
 * This endpoint applies the same filtering logic as queue/set but returns counts only.
 * Use this to show accurate preview before setting the queue.
 * 
 * Body:
 * - agent_id: string (required) - The agent to check for
 * - filters: object (optional) - Filter criteria
 * 
 * Returns:
 * - campaign_audience_count: number - Total contacts in campaign audience
 * - filter_match_count: number - Contacts matching agent's filters
 * - eligible_count: number - Contacts that would be queued (after phone/suppression checks)
 * - breakdown: object - Detailed skip counts
 */
router.post(
  '/campaigns/:campaignId/queues/preview',
  requireAuth,
  requireFeatureFlag('queue_replace_v1'),
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.campaignId;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'unauthorized', message: 'User not authenticated' });
      }

      const { agent_id, filters, scope_by_timezone = false } = req.body;

      if (!agent_id) {
        return res.status(400).json({ error: 'validation_error', message: 'agent_id is required' });
      }

      // RBAC: Agents can only preview their own queue (match queue-set behavior)
      const userRoles = req.user?.roles || [req.user?.role];
      const isAdminOrManager = userRoles.includes('admin') || userRoles.includes('campaign_manager');
      
      if (!isAdminOrManager && agent_id !== userId) {
        return res.status(403).json({ 
          error: 'forbidden', 
          message: 'You can only preview your own queue' 
        });
      }

      // Step 1: Get campaign audience
      const [campaign] = await db.select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ error: 'not_found', message: 'Campaign not found' });
      }

      let campaignContactIds: string[] = [];
      
      // Try snapshot first
      const snapshot = await db.select({
        contactIds: campaignAudienceSnapshots.contactIds,
      })
      .from(campaignAudienceSnapshots)
      .where(eq(campaignAudienceSnapshots.campaignId, campaignId))
      .orderBy(sql`${campaignAudienceSnapshots.createdAt} DESC`)
      .limit(1);

      if (snapshot[0]?.contactIds && snapshot[0].contactIds.length > 0) {
        campaignContactIds = snapshot[0].contactIds;
      } else if (campaign.audienceRefs) {
        // Resolve audience dynamically
        const audienceRefs = campaign.audienceRefs as any;
        const uniqueContactIds = new Set<string>();
        
        if (audienceRefs.filterGroup) {
          const filterSQL = buildFilterQuery(audienceRefs.filterGroup as FilterGroup, contacts);
          if (filterSQL) {
            const audienceContacts = await db.select({ id: contacts.id })
              .from(contacts)
              .where(filterSQL);
            audienceContacts.forEach(c => uniqueContactIds.add(c.id));
          }
        }
        
        if (audienceRefs.lists && Array.isArray(audienceRefs.lists)) {
          for (const listId of audienceRefs.lists) {
            const [list] = await db.select()
              .from(lists)
              .where(eq(lists.id, listId))
              .limit(1);
            if (list?.recordIds?.length > 0) {
              const resolvedIds = await resolveListToContactIds(list as any, db, '[queues:preview]');
              resolvedIds.forEach((id: string) => uniqueContactIds.add(id));
            }
          }
        }

        if (audienceRefs.selectedLists && Array.isArray(audienceRefs.selectedLists)) {
          for (const listId of audienceRefs.selectedLists) {
            const [list] = await db.select()
              .from(lists)
              .where(eq(lists.id, listId))
              .limit(1);
            if (list?.recordIds?.length > 0) {
              const resolvedIds = await resolveListToContactIds(list as any, db, '[queues:preview]');
              resolvedIds.forEach((id: string) => uniqueContactIds.add(id));
            }
          }
        }

        if (audienceRefs.segments && Array.isArray(audienceRefs.segments)) {
          for (const segmentId of audienceRefs.segments) {
            const [segment] = await db.select()
              .from(segments)
              .where(eq(segments.id, segmentId))
              .limit(1);
            if (segment?.definitionJson) {
              const filterSQL = buildFilterQuery(segment.definitionJson as FilterGroup, contacts);
              if (filterSQL) {
                const segmentContacts = await db.select({ id: contacts.id })
                  .from(contacts)
                  .where(filterSQL);
                segmentContacts.forEach(c => uniqueContactIds.add(c.id));
              }
            }
          }
        }
        
        campaignContactIds = Array.from(uniqueContactIds);
      }

      const campaignAudienceCount = campaignContactIds.length;

      if (campaignAudienceCount === 0) {
        return res.json({
          campaign_audience_count: 0,
          filter_match_count: 0,
          eligible_count: 0,
          breakdown: {
            no_phone: 0,
            invalid: 0,
            suppressed: 0,
            dnc: 0,
            scheduled: 0,
            collision: 0,
          },
        });
      }

      // Step 2: Apply agent's filters within campaign audience
      const BATCH_SIZE = 500;
      let filteredContacts: { id: string; accountId: string | null }[] = [];
      
      const filterPart = filters?.conditions?.length > 0 
        ? buildFilterQuery(filters as FilterGroup, contacts) 
        : undefined;
      
      for (let i = 0; i < campaignContactIds.length; i += BATCH_SIZE) {
        const batch = campaignContactIds.slice(i, i + BATCH_SIZE);
        const whereConditions: any[] = [inArray(contacts.id, batch)];
        if (filterPart) {
          whereConditions.push(filterPart);
        }
        
        const batchResults = await db.select({
          id: contacts.id,
          accountId: contacts.accountId,
        })
        .from(contacts)
        .where(and(...whereConditions));
        
        filteredContacts.push(...batchResults);
      }

      const filterMatchCount = filteredContacts.length;

      // Step 3: Count phone validation (sample-based for performance)
      const sampleSize = Math.min(filteredContacts.length, 200);
      const sampleIds = filteredContacts.slice(0, sampleSize).map(c => c.id);
      
      let hasPhoneCount = 0;
      if (sampleIds.length > 0) {
        const sampleContacts = await db
          .select()
          .from(contacts)
          .leftJoin(accounts, eq(contacts.accountId, accounts.id))
          .where(inArray(contacts.id, sampleIds));
        
        for (const row of sampleContacts) {
          const contact = row.contacts;
          const account = row.accounts;
          const bestPhone = getBestPhoneForContact({
            directPhone: contact.directPhone,
            directPhoneE164: contact.directPhoneE164,
            mobilePhone: contact.mobilePhone,
            mobilePhoneE164: contact.mobilePhoneE164,
            country: contact.country,
            hqPhone: account?.mainPhone,
            hqPhoneE164: account?.mainPhoneE164,
            hqCountry: account?.hqCountry,
          });
          if (bestPhone.phone) hasPhoneCount++;
        }
      }

      const phoneRate = sampleSize > 0 ? hasPhoneCount / sampleSize : 0;
      const estimatedWithPhone = Math.round(filterMatchCount * phoneRate);
      const estimatedNoPhone = filterMatchCount - estimatedWithPhone;

      // Step 4: Timezone estimation (sample-based) when scope_by_timezone is enabled
      let timezoneBreakdown: any = undefined;
      let estimatedEligible = estimatedWithPhone;

      if (scope_by_timezone && sampleIds.length > 0) {
        const sampleContacts = await db
          .select({
            timezone: contacts.timezone,
            state: contacts.state,
            stateAbbr: contacts.stateAbbr,
            country: contacts.country,
          })
          .from(contacts)
          .where(inArray(contacts.id, sampleIds));

        const campaignBizHours = campaign.businessHoursConfig as BusinessHoursConfig | null;
        const now = new Date();
        let inBusinessHoursCount = 0;

        for (const contact of sampleContacts) {
          const contactTimezoneInfo = {
            timezone: contact.timezone || undefined,
            state: contact.state || contact.stateAbbr || undefined,
            country: contact.country || undefined,
          };

          let bizConfig: BusinessHoursConfig;
          if (campaignBizHours && campaignBizHours.enabled) {
            bizConfig = { ...campaignBizHours };
            if (bizConfig.respectContactTimezone) {
              const contactTz = detectContactTimezone(contactTimezoneInfo);
              if (contactTz) {
                bizConfig.timezone = contactTz;
                bizConfig.respectContactTimezone = false;
              }
            }
          } else {
            bizConfig = getBusinessHoursForCountry(contact.country);
            const contactTz = detectContactTimezone(contactTimezoneInfo);
            if (contactTz) {
              bizConfig.timezone = contactTz;
              bizConfig.respectContactTimezone = false;
            }
          }

          if (isWithinBusinessHours(bizConfig, undefined, now)) {
            inBusinessHoursCount++;
          }
        }

        const bizHoursRate = sampleContacts.length > 0 ? inBusinessHoursCount / sampleContacts.length : 0;
        const estimatedInBusinessHours = Math.round(estimatedWithPhone * bizHoursRate);
        const estimatedOutsideBusinessHours = estimatedWithPhone - estimatedInBusinessHours;
        estimatedEligible = estimatedInBusinessHours;

        timezoneBreakdown = {
          estimated_in_business_hours: estimatedInBusinessHours,
          estimated_outside_business_hours: estimatedOutsideBusinessHours,
          sample_biz_hours_rate: Math.round(bizHoursRate * 100),
        };
      }

      return res.json({
        campaign_audience_count: campaignAudienceCount,
        filter_match_count: filterMatchCount,
        eligible_count: estimatedEligible,
        is_upper_bound: true,
        scope_by_timezone,
        breakdown: {
          no_phone: estimatedNoPhone,
          ...(timezoneBreakdown || {}),
          note: scope_by_timezone
            ? 'Upper bound estimate. Contacts outside business hours in their local timezone will be excluded.'
            : 'Upper bound estimate. Actual count may be lower due to: suppression lists, Do Not Call registry, account caps, scheduled retries, and contacts already assigned to other agents.',
        },
      });
    } catch (error: any) {
      console.error('[queues:preview] Error:', error);
      return res.status(500).json({ 
        error: 'preview_failed', 
        message: error.message 
      });
    }
  }
);

/**
 * POST /api/campaigns/:campaignId/queues/filter-count
 * Campaign-scoped Filter Count - Get count of contacts matching filters WITHIN campaign audience
 * 
 * This is a lightweight endpoint for real-time filter count updates in the agent console.
 * It only counts contacts that are both in the campaign audience AND match the filters.
 * 
 * Body:
 * - filters: object (optional) - Filter criteria
 * 
 * Returns:
 * - campaign_audience_count: number - Total contacts in campaign audience
 * - filter_match_count: number - Contacts matching filters within campaign audience
 */
router.post(
  '/campaigns/:campaignId/queues/filter-count',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.campaignId;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'unauthorized', message: 'User not authenticated' });
      }

      const { filters } = req.body;

      // Step 1: Get campaign audience
      const [campaign] = await db.select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ error: 'not_found', message: 'Campaign not found' });
      }

      let campaignContactIds: string[] = [];
      
      // Try snapshot first
      const snapshot = await db.select({
        contactIds: campaignAudienceSnapshots.contactIds,
      })
      .from(campaignAudienceSnapshots)
      .where(eq(campaignAudienceSnapshots.campaignId, campaignId))
      .orderBy(sql`${campaignAudienceSnapshots.createdAt} DESC`)
      .limit(1);

      if (snapshot[0]?.contactIds && snapshot[0].contactIds.length > 0) {
        campaignContactIds = snapshot[0].contactIds;
      } else if (campaign.audienceRefs) {
        // Resolve audience dynamically
        const audienceRefs = campaign.audienceRefs as any;
        const uniqueContactIds = new Set<string>();
        
        // Check if this is a filterGroup-only campaign with no conditions (means "all contacts")
        const hasFilterGroup = !!audienceRefs.filterGroup;
        const hasLists = (audienceRefs.lists?.length > 0) || (audienceRefs.selectedLists?.length > 0);
        const hasSegments = audienceRefs.segments?.length > 0;
        const filterGroupData = hasFilterGroup ? audienceRefs.filterGroup as FilterGroup : null;
        const filterGroupHasConditions = filterGroupData?.conditions?.length > 0;
        
        // If filterGroup with no conditions AND no lists/segments, this means "all contacts"
        if (hasFilterGroup && !filterGroupHasConditions && !hasLists && !hasSegments) {
          // Fetch all contact IDs - this represents "select all" audience
          const allContacts = await db.select({ id: contacts.id }).from(contacts);
          allContacts.forEach(c => uniqueContactIds.add(c.id));
        } else {
          // Normal case: apply filterGroup conditions if present
          if (filterGroupData && filterGroupHasConditions) {
            const filterSQL = buildFilterQuery(filterGroupData, contacts);
            if (filterSQL) {
              const audienceContacts = await db.select({ id: contacts.id })
                .from(contacts)
                .where(filterSQL);
              audienceContacts.forEach(c => uniqueContactIds.add(c.id));
            }
          }
        }
        
        if (audienceRefs.lists && Array.isArray(audienceRefs.lists)) {
          for (const listId of audienceRefs.lists) {
            const [list] = await db.select()
              .from(lists)
              .where(eq(lists.id, listId))
              .limit(1);
            if (list?.recordIds?.length > 0) {
              const resolvedIds = await resolveListToContactIds(list as any, db, '[queues:filter-count]');
              resolvedIds.forEach((id: string) => uniqueContactIds.add(id));
            }
          }
        }

        if (audienceRefs.selectedLists && Array.isArray(audienceRefs.selectedLists)) {
          for (const listId of audienceRefs.selectedLists) {
            const [list] = await db.select()
              .from(lists)
              .where(eq(lists.id, listId))
              .limit(1);
            if (list?.recordIds?.length > 0) {
              const resolvedIds = await resolveListToContactIds(list as any, db, '[queues:filter-count]');
              resolvedIds.forEach((id: string) => uniqueContactIds.add(id));
            }
          }
        }

        if (audienceRefs.segments && Array.isArray(audienceRefs.segments)) {
          for (const segmentId of audienceRefs.segments) {
            const [segment] = await db.select()
              .from(segments)
              .where(eq(segments.id, segmentId))
              .limit(1);
            if (segment?.definitionJson) {
              const segmentFilter = segment.definitionJson as FilterGroup;
              // Only apply filter if segment has conditions
              if (segmentFilter.conditions && segmentFilter.conditions.length > 0) {
                const filterSQL = buildFilterQuery(segmentFilter, contacts);
                if (filterSQL) {
                  const segmentContacts = await db.select({ id: contacts.id })
                    .from(contacts)
                    .where(filterSQL);
                  segmentContacts.forEach(c => uniqueContactIds.add(c.id));
                }
              }
            }
          }
        }
        
        campaignContactIds = Array.from(uniqueContactIds);
      }

      const campaignAudienceCount = campaignContactIds.length;

      // If no audience, return early with zeros
      if (campaignAudienceCount === 0) {
        return res.json({
          campaign_audience_count: 0,
          filter_match_count: 0,
        });
      }

      // If no agent filters provided (or empty conditions), return audience count as filter match
      if (!filters || !filters.conditions || filters.conditions.length === 0) {
        return res.json({
          campaign_audience_count: campaignAudienceCount,
          filter_match_count: campaignAudienceCount,
        });
      }

      // Step 2: Apply agent filters within campaign audience
      const BATCH_SIZE = 500;
      let filterMatchCount = 0;

      console.log('[queues:filter-count] ========== FILTER COUNT DEBUGGING ==========');
      console.log('[queues:filter-count] Campaign audience size:', campaignAudienceCount);
      console.log('[queues:filter-count] Filter conditions:', filters?.conditions?.length || 0);
      if (filters?.conditions) {
        filters.conditions.forEach((condition: any, idx: number) => {
          console.log(`[queues:filter-count] Condition ${idx + 1}:`, {
            field: condition.field,
            operator: condition.operator,
            values: condition.values,
            valuesLength: condition.values?.length || 0
          });
        });
      }

      const filterPart = buildFilterQuery(filters as FilterGroup, contacts);
      console.log('[queues:filter-count] Filter SQL generated:', filterPart ? 'yes' : 'no');

      for (let i = 0; i < campaignContactIds.length; i += BATCH_SIZE) {
        const batch = campaignContactIds.slice(i, i + BATCH_SIZE);
        const whereConditions: any[] = [inArray(contacts.id, batch)];
        if (filterPart) {
          whereConditions.push(filterPart);
        }
        
        const batchResults = await db.select({
          count: sql<number>`count(*)::int`,
        })
        .from(contacts)
        .where(and(...whereConditions));
        
        filterMatchCount += batchResults[0]?.count || 0;
      }

      console.log('[queues:filter-count] Final results:', {
        campaign_audience_count: campaignAudienceCount,
        filter_match_count: filterMatchCount,
        percentage: campaignAudienceCount > 0 ? ((filterMatchCount / campaignAudienceCount) * 100).toFixed(1) + '%' : 'N/A'
      });
      console.log('[queues:filter-count] ========================================');

      return res.json({
        campaign_audience_count: campaignAudienceCount,
        filter_match_count: filterMatchCount,
      });
    } catch (error: any) {
      console.error('[queues:filter-count] Error:', error);
      return res.status(500).json({ 
        error: 'filter_count_failed', 
        message: error.message 
      });
    }
  }
);

/**
 * POST /api/campaigns/:campaignId/queues/clear
 * Clear My Queue - Release agent's queued/locked items for this campaign
 * 
 * Body:
 * - agent_id: string (required) - The agent whose queue to clear
 * 
 * Returns:
 * - released: number - Count of released queue items
 */
router.post(
  '/campaigns/:campaignId/queues/clear',
  requireAuth,
  requireFeatureFlag('queue_replace_v1'),
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.campaignId;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'unauthorized', message: 'User not authenticated' });
      }

      // Validate request body
      const validation = queueClearSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'validation_error', 
          details: validation.error.errors 
        });
      }

      const { agent_id } = validation.data;

      // RBAC: Agents can only clear their own queue
      const userRoles = req.user?.roles || [req.user?.role];
      const isAdminOrManager = userRoles.includes('admin') || userRoles.includes('campaign_manager');
      
      if (!isAdminOrManager && agent_id !== userId) {
        return res.status(403).json({ 
          error: 'forbidden', 
          message: 'You can only clear your own queue' 
        });
      }

      // Call the PostgreSQL function
      const result = await db.execute(sql`
        SELECT clear_my_queue(
          ${campaignId}::varchar,
          ${agent_id}::varchar,
          ${userId}::varchar
        ) AS released
      `);

      const released = result.rows[0]?.released || 0;

      return res.json({ released });
    } catch (error: any) {
      console.error('[queues:clear] Error:', error);
      return res.status(500).json({ 
        error: 'clear_my_queue_failed', 
        message: error.message 
      });
    }
  }
);

/**
 * POST /api/campaigns/:campaignId/queues/clear_all
 * Clear All Queues (Admin Only) - Release all queued/locked items in this campaign
 * 
 * Returns:
 * - released: number - Count of released queue items across all agents
 */
router.post(
  '/campaigns/:campaignId/queues/clear_all',
  requireAuth,
  requireRole('admin', 'campaign_manager'),
  requireFeatureFlag('queue_replace_v1'),
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.campaignId;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'unauthorized', message: 'User not authenticated' });
      }

      // Call the PostgreSQL function
      const result = await db.execute(sql`
        SELECT clear_all_queues(
          ${campaignId}::varchar,
          ${userId}::varchar
        ) AS released
      `);

      const released = result.rows[0]?.released || 0;

      return res.json({ released });
    } catch (error: any) {
      console.error('[queues:clear_all] Error:', error);
      return res.status(500).json({ 
        error: 'clear_all_queues_failed', 
        message: error.message 
      });
    }
  }
);

/**
 * GET /api/campaigns/:campaignId/queues/stats
 * Get Queue Statistics - Get current queue stats for the campaign
 * 
 * Query params:
 * - agent_id: string (optional) - Filter by specific agent
 * 
 * Returns:
 * - total: number - Total queue items
 * - queued: number - Items in queued state
 * - locked: number - Items in locked state
 * - in_progress: number - Items in in_progress state
 * - released: number - Items in released state
 */
router.get(
  '/campaigns/:campaignId/queues/stats',
  requireAuth,
  requireFeatureFlag('queue_replace_v1'),
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.campaignId;
      const agentId = req.query.agent_id as string | undefined;

      let query = sql`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE queue_state = 'queued') as queued,
          COUNT(*) FILTER (WHERE queue_state = 'locked') as locked,
          COUNT(*) FILTER (WHERE queue_state = 'in_progress') as in_progress,
          COUNT(*) FILTER (WHERE queue_state = 'released') as released
        FROM agent_queue
        WHERE campaign_id = ${campaignId}::varchar
      `;

      if (agentId) {
        query = sql`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE queue_state = 'queued') as queued,
            COUNT(*) FILTER (WHERE queue_state = 'locked') as locked,
            COUNT(*) FILTER (WHERE queue_state = 'in_progress') as in_progress,
            COUNT(*) FILTER (WHERE queue_state = 'released') as released
          FROM agent_queue
          WHERE campaign_id = ${campaignId}::varchar AND agent_id = ${agentId}::varchar
        `;
      }

      const result = await db.execute(query);
      const stats = result.rows[0] || { total: 0, queued: 0, locked: 0, in_progress: 0, released: 0 };

      return res.json(stats);
    } catch (error: any) {
      console.error('[queues:stats] Error:', error);
      return res.status(500).json({ 
        error: 'queue_stats_failed', 
        message: error.message 
      });
    }
  }
);

/**
 * GET /api/campaigns/:campaignId/queues/related-contacts/:contactId
 * Get other contacts from the same account that are in the agent's queue
 * 
 * Returns:
 * - Array of contacts from the same account in the agent's queue
 */
router.get(
  '/campaigns/:campaignId/queues/related-contacts/:contactId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { campaignId, contactId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'unauthorized' });
      }

      // First, get the account ID for the current contact
      const currentContact = await db
        .select({ accountId: contacts.accountId })
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);

      if (currentContact.length === 0 || !currentContact[0].accountId) {
        return res.json([]);
      }

      const accountId = currentContact[0].accountId;

      // Get other contacts from the same account in the agent's queue
      const relatedContacts = await db
        .select({
          id: contacts.id,
          fullName: contacts.fullName,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          directPhone: contacts.directPhone,
          mobilePhone: contacts.mobilePhone,
          jobTitle: contacts.jobTitle,
          seniorityLevel: contacts.seniorityLevel,
          queueState: agentQueue.queueState,
          queueId: agentQueue.id,
          priority: agentQueue.priority,
          scheduledFor: agentQueue.scheduledFor,
        })
        .from(agentQueue)
        .innerJoin(contacts, eq(agentQueue.contactId, contacts.id))
        .where(
          and(
            eq(agentQueue.agentId, userId),
            eq(agentQueue.campaignId, campaignId),
            eq(agentQueue.accountId, accountId),
            sql`${agentQueue.contactId} != ${contactId}`, // Exclude current contact
            inArray(agentQueue.queueState, ['queued', 'in_progress'])
          )
        )
        .orderBy(agentQueue.priority, agentQueue.queuedAt);

      res.json(relatedContacts);
    } catch (error) {
      console.error('Error fetching related contacts:', error);
      res.status(500).json({ error: 'Failed to fetch related contacts' });
    }
  }
);

/**
 * GET /api/campaigns/:campaignId/queues/debug
 * Debug endpoint to diagnose queue filtering issues
 *
 * Returns:
 * - campaign_info: Campaign configuration
 * - audience_info: Details about campaign audience (snapshots, refs)
 * - sample_contacts: First 5 contacts in audience with their field values
 */
router.get(
  '/campaigns/:campaignId/queues/debug',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.campaignId;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'unauthorized', message: 'User not authenticated' });
      }

      // Get campaign
      const [campaign] = await db.select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ error: 'not_found', message: 'Campaign not found' });
      }

      // Check audience snapshot
      const snapshot = await db.select({
        id: campaignAudienceSnapshots.id,
        contactIds: campaignAudienceSnapshots.contactIds,
        createdAt: campaignAudienceSnapshots.createdAt,
      })
      .from(campaignAudienceSnapshots)
      .where(eq(campaignAudienceSnapshots.campaignId, campaignId))
      .orderBy(sql`${campaignAudienceSnapshots.createdAt} DESC`)
      .limit(1);

      const hasSnapshot = snapshot.length > 0 && snapshot[0].contactIds && snapshot[0].contactIds.length > 0;
      const snapshotSize = hasSnapshot ? snapshot[0].contactIds!.length : 0;

      // Parse audienceRefs
      const audienceRefs = campaign.audienceRefs as any || {};
      const allListIds = [...(audienceRefs.lists || []), ...(audienceRefs.selectedLists || [])];
      const listDetails: any[] = [];
      for (const listId of allListIds) {
        const [list] = await db.select({
          id: lists.id,
          name: lists.name,
          entityType: lists.entityType,
          recordCount: sql<number>`array_length(${lists.recordIds}, 1)`,
        }).from(lists).where(eq(lists.id, listId)).limit(1);
        if (list) listDetails.push(list);
      }
      const audienceRefsInfo = {
        hasFilterGroup: !!audienceRefs.filterGroup,
        filterGroupConditions: audienceRefs.filterGroup?.conditions?.length || 0,
        lists: audienceRefs.lists || [],
        selectedLists: audienceRefs.selectedLists || [],
        segments: audienceRefs.segments || [],
        listDetails,
      };

      // Get sample contacts if audience exists
      let sampleContacts: any[] = [];
      let campaignContactIds: string[] = [];

      if (hasSnapshot) {
        campaignContactIds = snapshot[0].contactIds!.slice(0, 100);
      }

      if (campaignContactIds.length > 0) {
        sampleContacts = await db.select({
          id: contacts.id,
          fullName: contacts.fullName,
          jobTitle: contacts.jobTitle,
          seniorityLevel: contacts.seniorityLevel,
          department: contacts.department,
          directPhone: contacts.directPhone,
          mobilePhone: contacts.mobilePhone,
          accountId: contacts.accountId,
        })
        .from(contacts)
        .where(inArray(contacts.id, campaignContactIds.slice(0, 10)))
        .limit(10);
      }

      // Get unique job titles in audience (for debugging filter values)
      let uniqueJobTitles: string[] = [];
      let uniqueSeniorityLevels: string[] = [];
      if (campaignContactIds.length > 0) {
        const jobTitleResults = await db.selectDistinct({
          jobTitle: contacts.jobTitle,
        })
        .from(contacts)
        .where(inArray(contacts.id, campaignContactIds))
        .limit(20);
        uniqueJobTitles = jobTitleResults.map(r => r.jobTitle).filter(Boolean) as string[];

        const seniorityResults = await db.selectDistinct({
          seniorityLevel: contacts.seniorityLevel,
        })
        .from(contacts)
        .where(inArray(contacts.id, campaignContactIds))
        .limit(20);
        uniqueSeniorityLevels = seniorityResults.map(r => r.seniorityLevel).filter(Boolean) as string[];
      }

      return res.json({
        campaign_info: {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          dialMode: campaign.dialMode,
        },
        audience_info: {
          has_snapshot: hasSnapshot,
          snapshot_size: snapshotSize,
          snapshot_created_at: snapshot[0]?.createdAt || null,
          audience_refs: audienceRefsInfo,
        },
        sample_contacts: sampleContacts,
        available_filter_values: {
          job_titles_sample: uniqueJobTitles,
          seniority_levels_sample: uniqueSeniorityLevels,
          note: 'Use these values for testing filters - they are actual values from contacts in this campaign audience'
        },
        tips: {
          if_zero_results: [
            '1. Check if campaign_audience_count is 0 - you need to configure campaign audience first',
            '2. Check if filter values match the available_filter_values samples (case-sensitive for equals, case-insensitive for contains)',
            '3. Ensure filter conditions have values - empty values array will be skipped',
            '4. Check server logs for [FILTER_BUILDER] messages for detailed debugging'
          ]
        }
      });
    } catch (error: any) {
      console.error('[queues:debug] Error:', error);
      return res.status(500).json({
        error: 'debug_failed',
        message: error.message
      });
    }
  }
);

/**
 * POST /campaigns/:campaignId/queues/backfill-phones
 *
 * Backfill E164-normalized phone numbers for contacts in this campaign's queue
 * that have raw phone data (direct_phone / mobile_phone) but NULL E164 fields.
 * Uses country-aware normalization (libphonenumber-js) with heuristic fallback.
 *
 * This fixes the "Missing Phone" issue caused by imports where phone normalization
 * failed (e.g., missing/wrong country field at import time).
 */
router.post(
  '/campaigns/:campaignId/queues/backfill-phones',
  requireAuth,
  async (req: Request, res: Response) => {
    const { campaignId } = req.params;
    const dryRun = req.query.dryRun === 'true';

    try {
      // Import normalization functions
      const { formatPhoneWithCountryCode } = await import('../lib/phone-formatter');
      const { normalizeToE164, isValidE164, isTollFreeOrServiceNumber } = await import('../lib/phone-utils');

      // Find contacts in this campaign's queue that have raw phone data but no E164
      const result = await db.execute(sql`
        SELECT DISTINCT c.id,
          c.direct_phone,
          c.direct_phone_e164,
          c.mobile_phone,
          c.mobile_phone_e164,
          c.dialing_phone_e164,
          c.country,
          a.hq_phone,
          a.hq_country
        FROM campaign_queue cq
        JOIN contacts c ON c.id = cq.contact_id
        LEFT JOIN accounts a ON a.id = c.account_id
        WHERE cq.campaign_id = ${campaignId}
          AND cq.status = 'queued'
          AND c.direct_phone_e164 IS NULL
          AND c.mobile_phone_e164 IS NULL
          AND (
            (c.direct_phone IS NOT NULL AND c.direct_phone != '')
            OR (c.mobile_phone IS NOT NULL AND c.mobile_phone != '')
            OR (a.hq_phone IS NOT NULL AND a.hq_phone != '')
          )
        LIMIT 100000
      `);

      const rows = result.rows as any[];
      if (rows.length === 0) {
        return res.json({
          message: 'No contacts need phone backfill',
          total: 0,
          updated: 0,
        });
      }

      // Helper: normalize a raw phone with country-aware + heuristic fallback
      function normalize(phone: string | null, country: string | null | undefined): string | null {
        if (!phone || !phone.trim()) return null;
        const e164 = formatPhoneWithCountryCode(phone, country) || normalizeToE164(phone);
        if (!e164 || !isValidE164(e164)) return null;
        if (isTollFreeOrServiceNumber(e164)) return null;
        return e164;
      }

      let updated = 0;
      let skippedNoPhone = 0;
      const batchSize = 500;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const updates: Array<{ id: string; directE164: string | null; mobileE164: string | null; dialingE164: string | null }> = [];

        for (const row of batch) {
          const country = row.country || undefined;
          const directE164 = normalize(row.direct_phone, country);
          const mobileE164 = normalize(row.mobile_phone, country);

          // If both still null, try HQ phone as last resort for dialing_phone_e164
          const hqE164 = (!directE164 && !mobileE164)
            ? normalize(row.hq_phone, row.hq_country || country)
            : null;

          const dialingE164 = directE164 || mobileE164 || hqE164;

          if (!directE164 && !mobileE164 && !dialingE164) {
            skippedNoPhone++;
            continue;
          }

          updates.push({ id: row.id, directE164, mobileE164, dialingE164 });
        }

        if (updates.length > 0 && !dryRun) {
          // Use a single SQL UPDATE with CASE for efficiency
          // Process in sub-batches of 200 to avoid SQL size limits
          const subBatchSize = 200;
          for (let j = 0; j < updates.length; j += subBatchSize) {
            const subBatch = updates.slice(j, j + subBatchSize);
            const ids = subBatch.map(u => u.id);

            // Build individual UPDATE statements batched in a transaction
            for (const update of subBatch) {
              await db.execute(sql`
                UPDATE contacts
                SET direct_phone_e164 = COALESCE(direct_phone_e164, ${update.directE164}),
                    mobile_phone_e164 = COALESCE(mobile_phone_e164, ${update.mobileE164}),
                    dialing_phone_e164 = COALESCE(dialing_phone_e164, ${update.dialingE164}),
                    updated_at = NOW()
                WHERE id = ${update.id}
                  AND direct_phone_e164 IS NULL
                  AND mobile_phone_e164 IS NULL
              `);
            }
          }
          updated += updates.length;
        } else if (dryRun) {
          updated += updates.length;
        }

        // Log progress for large batches
        if (i > 0 && i % 5000 === 0) {
          console.log(`[Phone Backfill] Progress: ${i}/${rows.length} processed, ${updated} updated`);
        }
      }

      console.log(`[Phone Backfill] Campaign ${campaignId}: ${updated} contacts updated, ${skippedNoPhone} skipped (no normalizable phone), ${rows.length} total processed${dryRun ? ' (DRY RUN)' : ''}`);

      return res.json({
        message: dryRun ? 'Dry run complete' : 'Phone backfill complete',
        total: rows.length,
        updated,
        skippedNoPhone,
        dryRun,
      });
    } catch (error: any) {
      console.error('[Phone Backfill] Error:', error);
      return res.status(500).json({
        error: 'backfill_failed',
        message: error.message,
      });
    }
  }
);

export default router;
