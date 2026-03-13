/**
 * Brevo Contact Sync Routes
 *
 * Full Brevo integration endpoints:
 *   - Contact push/pull (by IDs, segments, lists)
 *   - Email campaign listing & engagement reporting
 *   - Unified blocklist management (CRM + Brevo)
 *   - Account-level stats & daily breakdown
 */

import { Router, Request, Response } from 'express';
import {
  listBrevoLists,
  getBrevoListContacts,
  pushContactsToBrevo,
  bulkPushContactsToBrevo,
  pullContactsFromBrevo,
  syncBrevoBlacklist,
  getBrevoContact,
  pushSegmentToBrevo,
  pushListToBrevo,
  createBrevoList,
  listBrevoCampaigns,
  getBrevoCampaignEngagement,
  getAllBrevoEngagementReports,
  getBrevoAccountStats,
  getBrevoStatsByDay,
  getUnifiedBlocklist,
  blockEmailEverywhere,
  unblockEmailEverywhere,
  getCombinedCampaignEngagement,
} from '../services/brevo-contact-sync';

const router = Router();

// -----------------------------------------------------------------------
// Brevo Lists
// -----------------------------------------------------------------------

/** GET /api/brevo-sync/lists — list all Brevo contact lists */
router.get('/lists', async (_req: Request, res: Response) => {
  try {
    const lists = await listBrevoLists();
    res.json({ lists });
  } catch (err: any) {
    console.error('[Brevo Sync] Failed to list Brevo lists:', err);
    res.status(500).json({ message: err.message || 'Failed to list Brevo lists' });
  }
});

/** POST /api/brevo-sync/lists — create a new Brevo list */
router.post('/lists', async (req: Request, res: Response) => {
  try {
    const { name, folderId } = req.body as { name?: string; folderId?: number };
    if (!name) return res.status(400).json({ message: 'name is required' });

    const list = await createBrevoList(name, folderId);
    res.status(201).json(list);
  } catch (err: any) {
    console.error('[Brevo Sync] Failed to create list:', err);
    res.status(500).json({ message: err.message || 'Failed to create Brevo list' });
  }
});

// -----------------------------------------------------------------------
// Push: CRM → Brevo
// -----------------------------------------------------------------------

/**
 * POST /api/brevo-sync/push
 * Body: { contactIds: string[], brevoListId: number, bulk?: boolean }
 */
router.post('/push', async (req: Request, res: Response) => {
  try {
    const { contactIds, brevoListId, bulk } = req.body as {
      contactIds?: string[];
      brevoListId?: number;
      bulk?: boolean;
    };

    if (!contactIds?.length) {
      return res.status(400).json({ message: 'contactIds is required and must be a non-empty array' });
    }
    if (!brevoListId || typeof brevoListId !== 'number') {
      return res.status(400).json({ message: 'brevoListId is required and must be a number' });
    }

    const syncFn = bulk ? bulkPushContactsToBrevo : pushContactsToBrevo;
    const result = await syncFn(contactIds, brevoListId);

    console.log(`[Brevo Sync] Push complete: ${result.created} created, ${result.skipped} skipped, ${result.errors.length} errors`);
    res.json(result);
  } catch (err: any) {
    console.error('[Brevo Sync] Push failed:', err);
    res.status(500).json({ message: err.message || 'Push to Brevo failed' });
  }
});

/**
 * POST /api/brevo-sync/push-segment
 * Body: { segmentId: string, brevoListId: number }
 *
 * Resolve a CRM segment and push all matching contacts to a Brevo list.
 */
router.post('/push-segment', async (req: Request, res: Response) => {
  try {
    const { segmentId, brevoListId } = req.body as { segmentId?: string; brevoListId?: number };

    if (!segmentId) return res.status(400).json({ message: 'segmentId is required' });
    if (!brevoListId || typeof brevoListId !== 'number') {
      return res.status(400).json({ message: 'brevoListId is required and must be a number' });
    }

    const result = await pushSegmentToBrevo(segmentId, brevoListId);
    console.log(`[Brevo Sync] Segment push complete: ${result.created} created, ${result.skipped} skipped`);
    res.json(result);
  } catch (err: any) {
    console.error('[Brevo Sync] Segment push failed:', err);
    res.status(500).json({ message: err.message || 'Segment push to Brevo failed' });
  }
});

