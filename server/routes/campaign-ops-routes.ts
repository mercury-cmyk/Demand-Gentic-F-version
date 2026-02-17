
import { Router, type Request, type Response } from 'express';
import { db, pool } from '../db';
import { sql, and, eq, notInArray, inArray } from 'drizzle-orm';
import { campaignQueue, contacts, accounts, campaigns, lists } from '@shared/schema';
import { requireAuth } from '../auth';
import { z } from 'zod';
import * as crypto from 'crypto';
import { seedQueuePriorities, analyzeCampaignTimezones } from '../services/campaign-timezone-analyzer';

const router = Router();

const syncQueueSchema = z.object({
  link_accounts: z.boolean().optional().default(true),
});

router.post(
  '/campaigns/:id/ops/sync-queue',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.id;
      const { link_accounts } = syncQueueSchema.parse(req.body);

      // 1. Get campaign and its lists
      const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
      const campaign = campaignResult[0];

      if (!campaign) {
        return res.status(404).json({ error: 'not_found', message: 'Campaign not found' });
      }

      // Check audience refs for lists
      let listIds: string[] = [];
      const audience = campaign.audienceRefs as any;
      if (audience?.lists && Array.isArray(audience.lists)) {
        listIds = audience.lists;
      }

      // Also support legacy list_id if it exists? (schema check needed, but let's assume audience_refs is the way)
      
      if (listIds.length === 0) {
        return res.status(400).json({ error: 'no_lists', message: 'Campaign has no lists assigned' });
      }

      const results: Record<string, any> = {
        contacts_processed: 0,
        accounts_linked: 0,
        added_to_queue: 0,
        skipped_no_account: 0,
        errors: 0,
        timezoneAnalysis: null,
      };

      // 2. Process each list
      for (const listId of listIds) {
        // Get record IDs from list
        const listRes = await db.select().from(lists).where(eq(lists.id, listId));
        const list = listRes[0];
        
        if (!list || !list.recordIds || !Array.isArray(list.recordIds) || list.recordIds.length === 0) {
            continue;
        }

        // Handle account-type lists: resolve account IDs to contact IDs
        let contactIds: string[];
        if (list.entityType === 'account') {
          console.log(`[sync-queue] List ${listId} is account-type with ${list.recordIds.length} account IDs — resolving to contacts`);
          const resolvedContacts: string[] = [];
          const batchSize = 1000;
          for (let i = 0; i < list.recordIds.length; i += batchSize) {
            const batch = list.recordIds.slice(i, i + batchSize);
            const accountContacts = await db.select({ id: contacts.id })
              .from(contacts)
              .where(inArray(contacts.accountId, batch));
            accountContacts.forEach(c => resolvedContacts.push(c.id));
          }
          contactIds = resolvedContacts;
          console.log(`[sync-queue] Resolved ${list.recordIds.length} account IDs -> ${contactIds.length} contact IDs`);
        } else {
          contactIds = list.recordIds as string[];
        }
        results.contacts_processed += contactIds.length;

        // 3. Link Accounts (if requested)
        if (link_accounts) {
           // We need to find contacts with null account_id
           // We can do this in batches or logic
           
           // Fetch contacts without account_id
           const brokenContacts = await pool.query(`
             SELECT id, company_norm
             FROM contacts 
             WHERE id = ANY($1) AND account_id IS NULL
           `, [contactIds]);

           for (const contact of brokenContacts.rows) {
               const companyName = contact.company_norm;
               if (!companyName) continue;

               // Try to find account
               // Normalize company name slightly if needed, or rely on company_norm matching account name/normalized
               // Accounts has name, name_normalized
               const account = await pool.query(`
                  SELECT id FROM accounts 
                  WHERE name_normalized ILIKE $1 OR name ILIKE $1 
                  LIMIT 1
               `, [companyName]);

               if (account.rows.length > 0) {
                   await pool.query(`
                      UPDATE contacts SET account_id = $1 WHERE id = $2
                   `, [account.rows[0].id, contact.id]);
                   results.accounts_linked++;
               }
           }
        }

        // 4. Add to Queue
        // Find contacts from list that are well-formed (have account_id) AND not in queue
        // First get current queue contact IDs
        const currentQueue = await db.select({ contactId: campaignQueue.contactId })
                                     .from(campaignQueue)
                                     .where(eq(campaignQueue.campaignId, campaignId));

        const queuedSet = new Set(currentQueue.map(q => q.contactId));
        
        // Contacts to add = contactIds - queuedSet
        const toAdd = contactIds.filter(id => !queuedSet.has(id));
        
        if (toAdd.length === 0) continue;

        // Fetch valid contacts (must have account_id)
        // Using pool for raw query flexibility with ANY
        const validContacts = await pool.query(`
            SELECT id, account_id 
            FROM contacts 
            WHERE id = ANY($1) AND account_id IS NOT NULL
        `, [toAdd]);

        // Keep track of skipped
        results.skipped_no_account += (toAdd.length - validContacts.rows.length);

        if (validContacts.rows.length > 0) {
            // Bulk insert
            const values: any[] = [];
            const placeholders: string[] = [];
            let pIdx = 1;

            for (const c of validContacts.rows) {
                placeholders.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, 'queued', 100, NOW(), NOW())`);
                values.push(crypto.randomUUID(), campaignId, c.id, c.account_id);
                pIdx += 4;
            }

            // Insert in batches of say 500 to avoid parameter limit
            const batchSize = 1000; // items, so 4000 params. PG limit is ~65k params. 
            // 4 params per row. 1000 rows = 4000 params. Safe.

            for (let i = 0; i < placeholders.length; i += batchSize) {
                const batchPlaceholders = placeholders.slice(i, i + batchSize).join(', ');
                const batchValues = values.slice(i * 4, (i + batchSize) * 4);
                
                if (batchPlaceholders) {
                    await pool.query(`
                        INSERT INTO campaign_queue (id, campaign_id, contact_id, account_id, status, priority, created_at, updated_at)
                        VALUES ${batchPlaceholders}
                        ON CONFLICT (campaign_id, contact_id) DO NOTHING
                    `, batchValues);
                }
            }
            results.added_to_queue += validContacts.rows.length;
        }
      }

      // Pre-seed timezone-based priorities so active-timezone contacts are pulled first
      if (results.added_to_queue > 0) {
        try {
          await seedQueuePriorities(campaignId);
          results.timezoneAnalysis = await analyzeCampaignTimezones(campaignId);
        } catch (err) {
          console.error('Error seeding timezone priorities:', err);
        }
      }

      res.json(results);
    } catch (error: any) {
      console.error('Error syncing queue:', error);
      res.status(500).json({ error: 'internal_server_error', message: error.message });
    }
  }
);

// GET /api/campaigns/:id/ops/timezone-analysis
// Returns timezone distribution and business hours status for a campaign's queued contacts
router.get(
  '/campaigns/:id/ops/timezone-analysis',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.id;
      const analysis = await analyzeCampaignTimezones(campaignId);
      res.json(analysis);
    } catch (error: any) {
      console.error('Error analyzing timezones:', error);
      res.status(500).json({ error: 'internal_server_error', message: error.message });
    }
  }
);

// GET /api/campaigns/:id/ops/eligibility-breakdown
// Returns why queued contacts are/aren't currently callable for AI campaigns.
router.get(
  '/campaigns/:id/ops/eligibility-breakdown',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const campaignId = req.params.id;

      const [campaign] = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
          dialMode: campaigns.dialMode,
          lastStallReason: campaigns.lastStallReason,
          lastStallReasonAt: campaigns.lastStallReasonAt,
        })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ error: 'not_found', message: 'Campaign not found' });
      }

      const queueStatusRows = await db
        .select({
          status: campaignQueue.status,
          count: sql<number>`count(*)::int`,
        })
        .from(campaignQueue)
        .where(eq(campaignQueue.campaignId, campaignId))
        .groupBy(campaignQueue.status);

      const queueStatus = {
        queued: 0,
        inProgress: 0,
        done: 0,
        removed: 0,
        total: 0,
      };

      for (const row of queueStatusRows) {
        queueStatus.total += row.count;
        if (row.status === 'queued') queueStatus.queued += row.count;
        if (row.status === 'in_progress') queueStatus.inProgress += row.count;
        if (row.status === 'done') queueStatus.done += row.count;
        if (row.status === 'removed') queueStatus.removed += row.count;
      }

      const removedRows = await db
        .select({
          reason: campaignQueue.removedReason,
          count: sql<number>`count(*)::int`,
        })
        .from(campaignQueue)
        .where(
          and(
            eq(campaignQueue.campaignId, campaignId),
            eq(campaignQueue.status, 'removed')
          )
        )
        .groupBy(campaignQueue.removedReason);

      const removedBreakdown: Record<string, number> = {};
      for (const row of removedRows) {
        removedBreakdown[row.reason || 'unknown'] = row.count;
      }

      const phoneCountryTimezone = await pool.query(
        `
          SELECT
            COUNT(*)::int AS queued_total,
            COUNT(*) FILTER (
              WHERE COALESCE(NULLIF(TRIM(c.mobile_phone_e164), ''), NULLIF(TRIM(c.direct_phone_e164), ''), NULLIF(TRIM(c.mobile_phone), ''), NULLIF(TRIM(c.direct_phone), '')) IS NOT NULL
            )::int AS has_phone,
            COUNT(*) FILTER (
              WHERE COALESCE(NULLIF(TRIM(c.mobile_phone_e164), ''), NULLIF(TRIM(c.direct_phone_e164), ''), NULLIF(TRIM(c.mobile_phone), ''), NULLIF(TRIM(c.direct_phone), '')) IS NULL
            )::int AS no_phone,
            COUNT(*) FILTER (WHERE c.country IS NULL OR TRIM(c.country) = '')::int AS country_missing,
            COUNT(*) FILTER (WHERE c.timezone IS NULL OR TRIM(c.timezone) = '')::int AS timezone_missing
          FROM campaign_queue cq
          INNER JOIN contacts c ON c.id = cq.contact_id
          WHERE cq.campaign_id = $1
            AND cq.status = 'queued'
        `,
        [campaignId]
      );

      const eligibilityBase = phoneCountryTimezone.rows[0] || {
        queued_total: 0,
        has_phone: 0,
        no_phone: 0,
        country_missing: 0,
        timezone_missing: 0,
      };

      const timezoneAnalysis = await analyzeCampaignTimezones(campaignId);
      const topCountries = Object.entries(timezoneAnalysis.countryDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([country, count]) => ({ country, count }));

      res.json({
        campaign,
        queueStatus,
        removedBreakdown,
        eligibility: {
          queuedAnalyzed: Number(eligibilityBase.queued_total || 0),
          callableNow: timezoneAnalysis.totalCallableNow,
          sleepingByBusinessHours: timezoneAnalysis.totalSleeping,
          unknownTimezone: timezoneAnalysis.totalUnknownTimezone,
          hasPhone: Number(eligibilityBase.has_phone || 0),
          noPhone: Number(eligibilityBase.no_phone || 0),
          countryMissing: Number(eligibilityBase.country_missing || 0),
          timezoneFieldMissing: Number(eligibilityBase.timezone_missing || 0),
        },
        topCountries,
        analyzedAt: timezoneAnalysis.analyzedAt,
      });
    } catch (error: any) {
      console.error('Error fetching eligibility breakdown:', error);
      res.status(500).json({ error: 'internal_server_error', message: error.message });
    }
  }
);

export default router;