/**
 * POST /api/brevo-sync/push-list
 * Body: { listId: string, brevoListId: number }
 *
 * Push a CRM static list's contacts to a Brevo list.
 */
router.post('/push-list', async (req: Request, res: Response) => {
  try {
    const { listId, brevoListId } = req.body as { listId?: string; brevoListId?: number };

    if (!listId) return res.status(400).json({ message: 'listId is required' });
    if (!brevoListId || typeof brevoListId !== 'number') {
      return res.status(400).json({ message: 'brevoListId is required and must be a number' });
    }

    const result = await pushListToBrevo(listId, brevoListId);
    console.log(`[Brevo Sync] List push complete: ${result.created} created, ${result.skipped} skipped`);
    res.json(result);
  } catch (err: any) {
    console.error('[Brevo Sync] List push failed:', err);
    res.status(500).json({ message: err.message || 'List push to Brevo failed' });
  }
});

// -----------------------------------------------------------------------
// Pull: Brevo → CRM
// -----------------------------------------------------------------------

/**
 * POST /api/brevo-sync/pull
 * Body: { brevoListId: number, updateExisting?: boolean, sourceTag?: string }
 */
router.post('/pull', async (req: Request, res: Response) => {
  try {
    const { brevoListId, updateExisting, sourceTag } = req.body as {
      brevoListId?: number;
      updateExisting?: boolean;
      sourceTag?: string;
    };

    if (!brevoListId || typeof brevoListId !== 'number') {
      return res.status(400).json({ message: 'brevoListId is required and must be a number' });
    }

    const result = await pullContactsFromBrevo(brevoListId, { updateExisting, sourceTag });
    console.log(`[Brevo Sync] Pull complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
    res.json(result);
  } catch (err: any) {
    console.error('[Brevo Sync] Pull failed:', err);
    res.status(500).json({ message: err.message || 'Pull from Brevo failed' });
  }
});

// -----------------------------------------------------------------------
// Brevo Email Campaigns
// -----------------------------------------------------------------------

/** GET /api/brevo-sync/campaigns?status=sent&limit=50&offset=0 */
router.get('/campaigns', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const data = await listBrevoCampaigns({ status, limit, offset });
    res.json(data);
  } catch (err: any) {
    console.error('[Brevo Sync] Failed to list campaigns:', err);
    res.status(500).json({ message: err.message || 'Failed to list Brevo campaigns' });
  }
});

// -----------------------------------------------------------------------
// Engagement Reporting
// -----------------------------------------------------------------------

/**
 * GET /api/brevo-sync/campaigns/:campaignId/engagement
 * Get engagement report for a specific Brevo email campaign.
 */
router.get('/campaigns/:campaignId/engagement', async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.campaignId, 10);
    if (isNaN(campaignId)) return res.status(400).json({ message: 'Invalid campaignId' });

    const report = await getBrevoCampaignEngagement(campaignId);
    res.json(report);
  } catch (err: any) {
    console.error('[Brevo Sync] Campaign engagement failed:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch campaign engagement' });
  }
});

/**
 * GET /api/brevo-sync/engagement-reports?limit=50
 * Get engagement reports for all sent Brevo campaigns.
 */
router.get('/engagement-reports', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const reports = await getAllBrevoEngagementReports(limit);
    res.json({ reports, total: reports.length });
  } catch (err: any) {
    console.error('[Brevo Sync] Engagement reports failed:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch engagement reports' });
  }
});

/**
 * GET /api/brevo-sync/account-stats
 * Get aggregated Brevo account-level email statistics.
 */
router.get('/account-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getBrevoAccountStats();
    res.json(stats);
  } catch (err: any) {
    console.error('[Brevo Sync] Account stats failed:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch Brevo account stats' });
  }
});

/**
 * GET /api/brevo-sync/stats-by-day?days=30
 * Get Brevo SMTP statistics broken down by day.
 */
router.get('/stats-by-day', async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const stats = await getBrevoStatsByDay(days);
    res.json({ stats, days });
  } catch (err: any) {
    console.error('[Brevo Sync] Stats by day failed:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch daily stats' });
  }
});

/**
 * GET /api/brevo-sync/combined-engagement/:crmCampaignId?brevoCampaignId=123
 * Get combined CRM + Brevo engagement stats for a campaign.
 */
router.get('/combined-engagement/:crmCampaignId', async (req: Request, res: Response) => {
  try {
    const { crmCampaignId } = req.params;
    const brevoCampaignId = req.query.brevoCampaignId
      ? parseInt(req.query.brevoCampaignId as string, 10)
      : undefined;

    const result = await getCombinedCampaignEngagement(crmCampaignId, brevoCampaignId);
    res.json(result);
  } catch (err: any) {
    console.error('[Brevo Sync] Combined engagement failed:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch combined engagement' });
  }
});

// -----------------------------------------------------------------------
// Blocklist Management
// -----------------------------------------------------------------------

/**
 * GET /api/brevo-sync/blocklist?limit=200&offset=0
 * Unified blocklist: CRM suppression + Brevo blacklist merged.
 */
router.get('/blocklist', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const data = await getUnifiedBlocklist(limit, offset);
    res.json(data);
  } catch (err: any) {
    console.error('[Brevo Sync] Blocklist fetch failed:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch blocklist' });
  }
});

/**
 * POST /api/brevo-sync/blocklist/add
 * Body: { email: string, reason?: 'hard_bounce' | 'unsubscribe' | 'spam_complaint' | 'manual' }
 *
 * Block email in both Brevo and CRM suppression list.
 */
router.post('/blocklist/add', async (req: Request, res: Response) => {
  try {
    const { email, reason } = req.body as { email?: string; reason?: 'hard_bounce' | 'unsubscribe' | 'spam_complaint' | 'manual' };
    if (!email) return res.status(400).json({ message: 'email is required' });

    await blockEmailEverywhere(email, reason || 'manual');
    res.json({ blocked: true, email });
  } catch (err: any) {
    console.error('[Brevo Sync] Block email failed:', err);
    res.status(500).json({ message: err.message || 'Failed to block email' });
  }
});

/**
 * POST /api/brevo-sync/blocklist/remove
 * Body: { email: string }
 *
 * Remove email from both Brevo blocklist and CRM suppression list.
 */
router.post('/blocklist/remove', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ message: 'email is required' });

    await unblockEmailEverywhere(email);
    res.json({ unblocked: true, email });
  } catch (err: any) {
    console.error('[Brevo Sync] Unblock email failed:', err);
    res.status(500).json({ message: err.message || 'Failed to unblock email' });
  }
});

/**
 * POST /api/brevo-sync/sync-blacklist
 * Sync Brevo blacklisted contacts into the CRM suppression list.
 */
router.post('/sync-blacklist', async (_req: Request, res: Response) => {
  try {
    const result = await syncBrevoBlacklist();
    console.log(`[Brevo Sync] Blacklist sync: ${result.created} suppressed, ${result.skipped} already suppressed`);
    res.json(result);
  } catch (err: any) {
    console.error('[Brevo Sync] Blacklist sync failed:', err);
    res.status(500).json({ message: err.message || 'Blacklist sync failed' });
  }
});

// -----------------------------------------------------------------------
// Lookup & Preview
// -----------------------------------------------------------------------

/** GET /api/brevo-sync/contact/:email */
router.get('/contact/:email', async (req: Request, res: Response) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const contact = await getBrevoContact(email);
    if (!contact) return res.status(404).json({ message: 'Contact not found in Brevo' });
    res.json(contact);
  } catch (err: any) {
    console.error('[Brevo Sync] Contact lookup failed:', err);
    res.status(500).json({ message: err.message || 'Contact lookup failed' });
  }
});

/** GET /api/brevo-sync/list/:listId/contacts?limit=50&offset=0 */
router.get('/list/:listId/contacts', async (req: Request, res: Response) => {
  try {
    const listId = parseInt(req.params.listId, 10);
    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid listId' });

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const data = await getBrevoListContacts(listId, limit, offset);
    res.json(data);
  } catch (err: any) {
    console.error('[Brevo Sync] List contacts fetch failed:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch list contacts' });
  }
});

export default router;
