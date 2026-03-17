/**
 * Client Portal Campaigns Routes
 *
 * Handles campaign creation from the wizard, AI agent configuration,
 * and audience management for client portal users.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, or, desc, sql, inArray, isNull, isNotNull, asc } from 'drizzle-orm';
import {
  workOrders,
  clientAccounts,
  clientUsers,
  campaigns,
  campaignIntakeRequests,
  verificationCampaigns,
  verificationContacts,
  virtualAgents,
  campaignQueue,
  callAttempts,
  dialerCallAttempts,
  leads,
  clientCampaignAccess,
  clientProjectCampaigns,
  clientProjects,
  clientCampaigns as clientPortalCampaigns,
  contacts,
  accounts,
  externalEvents,
  workOrderDrafts,
  contentPromotionPages,
  contentPromotionPageViews,
} from '@shared/schema';
import { z } from 'zod';
import { isFeatureEnabled } from '../feature-flags';
import multer from 'multer';
import { notificationService } from '../services/notification-service';
import {
  getQueueIntelligenceOverview,
  getSegmentAnalysis,
  getContactScores,
} from '../services/queue-intelligence-service';
import { pool } from '../db';
import { analyzeCampaignTimezones } from '../services/campaign-timezone-analyzer';

const router = Router();

// Multer config for campaign file uploads (memory storage — no cloud storage)
const campaignUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate unique order number: WO-YYYY-NNNN
 */
async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;

  const [lastOrder] = await db
    .select({ orderNumber: workOrders.orderNumber })
    .from(workOrders)
    .where(sql`${workOrders.orderNumber} LIKE ${prefix + '%'}`)
    .orderBy(desc(workOrders.orderNumber))
    .limit(1);

  let nextNumber = 1;
  if (lastOrder) {
    const lastNum = parseInt(lastOrder.orderNumber.split('-')[2], 10);
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Map wizard channel to order type
 */
type WorkOrderType = 'call_campaign' | 'email_campaign' | 'combo_campaign' | 'data_enrichment' | 'lead_generation' | 'appointment_setting' | 'market_research' | 'custom';

function mapChannelToOrderType(channel: string, campaignType: string): WorkOrderType {
  const channelMap: Record<string, WorkOrderType> = {
    'voice': 'call_campaign',
    'email': 'email_campaign',
    'combo': 'combo_campaign',
  };

  const typeMap: Record<string, WorkOrderType> = {
    'lead_generation': 'lead_generation',
    'appointment_setting': 'appointment_setting',
    'market_research': 'market_research',
    'event_promotion': 'lead_generation',
    'product_launch': 'lead_generation',
    'customer_feedback': 'market_research',
  };

  // Prioritize channel for the order type
  return channelMap[channel] || typeMap[campaignType] || 'lead_generation';
}

// ==================== CAMPAIGN ROUTES ====================

/**
 * GET / - Get rich campaign data for client dashboard
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const verificationAccessList = await db
      .select({
        campaign: verificationCampaigns,
      })
      .from(clientCampaignAccess)
      .innerJoin(verificationCampaigns, eq(clientCampaignAccess.campaignId, verificationCampaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          isNotNull(clientCampaignAccess.campaignId),
        ),
      );

    const normalizedVerificationCampaigns = await Promise.all(
      verificationAccessList.map(async ({ campaign }) => {
        let eligibleCount = 0;
        try {
          const [eligibleRow] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(verificationContacts)
            .where(
              and(
                eq(verificationContacts.campaignId, campaign.id),
                eq(verificationContacts.eligibilityStatus, 'Eligible'),
                eq(verificationContacts.reservedSlot, true),
              ),
            );
          eligibleCount = Number(eligibleRow?.count || 0);
        } catch (error: any) {
          console.warn(
            `[CLIENT CAMPAIGNS] verification eligible count fallback | campaign=${campaign.id} error=${error?.message || error}`,
          );
        }

        let enabledFeatures: unknown = null;
        try {
          const [projectLink] = await db
            .select({ enabledFeatures: clientProjects.enabledFeatures })
            .from(clientProjectCampaigns)
            .innerJoin(clientProjects, eq(clientProjectCampaigns.projectId, clientProjects.id))
            .where(eq(clientProjectCampaigns.campaignId, campaign.id))
            .limit(1);
          enabledFeatures = projectLink?.enabledFeatures ?? null;
        } catch (error: any) {
          console.warn(
            `[CLIENT CAMPAIGNS] verification enabled-features fallback | campaign=${campaign.id} error=${error?.message || error}`,
          );
        }

        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status || 'active',
          type: 'verification',
          campaignType: 'verification',
          dialMode: null as string | null,
          startDate: campaign.startDate || null,
          endDate: campaign.endDate || null,
          targetQualifiedLeads: null as number | null,
          costPerLead: null as string | null,
          orderNumber: null as string | null,
          estimatedBudget: null as number | null,
          approvedBudget: null as number | null,
          eligibleCount,
          verifiedCount: 0,
          deliveredCount: 0,
          totalContacts: eligibleCount,
          clientStatus: null as string | null,
          enabledFeatures,
        };
      }),
    );

    // Include campaigns explicitly granted to the client. This is required for
    // verification/green-leads style mappings where work orders may not exist.
    const accessLinkedRegularCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        campaignType: campaigns.type,
        dialMode: campaigns.dialMode,
        startDate: campaigns.startDate,
        endDate: campaigns.endDate,
        targetQualifiedLeads: campaigns.targetQualifiedLeads,
        costPerLead: campaigns.costPerLead,
        clientAccountId: campaigns.clientAccountId,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId),
          eq(campaigns.clientAccountId, clientAccountId),
        ),
      )
      .orderBy(desc(campaigns.createdAt));

    const accessLinkedMappedCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        campaignType: campaigns.type,
        dialMode: campaigns.dialMode,
        startDate: campaigns.startDate,
        endDate: campaigns.endDate,
        targetQualifiedLeads: campaigns.targetQualifiedLeads,
        costPerLead: campaigns.costPerLead,
        clientAccountId: campaigns.clientAccountId,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.campaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          isNotNull(clientCampaignAccess.campaignId),
          eq(campaigns.clientAccountId, clientAccountId),
        ),
      )
      .orderBy(desc(campaigns.createdAt));

    const mappedAccessCampaigns = [...accessLinkedRegularCampaigns];
    const mappedAccessCampaignIds = new Set(accessLinkedRegularCampaigns.map((c) => c.id));
    for (const mappedCampaign of accessLinkedMappedCampaigns) {
      if (!mappedAccessCampaignIds.has(mappedCampaign.id)) {
        mappedAccessCampaigns.push(mappedCampaign);
        mappedAccessCampaignIds.add(mappedCampaign.id);
      }
    }

    const normalizedAccessCampaigns = mappedAccessCampaigns.map((c) => ({
      ...c,
      orderNumber: null as string | null,
      estimatedBudget: null as number | null,
      approvedBudget: null as number | null,
      eligibleCount: 0,
      verifiedCount: 0,
      deliveredCount: 0,
      totalContacts: 0,
      clientStatus: c.status === 'draft' ? 'approved_pending_setup' : null,
    }));

    const normalizedClientPortalCampaigns = await db
      .select({
        id: clientPortalCampaigns.id,
        name: clientPortalCampaigns.name,
        status: clientPortalCampaigns.status,
      })
      .from(clientPortalCampaigns)
      .where(eq(clientPortalCampaigns.clientAccountId, clientAccountId))
      .orderBy(desc(clientPortalCampaigns.createdAt))
      .then((rows) =>
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status || 'draft',
          type: 'client_campaign',
          campaignType: 'client_campaign',
          dialMode: null as string | null,
          startDate: null as string | null,
          endDate: null as string | null,
          targetQualifiedLeads: null as number | null,
          costPerLead: null as string | null,
          orderNumber: null as string | null,
          estimatedBudget: null as number | null,
          approvedBudget: null as number | null,
          eligibleCount: 0,
          verifiedCount: 0,
          deliveredCount: 0,
          totalContacts: 0,
          clientStatus: c.status === 'draft' ? 'approved_pending_setup' : null,
        })),
      );

    // Fetch campaigns linked to work orders for this client
    const workOrderCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        campaignType: campaigns.type, // Alias for frontend compatibility
        dialMode: campaigns.dialMode,
        startDate: campaigns.startDate,
        endDate: campaigns.endDate,
        targetQualifiedLeads: campaigns.targetQualifiedLeads,
        costPerLead: campaigns.costPerLead,
        clientAccountId: campaigns.clientAccountId,
        
        // Work Order fields
        orderNumber: workOrders.orderNumber,
        estimatedBudget: workOrders.estimatedBudget,
        approvedBudget: workOrders.approvedBudget,
        
        // Stats placeholders (fetching real stats requires aggregation which can be heavy, 
        // sticking to basic schema fields or zeros for now as per minimal requirement, 
        // but user asked for "Admin" data, so if we can join stats we should).
        // Admin stats usually come from `campaign_stats` or similar. 
        // For now, we return 0s or workOrder fields if available.
        eligibleCount: workOrders.targetLeadCount,
        verifiedCount: workOrders.leadsGenerated,
        deliveredCount: workOrders.leadsDelivered,
        totalContacts: workOrders.leadsGenerated, // Approx alias
      })
      .from(campaigns)
      .innerJoin(workOrders, eq(campaigns.id, workOrders.campaignId))
      .where(
        and(
          eq(workOrders.clientAccountId, clientAccountId),
          eq(campaigns.clientAccountId, clientAccountId),
        ),
      )
      .orderBy(desc(campaigns.createdAt));

    const campaignIds = new Set(
      [
        ...normalizedVerificationCampaigns,
        ...normalizedAccessCampaigns,
        ...normalizedClientPortalCampaigns,
        ...workOrderCampaigns,
      ].map((c) => c.id),
    );

    // Also include campaigns created from intake requests (ALL items)
    const intakeCampaigns = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        campaignType: campaigns.type,
        dialMode: campaigns.dialMode,
        startDate: campaigns.startDate,
        endDate: campaigns.endDate,
        targetQualifiedLeads: campaigns.targetQualifiedLeads,
        costPerLead: campaigns.costPerLead,
        clientAccountId: campaigns.clientAccountId,
        intakeStatus: campaignIntakeRequests.status,
        intakeRequestId: campaignIntakeRequests.id,
        requestedLeadCount: campaignIntakeRequests.requestedLeadCount,
      })
      .from(campaigns)
      .innerJoin(campaignIntakeRequests, eq(campaigns.id, campaignIntakeRequests.campaignId))
      .where(
        and(
          eq(campaignIntakeRequests.clientAccountId, clientAccountId),
          eq(campaigns.clientAccountId, clientAccountId),
        ),
      )
      .orderBy(desc(campaigns.createdAt));

    const mappedIntakeCampaigns = intakeCampaigns
      .filter((c) => !campaignIds.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        type: c.type,
        campaignType: c.campaignType,
        dialMode: c.dialMode,
        startDate: c.startDate,
        endDate: c.endDate,
        targetQualifiedLeads: c.targetQualifiedLeads,
        costPerLead: c.costPerLead,
        orderNumber: null,
        estimatedBudget: null,
        approvedBudget: null,
        eligibleCount: c.requestedLeadCount || 0,
        verifiedCount: 0,
        deliveredCount: 0,
        totalContacts: 0,
        intakeStatus: c.intakeStatus,
        intakeRequestId: c.intakeRequestId,
        clientStatus: c.status === 'draft' ? 'approved_pending_setup' : null,
      }));

    // V2: Also include campaigns linked directly via campaigns.clientAccountId
    // This catches campaigns created by admins without workOrders or intakeRequests
    let directCampaigns: typeof workOrderCampaigns = [];
    if (true) {
      // Add intake campaign IDs to the dedup set
      for (const ic of mappedIntakeCampaigns) {
        campaignIds.add(ic.id);
      }

      const directLinked = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
          type: campaigns.type,
          campaignType: campaigns.type,
          dialMode: campaigns.dialMode,
          startDate: campaigns.startDate,
          endDate: campaigns.endDate,
          targetQualifiedLeads: campaigns.targetQualifiedLeads,
        costPerLead: campaigns.costPerLead,
        approvalStatus: campaigns.approvalStatus,
        clientAccountId: campaigns.clientAccountId,
      })
        .from(campaigns)
        .where(eq(campaigns.clientAccountId, clientAccountId))
        .orderBy(desc(campaigns.createdAt));

      directCampaigns = directLinked
        .filter((c) => !campaignIds.has(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          type: c.type,
          campaignType: c.campaignType,
          dialMode: c.dialMode,
          startDate: c.startDate,
          endDate: c.endDate,
          targetQualifiedLeads: c.targetQualifiedLeads,
          costPerLead: c.costPerLead,
          orderNumber: null as any,
          estimatedBudget: null as any,
          approvedBudget: null as any,
          eligibleCount: 0,
          verifiedCount: 0,
          deliveredCount: 0,
          totalContacts: 0,
          clientStatus: c.status === 'draft'
            ? 'approved_pending_setup'
            : (c.approvalStatus as string) || null,
        }));
    }

    const campaignsList = [
      ...normalizedVerificationCampaigns,
      ...normalizedAccessCampaigns,
      ...normalizedClientPortalCampaigns,
      ...workOrderCampaigns,
      ...mappedIntakeCampaigns,
      ...directCampaigns,
    ];
    const campaignIdList = campaignsList.map((c) => c.id);

    if (campaignIdList.length === 0) {
      return res.json([]);
    }

    // Enrich with stats using batched aggregate queries (avoid per-campaign N+1 query fanout).
    // If any aggregate query fails due schema drift/data issues, degrade gracefully
    // instead of failing the entire campaigns endpoint.
    const statsResults = await Promise.allSettled([
      db
        .select({
          campaignId: campaignQueue.campaignId,
          total: sql<number>`COUNT(DISTINCT CASE WHEN ${campaignQueue.status} <> 'removed' THEN COALESCE(${campaignQueue.contactId}::text, ${campaignQueue.dialedNumber}, ${campaignQueue.id}::text) ELSE NULL END)::int`,
          pending: sql<number>`COUNT(DISTINCT CASE WHEN ${campaignQueue.status} IN ('queued', 'pending') THEN COALESCE(${campaignQueue.contactId}::text, ${campaignQueue.dialedNumber}, ${campaignQueue.id}::text) ELSE NULL END)::int`,
        })
        .from(campaignQueue)
        .where(inArray(campaignQueue.campaignId, campaignIdList))
        .groupBy(campaignQueue.campaignId),
      db
        .select({
          campaignId: dialerCallAttempts.campaignId,
          count: sql<number>`count(*)::int`,
        })
        .from(dialerCallAttempts)
        .where(inArray(dialerCallAttempts.campaignId, campaignIdList))
        .groupBy(dialerCallAttempts.campaignId),
      db
        .select({
          campaignId: leads.campaignId,
          count: sql<number>`count(*)::int`,
        })
        .from(leads)
        .where(
          and(
            inArray(leads.campaignId, campaignIdList),
              inArray(leads.qaStatus, ['approved', 'published', 'new', 'under_review']),
          ),
        )
        .groupBy(leads.campaignId),
      db
        .select({
          campaignId: dialerCallAttempts.campaignId,
          callsMade: sql<number>`count(*)::int`,
          connected: sql<number>`sum(case when ${dialerCallAttempts.connected} = true then 1 else 0 end)::int`,
          qualified: sql<number>`sum(case when ${dialerCallAttempts.disposition} = 'qualified_lead' then 1 else 0 end)::int`,
          voicemail: sql<number>`sum(case when ${dialerCallAttempts.disposition} = 'voicemail' then 1 else 0 end)::int`,
          noAnswer: sql<number>`sum(case when ${dialerCallAttempts.disposition} = 'no_answer' then 1 else 0 end)::int`,
          invalid: sql<number>`sum(case when ${dialerCallAttempts.disposition} = 'invalid_data' then 1 else 0 end)::int`,
        })
        .from(dialerCallAttempts)
        .where(inArray(dialerCallAttempts.campaignId, campaignIdList))
        .groupBy(dialerCallAttempts.campaignId),
    ]);

    const queueStatsRows = statsResults[0].status === 'fulfilled' ? statsResults[0].value : [];
    const attemptStatsRows = statsResults[1].status === 'fulfilled' ? statsResults[1].value : [];
    const leadStatsRows = statsResults[2].status === 'fulfilled' ? statsResults[2].value : [];
    const dialerCallStatsRows = statsResults[3].status === 'fulfilled' ? statsResults[3].value : [];

    if (statsResults.some((r) => r.status === 'rejected')) {
      const failures = statsResults
        .map((r, idx) => ({ idx, r }))
        .filter(({ r }) => r.status === 'rejected')
        .map(({ idx, r }) => `query_${idx}:${(r as PromiseRejectedResult).reason?.message || String((r as PromiseRejectedResult).reason)}`);
      console.warn('[CLIENT CAMPAIGNS] Partial stats failure; returning campaigns with fallback stats:', failures.join(' | '));
    }

    const queueStatsByCampaignId = new Map(
      queueStatsRows.map((row) => [row.campaignId, row]),
    );
    const attemptStatsByCampaignId = new Map(
      attemptStatsRows.map((row) => [row.campaignId, row]),
    );
    const leadStatsByCampaignId = new Map(
      leadStatsRows.map((row) => [row.campaignId, row]),
    );
    const dialerCallStatsByCampaignId = new Map(
      dialerCallStatsRows.map((row) => [row.campaignId, row]),
    );

    const campaignsWithStats = campaignsList.map((c) => {
      const queueStats = queueStatsByCampaignId.get(c.id);
      const attemptStats = attemptStatsByCampaignId.get(c.id);
      const leadStats = leadStatsByCampaignId.get(c.id);
      const dialerCallStats = dialerCallStatsByCampaignId.get(c.id);

      const totalQueue = Number(queueStats?.total || 0);
      const remaining = Number(queueStats?.pending || 0);
      const attempts = Number(attemptStats?.count || 0);
      const leadCount = Number(leadStats?.count || 0);
      const callReport = {
        callsMade: Number(dialerCallStats?.callsMade || 0),
        connected: Number(dialerCallStats?.connected || 0),
        qualified: Number(dialerCallStats?.qualified || 0),
        voicemail: Number(dialerCallStats?.voicemail || 0),
        noAnswer: Number(dialerCallStats?.noAnswer || 0),
        invalid: Number(dialerCallStats?.invalid || 0),
      };

      return {
        ...c,
        eligibleCount: totalQueue,
        verifiedCount: leadCount,
        deliveredCount: leadCount,
        totalContacts: totalQueue,
        callReport,
        stats: {
          attempts,
          impressions: attempts,
          leads: leadCount,
          targetAchieved: leadCount,
          remaining,
          callReport,
        },
      };
    });

    const tenantMismatches = campaignsWithStats.filter(
      (campaign) =>
        (campaign as any).type !== 'verification' &&
        (campaign as any).type !== 'client_campaign' &&
        (campaign as any).id &&
        (campaign as any).clientAccountId &&
        (campaign as any).clientAccountId !== clientAccountId,
    );
    if (tenantMismatches.length > 0) {
      console.error(
        `[CLIENT CAMPAIGNS] tenant assertion failed | client=${clientAccountId} mismatches=${tenantMismatches
          .map((c) => c.id)
          .join(',')}`,
      );
      return res.status(500).json({ message: 'Campaign tenant scope assertion failed' });
    }

    console.log(
      `[CLIENT CAMPAIGNS] list success | client=${clientAccountId} total=${campaignsWithStats.length}` +
      ` verification=${normalizedVerificationCampaigns.length}` +
      ` access=${normalizedAccessCampaigns.length}` +
      ` clientCreated=${normalizedClientPortalCampaigns.length}` +
      ` workOrder=${workOrderCampaigns.length}` +
      ` intake=${mappedIntakeCampaigns.length}` +
      ` direct=${directCampaigns.length}`,
    );

    res.json(campaignsWithStats);
  } catch (error) {
     console.error('[CLIENT CAMPAIGNS] List error:', error);
     // Keep client portal stable even if campaign enrichment fails.
     res.json([]);
  }
});

/**
 * GET /:id/queue - Get a sample of the queue for a campaign
 * 
 * FIXED: Now verifies campaign ownership and returns total count
 */
router.get('/:id/queue', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { id: campaignId } = req.params;
    console.log(`[CLIENT QUEUE] Fetching queue for campaign ${campaignId}, client ${clientAccountId}`);

    // SECURITY: Verify campaign belongs to this client
    // Check if campaign exists in the campaigns table with this clientAccountId
    const [campaign] = await db
      .select({ id: campaigns.id, name: campaigns.name, clientAccountId: campaigns.clientAccountId })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      console.warn(`[CLIENT QUEUE] Campaign ${campaignId} not found`);
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Also check verification campaigns for client access
    let hasAccess = false;
    if (campaign.clientAccountId === clientAccountId) {
      hasAccess = true;
      console.log(`[CLIENT QUEUE] Access granted via direct clientAccountId match`);
    } else {
      // Check if this campaign is linked via clientCampaignAccess
      const [access] = await db
        .select({ id: clientCampaignAccess.id })
        .from(clientCampaignAccess)
        .where(
          and(
            eq(clientCampaignAccess.clientAccountId, clientAccountId),
            or(
              eq(clientCampaignAccess.campaignId, campaignId),
              eq(clientCampaignAccess.regularCampaignId, campaignId)
            )
          )
        )
        .limit(1);
      hasAccess = !!access;
      if (hasAccess) {
        console.log(`[CLIENT QUEUE] Access granted via clientCampaignAccess table`);
      }
    }

    if (!hasAccess) {
      console.warn(`[CLIENT QUEUE] Access denied: client ${clientAccountId} tried to access campaign ${campaignId}`);
      return res.status(403).json({ message: 'Access denied: campaign does not belong to your account' });
    }

    // Valid queue_status values: 'queued', 'in_progress', 'done', 'removed'
    // For queue preview, show only items waiting in queue ('queued')
    const QUEUE_WAITING_STATUS = 'queued' as const;
    
    // Get total count of queued items only
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignQueue)
      .where(
        and(
          eq(campaignQueue.campaignId, campaignId),
          eq(campaignQueue.status, QUEUE_WAITING_STATUS)
        )
      );

    const totalCount = countResult?.count || 0;

    // Get next 50 contacts in queue with contact/account details via LEFT JOIN
    const queue = await db
      .select({
        id: campaignQueue.id,
        contactId: campaignQueue.contactId,
        phoneNumber: campaignQueue.dialedNumber,
        contactName: contacts.fullName,
        companyName: accounts.name,
        status: campaignQueue.status,
        nextAttemptAt: campaignQueue.nextAttemptAt,
        priority: campaignQueue.priority,
        createdAt: campaignQueue.createdAt
      })
      .from(campaignQueue)
      .leftJoin(contacts, eq(campaignQueue.contactId, contacts.id))
      .leftJoin(accounts, eq(campaignQueue.accountId, accounts.id))
      .where(
        and(
          eq(campaignQueue.campaignId, campaignId),
          // Only show items waiting in queue (valid enum: queued, in_progress, done, removed)
          eq(campaignQueue.status, QUEUE_WAITING_STATUS)
        )
      )
      .orderBy(desc(campaignQueue.priority), asc(campaignQueue.nextAttemptAt))
      .limit(50);

    // Map to consistent response shape (matches frontend expectations)
    const items = queue.map(q => ({
      id: q.id,
      contactId: q.contactId,
      contactName: q.contactName || 'Unknown Contact',
      companyName: q.companyName || 'Unknown Company',
      phoneNumber: q.phoneNumber || null,
      status: q.status,
      queuedAt: q.createdAt?.toISOString() || null
    }));

    console.log(`[CLIENT QUEUE] Returning ${items.length} of ${totalCount} queue items for campaign ${campaignId}`);

    res.json({
      total: totalCount,
      items
    });
  } catch (error: any) {
    console.error('[CLIENT QUEUE] Queue fetch error:', error?.message || error);
    console.error('[CLIENT QUEUE] Stack:', error?.stack);
    // Return stable error response, never raw 500
    res.status(500).json({ 
      message: error?.message || 'Failed to fetch queue',
      total: 0,
      items: []
    });
  }
});

/**
 * POST /create - Create a new campaign from the wizard
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;

    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const campaignSchema = z.object({
      // Step 1: Basics
      name: z.string().min(1, 'Campaign name is required'),
      description: z.string().optional(),

      // Step 2: Channel
      channel: z.enum(['voice', 'email', 'combo']),

      // Step 3: Type
      campaignType: z.string(),

      // Step 4: Content
      objective: z.string().min(1, 'Objective is required'),
      talkingPoints: z.array(z.string()).optional(),
      successCriteria: z.string().min(1, 'Success criteria is required'),
      targetAudience: z.string().optional(),
      objections: z.array(z.object({
        objection: z.string(),
        response: z.string(),
      })).optional(),

      // Step 5: AI Agent
      selectedVoice: z.string().optional(),
      selectedVoices: z.array(z.string()).optional(),
      selectedPersonaNames: z.record(z.string(), z.string()).optional(),
      agentPersona: z.string().optional(),
      agentTone: z.enum(['professional', 'friendly', 'consultative', 'direct']).optional(),
      openingScript: z.string().optional(),

      // Step 6: Audience
      audienceSource: z.enum(['own_data', 'request_handling']),
      selectedAccounts: z.array(z.string()).optional(),
      selectedContacts: z.array(z.string()).optional(),
      targetIndustries: z.array(z.string()).optional(),
      targetTitles: z.array(z.string()).optional(),
      targetRegions: z.array(z.string()).optional(),
      targetCompanySize: z.string().optional(),
      targetLeadCount: z.number().optional(),

      // Additional
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      budget: z.number().optional(),
    });

    const data = campaignSchema.parse(req.body);
    const orderNumber = await generateOrderNumber();

    const normalizedSelectedVoices = (data.selectedVoices?.filter(v => v?.trim())?.length
      ? data.selectedVoices.filter(v => v?.trim())
      : data.selectedVoice
        ? [data.selectedVoice]
        : undefined);

    // Build campaign configuration
    const campaignConfig: any = {
      channel: data.channel,
      campaignType: data.campaignType,
      objective: data.objective,
      talkingPoints: data.talkingPoints?.filter(p => p.trim()),
      successCriteria: data.successCriteria,
      targetAudience: data.targetAudience,
      objections: data.objections?.filter(o => o.objection.trim() || o.response.trim()),

      // AI Agent configuration
      aiAgent: {
        voice: normalizedSelectedVoices?.[0] || data.selectedVoice,
        voices: normalizedSelectedVoices,
        personaNames: data.selectedPersonaNames,
        persona: data.agentPersona,
        tone: data.agentTone,
        openingScript: data.openingScript,
      },

      // Audience configuration
      audienceSource: data.audienceSource,
      selectedAccounts: data.selectedAccounts,
      selectedContacts: data.selectedContacts,
    };

    // Create the work order
    const [newOrder] = await db
      .insert(workOrders)
      .values({
        orderNumber,
        clientAccountId,
        clientUserId,
        title: data.name,
        description: data.description || data.objective,
        orderType: mapChannelToOrderType(data.channel, data.campaignType),
        priority: data.priority,
        status: 'submitted',
        targetIndustries: data.targetIndustries?.length ? data.targetIndustries : null,
        targetTitles: data.targetTitles?.length ? data.targetTitles : null,
        targetCompanySize: data.targetCompanySize || null,
        targetRegions: data.targetRegions?.length ? data.targetRegions : null,
        targetLeadCount: data.targetLeadCount || null,
        requestedStartDate: data.startDate || null,
        requestedEndDate: data.endDate || null,
        estimatedBudget: data.budget ? data.budget.toString() : null,
        campaignConfig: campaignConfig,
        submittedAt: new Date(),
      })
      .returning({
        id: workOrders.id,
        orderNumber: workOrders.orderNumber,
        title: workOrders.title,
        description: workOrders.description,
        status: workOrders.status,
        priority: workOrders.priority,
        orderType: workOrders.orderType,
        targetLeadCount: workOrders.targetLeadCount,
        estimatedBudget: workOrders.estimatedBudget,
      });

    try {
      const [clientAccount] = await db
        .select({ name: clientAccounts.name })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, clientAccountId))
        .limit(1);

      await notificationService.notifyAdminOfClientRequest(
        {
          requestRef: newOrder.orderNumber,
          title: newOrder.title,
          description: newOrder.description,
          status: newOrder.status,
          priority: newOrder.priority,
          requestType: newOrder.orderType,
          targetLeadCount: newOrder.targetLeadCount,
          budget: newOrder.estimatedBudget,
        },
        clientAccount?.name || 'Unknown Client',
        'campaign'
      );
    } catch (notifyError) {
      console.error('[CLIENT CAMPAIGNS] Failed to send admin email notification:', notifyError);
    }

    res.status(201).json({
      success: true,
      message: 'Campaign submitted successfully',
      campaign: {
        id: newOrder.id,
        orderNumber: newOrder.orderNumber,
        name: newOrder.title,
        status: newOrder.status,
        channel: data.channel,
        type: data.campaignType,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CLIENT CAMPAIGNS] Create campaign error:', error);
    res.status(500).json({ message: 'Failed to create campaign' });
  }
});

/**
 * GET /voices - Get available AI voices for preview
 */
router.get('/voices', async (req: Request, res: Response) => {
  try {
    const voices = [
      { id: 'Fenrir', name: 'Fenrir', gender: 'male', description: 'Professional, confident tone', accent: 'American', provider: 'google' },
      { id: 'Aoede', name: 'Aoede', gender: 'female', description: 'Warm, friendly personality', accent: 'American', provider: 'google' },
      { id: 'Puck', name: 'Puck', gender: 'male', description: 'Energetic, engaging style', accent: 'American', provider: 'google' },
      { id: 'Kore', name: 'Kore', gender: 'female', description: 'Calm, reassuring voice', accent: 'American', provider: 'google' },
      { id: 'Charon', name: 'Charon', gender: 'male', description: 'Deep, authoritative tone', accent: 'American', provider: 'google' },
      { id: 'Orion', name: 'Orion', gender: 'male', description: 'Clear, articulate speaker', accent: 'British', provider: 'google' },
      { id: 'Vega', name: 'Vega', gender: 'female', description: 'Sophisticated, professional', accent: 'British', provider: 'google' },
      { id: 'Pegasus', name: 'Pegasus', gender: 'male', description: 'Dynamic, persuasive style', accent: 'American', provider: 'google' },
      { id: 'Ursa', name: 'Ursa', gender: 'female', description: 'Strong, confident delivery', accent: 'American', provider: 'google' },
      { id: 'Dipper', name: 'Dipper', gender: 'male', description: 'Friendly, approachable manner', accent: 'American', provider: 'google' },
      { id: 'Capella', name: 'Capella', gender: 'female', description: 'Bright, enthusiastic tone', accent: 'American', provider: 'google' },
      { id: 'Lyra', name: 'Lyra', gender: 'female', description: 'Melodic, pleasant voice', accent: 'American', provider: 'google' },
    ];

    res.json({ voices });
  } catch (error) {
    console.error('[CLIENT CAMPAIGNS] Get voices error:', error);
    res.status(500).json({ message: 'Failed to fetch voices' });
  }
});

/**
 * GET /agents - Get available foundation AI agents
 */
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const agents = await db
      .select({
        id: virtualAgents.id,
        name: virtualAgents.name,
        provider: virtualAgents.provider,
        voice: virtualAgents.voice,
        systemPrompt: virtualAgents.systemPrompt,
        isFoundationAgent: virtualAgents.isFoundationAgent,
        foundationCapabilities: virtualAgents.foundationCapabilities,
      })
      .from(virtualAgents)
      .where(and(
        eq(virtualAgents.isActive, true),
        eq(virtualAgents.isFoundationAgent, true)
      ))
      .orderBy(virtualAgents.name);

    res.json({ agents });
  } catch (error) {
    console.error('[CLIENT CAMPAIGNS] Get agents error:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
});

/**
 * GET /my-campaigns - Get campaigns for the client
 */
router.get('/my-campaigns', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;

    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get work orders (campaign requests)
    const orders = await db
      .select({
        id: workOrders.id,
        orderNumber: workOrders.orderNumber,
        title: workOrders.title,
        description: workOrders.description,
        orderType: workOrders.orderType,
        priority: workOrders.priority,
        status: workOrders.status,
        targetLeadCount: workOrders.targetLeadCount,
        leadsGenerated: workOrders.leadsGenerated,
        leadsDelivered: workOrders.leadsDelivered,
        progressPercent: workOrders.progressPercent,
        campaignConfig: workOrders.campaignConfig,
        submittedAt: workOrders.submittedAt,
        createdAt: workOrders.createdAt,
      })
      .from(workOrders)
      .where(eq(workOrders.clientAccountId, clientAccountId))
      .orderBy(desc(workOrders.createdAt));

    // V2: Also include campaigns linked directly via campaigns.clientAccountId
    let directLinkedCampaigns: any[] = [];
    if (isFeatureEnabled('client_campaign_listing_v2')) {
      const woLinkedCampaignIds = new Set(
        orders.map(o => (o as any).campaignId).filter(Boolean)
      );

      const directCampaigns = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
          type: campaigns.type,
          startDate: campaigns.startDate,
          endDate: campaigns.endDate,
          targetQualifiedLeads: campaigns.targetQualifiedLeads,
          approvalStatus: campaigns.approvalStatus,
          createdAt: campaigns.createdAt,
        })
        .from(campaigns)
        .where(eq(campaigns.clientAccountId, clientAccountId))
        .orderBy(desc(campaigns.createdAt));

      directLinkedCampaigns = directCampaigns
        .filter(c => !woLinkedCampaignIds.has(c.id))
        .map(c => ({
          id: c.id,
          orderNumber: null,
          title: c.name,
          description: null,
          orderType: c.type || 'lead_generation',
          priority: 'normal',
          status: c.status === 'draft' ? 'approved_pending_setup' : c.status,
          targetLeadCount: c.targetQualifiedLeads,
          leadsGenerated: 0,
          leadsDelivered: 0,
          progressPercent: 0,
          campaignConfig: null,
          submittedAt: null,
          createdAt: c.createdAt,
          source: 'direct', // Indicates came from direct client link, not workOrder
        }));
    }

    res.json({ campaigns: [...orders, ...directLinkedCampaigns] });
  } catch (error) {
    console.error('[CLIENT CAMPAIGNS] Get my campaigns error:', error);
    res.status(500).json({ message: 'Failed to fetch campaigns' });
  }
});

/**
 * PATCH /:campaignId/voice - Update campaign voice settings
 */
router.patch('/:campaignId/voice', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { voice, provider } = req.body;
    const userId = (req as any).userId;

    if (!voice || !provider) {
      return res.status(400).json({ message: 'Voice and provider are required' });
    }

    // Verify the user owns this campaign via their client account
    const clientUser = await db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.userId, userId))
      .limit(1);

    if (!clientUser.length) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const clientAccountId = clientUser[0].clientAccountId;

    // Find the campaign and verify ownership
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, parseInt(campaignId)))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Verify the campaign belongs to the client's work orders
    const workOrder = await db
      .select()
      .from(workOrders)
      .where(
        and(
          eq(workOrders.clientAccountId, clientAccountId),
          eq(workOrders.campaignId, campaign.id)
        )
      )
      .limit(1);

    if (!workOrder.length) {
      return res.status(403).json({ message: 'Not authorized to modify this campaign' });
    }

    // Update campaign voice provider
    const updatedSettings = {
      ...(campaign.aiAgentSettings as any || {}),
      persona: {
        ...((campaign.aiAgentSettings as any)?.persona || {}),
        voice,
      },
    };

    await db
      .update(campaigns)
      .set({
        voiceProvider: provider,
        aiAgentSettings: updatedSettings,
      })
      .where(eq(campaigns.id, campaign.id));

    // Also update the linked virtual agent if one exists
    if (campaign.virtualAgentId) {
      await db
        .update(virtualAgents)
        .set({ voice })
        .where(eq(virtualAgents.id, campaign.virtualAgentId));
    }

    console.log(`[CLIENT CAMPAIGNS] Voice updated for campaign ${campaignId}: ${provider}/${voice}`);
    res.json({ success: true, voice, provider });
  } catch (error) {
    console.error('[CLIENT CAMPAIGNS] Voice update error:', error);
    res.status(500).json({ message: 'Failed to update voice' });
  }
});

/**
 * GET /voice-options - Get available voice options
 */
router.get('/voice-options', async (req: Request, res: Response) => {
    // Official Google Gemini Live TTS voices (30 available)
    const voiceOptions = [
      // Female voices
      { id: 'Kore', name: 'Kore', gender: 'female', tone: 'warm', description: 'Warm, professional voice ideal for executive outreach' },
      { id: 'Aoede', name: 'Aoede', gender: 'female', tone: 'bright', description: 'Bright, engaging voice for mid-market outreach' },
      { id: 'Leda', name: 'Leda', gender: 'female', tone: 'youthful', description: 'Youthful, consultative voice for high-value prospects' },
      { id: 'Erinome', name: 'Erinome', gender: 'female', tone: 'clear', description: 'Clear, precise voice for informative content' },
      { id: 'Laomedeia', name: 'Laomedeia', gender: 'female', tone: 'upbeat', description: 'Upbeat, dynamic voice for engaging presentations' },
      { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'female', tone: 'forward', description: 'Forward, articulate voice for modern business' },
      { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'female', tone: 'gentle', description: 'Gentle, refined voice for premium experiences' },
      { id: 'Achernar', name: 'Achernar', gender: 'female', tone: 'soft', description: 'Soft, intimate voice for personal connections' },
      // Male voices
      { id: 'Puck', name: 'Puck', gender: 'male', tone: 'upbeat', description: 'Upbeat, friendly voice for warm outreach' },
      { id: 'Charon', name: 'Charon', gender: 'male', tone: 'informative', description: 'Informative, authoritative voice for technical audiences' },
      { id: 'Fenrir', name: 'Fenrir', gender: 'male', tone: 'bold', description: 'Bold, confident voice for enterprise sales' },
      { id: 'Orus', name: 'Orus', gender: 'male', tone: 'firm', description: 'Firm, confident voice for professional settings' },
      { id: 'Zephyr', name: 'Zephyr', gender: 'male', tone: 'bright', description: 'Bright, optimistic voice for engaging content' },
      { id: 'Enceladus', name: 'Enceladus', gender: 'male', tone: 'clear', description: 'Clear, direct voice for straightforward messaging' },
      { id: 'Iapetus', name: 'Iapetus', gender: 'male', tone: 'clear', description: 'Clear, even voice for balanced communication' },
      { id: 'Algenib', name: 'Algenib', gender: 'male', tone: 'raspy', description: 'Raspy, distinctive voice for memorable pitches' },
      { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'male', tone: 'informed', description: 'Informed, mature voice for executive discussions' },
      { id: 'Alnilam', name: 'Alnilam', gender: 'male', tone: 'firm', description: 'Firm, strong voice for authoritative presentations' },
      { id: 'Schedar', name: 'Schedar', gender: 'male', tone: 'even', description: 'Even, steady voice for professional calls' },
      { id: 'Gacrux', name: 'Gacrux', gender: 'male', tone: 'mature', description: 'Mature, experienced voice for senior audiences' },
      { id: 'Achird', name: 'Achird', gender: 'male', tone: 'friendly', description: 'Friendly, approachable voice for relationship building' },
      { id: 'Sadachbia', name: 'Sadachbia', gender: 'male', tone: 'lively', description: 'Lively, energetic voice for dynamic outreach' },
      { id: 'Sadaltager', name: 'Sadaltager', gender: 'male', tone: 'knowledgeable', description: 'Knowledgeable, articulate voice for consultative sales' },
      { id: 'Sulafat', name: 'Sulafat', gender: 'male', tone: 'warm', description: 'Warm, engaging voice for nurturing prospects' },
      { id: 'Pegasus', name: 'Pegasus', gender: 'male', tone: 'calm', description: 'Calm, authoritative voice for serious discussions' },
    ];
    res.json(voiceOptions);
});

/**
 * POST /voice-preview - Generate voice preview audio
 */
router.post('/voice-preview', async (req: Request, res: Response) => {
  try {
    const { voiceId, text, provider } = req.body;

    if (!voiceId || !text) {
      return res.status(400).json({ message: 'Voice ID and text are required' });
    }

    const maxPreviewChars = Math.min(
      Math.max(Number.parseInt(process.env.VOICE_PREVIEW_MAX_CHARS || '600', 10), 1),
      4000
    );
    const previewText = String(text).substring(0, maxPreviewChars);

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ message: 'OpenAI API key not configured' });
      }

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: voiceId,
          input: previewText,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI TTS failed: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      res.set('Content-Type', 'audio/mpeg');
      return res.send(Buffer.from(audioBuffer));
    }

    // Default: Google Cloud TTS (via rate-limited service)
    const { synthesizeSpeechRateLimited } = await import('../services/tts-rate-limiter');

    const voiceMap: Record<string, string> = {
      Puck: 'en-US-Neural2-A',
      Charon: 'en-US-Neural2-D',
      Kore: 'en-US-Neural2-C',
      Fenrir: 'en-US-Neural2-J',
      Aoede: 'en-US-Neural2-F',
      Orion: 'en-US-Neural2-I',
      Vega: 'en-US-Neural2-E',
      Pegasus: 'en-US-Neural2-J',
      Ursa: 'en-US-Neural2-D',
      Nova: 'en-US-Neural2-F',
      Dipper: 'en-US-Neural2-A',
      Capella: 'en-US-Neural2-C',
      Orbit: 'en-US-Neural2-I',
      Lyra: 'en-US-Neural2-E',
      Eclipse: 'en-US-Neural2-D',
    };

    const targetVoice = voiceMap[String(voiceId)] || String(voiceId);

    const audioBuffer = await synthesizeSpeechRateLimited(previewText, targetVoice, 'en-US', 'MP3');

    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (error) {
    console.error('[CLIENT CAMPAIGNS] Voice preview error:', error);
    res.status(500).json({ message: 'Failed to generate voice preview' });
  }
});

/**
 * POST /quick-create - Simplified campaign creation from client portal
 *
 * Creates a project (pending approval) + work order in one step.
 * Both campaign creation and work order creation require project approval.
 * Simplified mandatory fields only — most config is optional.
 */
router.post('/quick-create', campaignUpload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;

    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Parse JSON payload from multipart 'data' field, falling back to req.body
    const rawPayload = req.body.data ? JSON.parse(req.body.data) : req.body;

    // Simplified schema — only essential fields are required
    const quickCreateSchema = z.object({
      // Required
      name: z.string().min(1, 'Campaign name is required'),
      channel: z.enum(['voice', 'email', 'combo']),
      objective: z.string().min(1, 'Campaign objective is required'),

      // Optional — everything else
      description: z.string().optional(),
      campaignType: z.string().optional(),
      targetAudience: z.string().optional(),
      targetLeadCount: z.number().optional(),
      targetIndustries: z.array(z.string()).optional(),
      targetTitles: z.array(z.string()).optional(),
      targetRegions: z.array(z.string()).optional(),
      targetCompanySize: z.string().optional(),
      talkingPoints: z.array(z.string()).optional(),
      successCriteria: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      budget: z.number().optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),

      // Email-specific (optional)
      emailSubject: z.string().optional(),
      emailBody: z.string().optional(),

      // Voice-specific (optional)
      selectedVoice: z.string().optional(),
      selectedVoices: z.array(z.string()).optional(),
      selectedPersonaNames: z.record(z.string(), z.string()).optional(),
      callScript: z.string().optional(),

      // Whether to create a new project or link to existing
      projectId: z.string().optional(),

      // URLs (optional)
      referenceUrls: z.array(z.string()).optional(),
      landingPageUrl: z.string().optional(),

      // Argyle event linkage (optional)
      externalEventId: z.string().optional(),
      argyleDraftId: z.string().optional(),
      argyleFlow: z.boolean().optional(),
    });

    const data = quickCreateSchema.parse(rawPayload);
    const projectDescription =
      data.argyleFlow
        ? [data.objective, data.description].filter(Boolean).join('\n\n')
        : (data.description || data.objective);
    const workOrderDescription =
      data.argyleFlow
        ? [data.objective, data.description].filter(Boolean).join('\n\n')
        : (data.description || data.objective);

    if (data.argyleFlow && (!data.targetLeadCount || data.targetLeadCount <= 0)) {
      return res.status(400).json({ message: 'Target lead count is required for event campaign drafts' });
    }
    if (data.argyleFlow && !data.externalEventId && !data.argyleDraftId) {
      return res.status(400).json({ message: 'Event linkage is required for Argyle draft campaigns' });
    }

    // Optional Argyle linkage context and idempotency.
    let linkedEvent: {
      id: string;
      externalId: string;
      title: string;
      sourceUrl: string;
      location: string | null;
      eventType: string | null;
      community: string | null;
      startAtHuman: string | null;
      startAtIso: Date | null;
      overviewExcerpt: string | null;
      agendaExcerpt: string | null;
      speakersExcerpt: string | null;
    } | null = null;
    let linkedDraft: {
      id: string;
      status: string;
      workOrderId: string | null;
      externalEventId: string | null;
      draftFields: Record<string, unknown> | null;
      sourceFields: Record<string, unknown> | null;
      leadCount: number | null;
    } | null = null;
    let reusableRejectedOrder: {
      id: string;
      status: string;
      projectId: string | null;
    } | null = null;
    let reusableRejectedProjectId: string | null = null;

    if (data.externalEventId || data.argyleDraftId || data.argyleFlow) {
      if (data.externalEventId) {
        const [event] = await db
          .select({
            id: externalEvents.id,
            externalId: externalEvents.externalId,
            title: externalEvents.title,
            sourceUrl: externalEvents.sourceUrl,
            location: externalEvents.location,
            eventType: externalEvents.eventType,
            community: externalEvents.community,
            startAtHuman: externalEvents.startAtHuman,
            startAtIso: externalEvents.startAtIso,
            overviewExcerpt: externalEvents.overviewExcerpt,
            agendaExcerpt: externalEvents.agendaExcerpt,
            speakersExcerpt: externalEvents.speakersExcerpt,
          })
          .from(externalEvents)
          .where(
            and(
              eq(externalEvents.id, data.externalEventId),
              eq(externalEvents.clientId, clientAccountId),
            )
          )
          .limit(1);

        if (!event) {
          return res.status(404).json({ message: 'Argyle event not found' });
        }
        linkedEvent = event;
      }

      if (data.argyleDraftId) {
        const [draft] = await db
          .select({
            id: workOrderDrafts.id,
            status: workOrderDrafts.status,
            workOrderId: workOrderDrafts.workOrderId,
            externalEventId: workOrderDrafts.externalEventId,
            draftFields: workOrderDrafts.draftFields,
            sourceFields: workOrderDrafts.sourceFields,
            leadCount: workOrderDrafts.leadCount,
          })
          .from(workOrderDrafts)
          .where(
            and(
              eq(workOrderDrafts.id, data.argyleDraftId),
              eq(workOrderDrafts.clientAccountId, clientAccountId),
            )
          )
          .limit(1);

        if (!draft) {
          return res.status(404).json({ message: 'Argyle draft not found' });
        }
        linkedDraft = draft;
      }

      if (!linkedDraft && data.externalEventId) {
        const [draftByEvent] = await db
          .select({
            id: workOrderDrafts.id,
            status: workOrderDrafts.status,
            workOrderId: workOrderDrafts.workOrderId,
            externalEventId: workOrderDrafts.externalEventId,
            draftFields: workOrderDrafts.draftFields,
            sourceFields: workOrderDrafts.sourceFields,
            leadCount: workOrderDrafts.leadCount,
          })
          .from(workOrderDrafts)
          .where(
            and(
              eq(workOrderDrafts.clientAccountId, clientAccountId),
              eq(workOrderDrafts.externalEventId, data.externalEventId),
            )
          )
          .limit(1);
        linkedDraft = draftByEvent || null;
      }

      // Secondary idempotency key: same client + same event URL.
      if (!linkedDraft && linkedEvent?.sourceUrl) {
        const [draftByUrl] = await db
          .select({
            id: workOrderDrafts.id,
            status: workOrderDrafts.status,
            workOrderId: workOrderDrafts.workOrderId,
            externalEventId: workOrderDrafts.externalEventId,
            draftFields: workOrderDrafts.draftFields,
            sourceFields: workOrderDrafts.sourceFields,
            leadCount: workOrderDrafts.leadCount,
          })
          .from(workOrderDrafts)
          .innerJoin(externalEvents, eq(workOrderDrafts.externalEventId, externalEvents.id))
          .where(
            and(
              eq(workOrderDrafts.clientAccountId, clientAccountId),
              eq(externalEvents.sourceUrl, linkedEvent.sourceUrl),
            )
          )
          .limit(1);
        linkedDraft = draftByUrl || null;

        if (linkedDraft && linkedDraft.externalEventId !== linkedEvent.id) {
          await db
            .update(workOrderDrafts)
            .set({
              externalEventId: linkedEvent.id,
              updatedAt: new Date(),
            })
            .where(eq(workOrderDrafts.id, linkedDraft.id));
        }
      }

      if (!linkedDraft && linkedEvent) {
        const { generateSourceFields } = await import('../integrations/argyle_events/draft-generator');
        const sourceFields = generateSourceFields({
          externalId: linkedEvent.externalId,
          sourceUrl: linkedEvent.sourceUrl,
          title: linkedEvent.title,
          community: linkedEvent.community || undefined,
          eventType: linkedEvent.eventType || undefined,
          location: linkedEvent.location || undefined,
          dateHuman: linkedEvent.startAtHuman || undefined,
          dateIso: linkedEvent.startAtIso ? linkedEvent.startAtIso.toISOString() : null,
          overviewExcerpt: linkedEvent.overviewExcerpt || undefined,
          agendaExcerpt: linkedEvent.agendaExcerpt || undefined,
          speakersExcerpt: linkedEvent.speakersExcerpt || undefined,
        });
        const [createdDraft] = await db
          .insert(workOrderDrafts)
          .values({
            clientAccountId,
            clientUserId,
            externalEventId: linkedEvent.id,
            status: 'draft',
            sourceFields: sourceFields as any,
            draftFields: sourceFields as any,
            editedFields: [],
          })
          .returning({
            id: workOrderDrafts.id,
            status: workOrderDrafts.status,
            workOrderId: workOrderDrafts.workOrderId,
            externalEventId: workOrderDrafts.externalEventId,
            draftFields: workOrderDrafts.draftFields,
            sourceFields: workOrderDrafts.sourceFields,
            leadCount: workOrderDrafts.leadCount,
          });
        linkedDraft = createdDraft;
      }

      if (linkedDraft?.externalEventId && linkedEvent && linkedDraft.externalEventId !== linkedEvent.id) {
        return res.status(400).json({ message: 'Draft does not belong to the selected event' });
      }

      if (linkedDraft?.workOrderId) {
        const [linkedOrder] = await db
          .select({
            id: workOrders.id,
            status: workOrders.status,
            projectId: workOrders.projectId,
          })
          .from(workOrders)
          .where(
            and(
              eq(workOrders.id, linkedDraft.workOrderId),
              eq(workOrders.clientAccountId, clientAccountId),
            )
          )
          .limit(1);
        if (linkedOrder) {
          if (linkedOrder.status === 'rejected') {
            reusableRejectedOrder = linkedOrder;
          }

          if (linkedOrder.projectId) {
            const [linkedProject] = await db
              .select({
                id: clientProjects.id,
                status: clientProjects.status,
              })
              .from(clientProjects)
              .where(
                and(
                  eq(clientProjects.id, linkedOrder.projectId),
                  eq(clientProjects.clientAccountId, clientAccountId),
                )
              )
              .limit(1);

            if (linkedProject?.status === 'rejected') {
              reusableRejectedProjectId = linkedProject.id;
              reusableRejectedOrder = {
                id: linkedOrder.id,
                status: linkedOrder.status,
                projectId: linkedProject.id,
              };
            }
          }
        }
      }

      const eventIdForProjectLookup = linkedEvent?.id || linkedDraft?.externalEventId || data.externalEventId;
      if (!reusableRejectedProjectId && eventIdForProjectLookup) {
        const [eventLinkedProject] = await db
          .select({
            id: clientProjects.id,
            status: clientProjects.status,
          })
          .from(clientProjects)
          .where(
            and(
              eq(clientProjects.clientAccountId, clientAccountId),
              eq(clientProjects.externalEventId, eventIdForProjectLookup),
            )
          )
          .orderBy(desc(clientProjects.updatedAt))
          .limit(1);

        if (eventLinkedProject?.status === 'rejected') {
          reusableRejectedProjectId = eventLinkedProject.id;
        }
      }

      if (linkedDraft?.status === 'submitted' && linkedDraft.workOrderId) {
        const [existingOrder] = await db
          .select({
            id: workOrders.id,
            orderNumber: workOrders.orderNumber,
            title: workOrders.title,
            status: workOrders.status,
            campaignConfig: workOrders.campaignConfig,
            projectId: workOrders.projectId,
          })
          .from(workOrders)
          .where(
            and(
              eq(workOrders.id, linkedDraft.workOrderId),
              eq(workOrders.clientAccountId, clientAccountId),
            )
          )
          .limit(1);

        let hasActiveProjectForExistingOrder = false;
        if (existingOrder?.projectId && !reusableRejectedProjectId) {
          const [existingOrderProject] = await db
            .select({
              id: clientProjects.id,
              status: clientProjects.status,
            })
            .from(clientProjects)
            .where(
              and(
                eq(clientProjects.id, existingOrder.projectId),
                eq(clientProjects.clientAccountId, clientAccountId),
              )
            )
            .limit(1);

          if (existingOrderProject) {
            hasActiveProjectForExistingOrder = true;
            if (existingOrderProject.status === 'rejected') {
              reusableRejectedProjectId = existingOrderProject.id;
            }
          }
        }

        if (
          existingOrder &&
          existingOrder.status !== 'rejected' &&
          !reusableRejectedProjectId &&
          hasActiveProjectForExistingOrder
        ) {
          return res.status(200).json({
            success: true,
            existing: true,
            message: 'Campaign draft already submitted for this event',
            campaign: {
              id: existingOrder.id,
              orderNumber: existingOrder.orderNumber,
              name: existingOrder.title,
              status: existingOrder.status,
              channel: (existingOrder.campaignConfig as any)?.channel || 'email',
              type: (existingOrder.campaignConfig as any)?.campaignType || 'email',
              projectId: existingOrder.projectId || null,
              requiresApproval: true,
            },
          });
        }

        if (existingOrder) {
          reusableRejectedOrder = {
            id: existingOrder.id,
            status: existingOrder.status,
            projectId: existingOrder.projectId || reusableRejectedProjectId || null,
          };
        }
      }
    }

    // --- Step 1: Create or link project (pending approval) ---
    let projectId = data.projectId || reusableRejectedProjectId || reusableRejectedOrder?.projectId || '';
    const projectTypeForRequest: 'email_campaign' | 'call_campaign' | 'combo' =
      data.channel === 'email' ? 'email_campaign' : data.channel === 'voice' ? 'call_campaign' : 'combo';
    const linkedEventId = linkedEvent?.id || linkedDraft?.externalEventId || data.externalEventId || null;

    if (!data.projectId && (reusableRejectedProjectId || reusableRejectedOrder?.projectId)) {
      const projectIdToReopen = reusableRejectedProjectId || reusableRejectedOrder?.projectId;
      await db
        .update(clientProjects)
        .set({
          status: 'pending',
          rejectionReason: null,
          approvedBy: null,
          approvedAt: null,
          name: data.name,
          description: projectDescription,
          requestedLeadCount: data.targetLeadCount || null,
          budgetAmount: data.budget ? data.budget.toString() : null,
          landingPageUrl: data.landingPageUrl || null,
          projectType: projectTypeForRequest,
          externalEventId: linkedEventId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(clientProjects.id, projectIdToReopen!),
            eq(clientProjects.clientAccountId, clientAccountId),
          )
        );

      projectId = projectIdToReopen || projectId;
    }

    if (!projectId) {
      // Auto-create a project from campaign info
      const [newProject] = await db
        .insert(clientProjects)
        .values({
          clientAccountId,
          name: data.name,
          description: projectDescription,
          status: 'pending',
          requestedLeadCount: data.targetLeadCount || null,
          budgetAmount: data.budget ? data.budget.toString() : null,
          landingPageUrl: data.landingPageUrl || null,
          projectType: projectTypeForRequest,
          externalEventId: linkedEventId,
        })
        .returning({ id: clientProjects.id, name: clientProjects.name });

      projectId = newProject.id;

      // Notify admins about new project needing approval
      try {
        const [account] = await db
          .select({ name: clientAccounts.name })
          .from(clientAccounts)
          .where(eq(clientAccounts.id, clientAccountId));

        // Log for admin visibility
        console.log(`[CLIENT CAMPAIGNS] Quick-create: Project "${newProject.name}" created (pending approval) for ${account?.name || clientAccountId}`);
      } catch (notifyErr) {
        console.error('[CLIENT CAMPAIGNS] Notification error:', notifyErr);
      }
    } else {
      // Verify client owns the referenced project
      const [existingProject] = await db
        .select({ id: clientProjects.id, status: clientProjects.status, externalEventId: clientProjects.externalEventId })
        .from(clientProjects)
        .where(
          and(
            eq(clientProjects.id, projectId),
            eq(clientProjects.clientAccountId, clientAccountId)
          )
        )
        .limit(1);

      if (!existingProject) {
        return res.status(404).json({ message: 'Project not found or access denied' });
      }

      // Project must be approved (active) for immediate campaign creation
      // If still pending, the work order is created but won't be processed until approval
      if (existingProject.status === 'rejected') {
        return res.status(400).json({ message: 'Cannot create campaign under a rejected project' });
      }

      if (linkedEventId && existingProject.externalEventId && existingProject.externalEventId !== linkedEventId) {
        return res.status(400).json({ message: 'Project is linked to a different event' });
      }

      if (linkedEventId && !existingProject.externalEventId) {
        await db
          .update(clientProjects)
          .set({
            externalEventId: linkedEventId,
            projectType: projectTypeForRequest,
            landingPageUrl: data.landingPageUrl || null,
            updatedAt: new Date(),
          })
          .where(eq(clientProjects.id, projectId));
      }
    }

    // --- Step 2: Create work order with campaign config ---
    const orderNumber = await generateOrderNumber();

    const defaultCampaignType = data.channel === 'email'
      ? 'email'
      : data.channel === 'combo'
        ? 'combo'
        : 'call';

    const campaignConfig: Record<string, unknown> = {
      channel: data.channel,
      campaignType: data.campaignType || defaultCampaignType,
      objective: data.objective,
      talkingPoints: data.talkingPoints?.filter((p: string) => p.trim()) || [],
      successCriteria: data.successCriteria || '',
      targetAudience: data.targetAudience || '',
      audienceSource: 'request_handling',
    };

    // Add channel-specific config
    if (data.channel === 'email' || data.channel === 'combo') {
      campaignConfig.emailSubject = data.emailSubject || '';
      campaignConfig.emailBody = data.emailBody || '';
    }
    if (data.channel === 'voice' || data.channel === 'combo') {
      const normalizedSelectedVoices = (data.selectedVoices?.filter((v: string) => v?.trim())?.length
        ? data.selectedVoices.filter((v: string) => v?.trim())
        : data.selectedVoice
          ? [data.selectedVoice]
          : undefined);

      campaignConfig.aiAgent = {
        voice: normalizedSelectedVoices?.[0] || data.selectedVoice || 'Aoede',
        voices: normalizedSelectedVoices,
        personaNames: data.selectedPersonaNames,
        persona: 'professional',
        tone: 'professional',
        openingScript: data.callScript || '',
      };
    }

    // Add URLs
    if (data.referenceUrls?.length) campaignConfig.referenceUrls = data.referenceUrls;
    if (data.landingPageUrl) campaignConfig.landingPageUrl = data.landingPageUrl;

    // Store uploaded file attachments as base64 in campaignConfig (no cloud storage)
    const uploadedFiles = req.files as Express.Multer.File[] | undefined;
    const fileCategories: string[] = Array.isArray(req.body.fileCategories)
      ? req.body.fileCategories
      : req.body.fileCategories
        ? [req.body.fileCategories]
        : [];

    if (uploadedFiles && uploadedFiles.length > 0) {
      campaignConfig.attachments = uploadedFiles.map((f, i) => ({
        name: f.originalname,
        size: f.size,
        type: f.mimetype,
        category: fileCategories[i] || 'asset',
        data: f.buffer.toString('base64'),
      }));
    }

    let newOrder: {
      id: string;
      orderNumber: string;
      title: string;
      status: string;
    };

    if (reusableRejectedOrder) {
      const [updatedOrder] = await db
        .update(workOrders)
        .set({
          title: data.name,
          description: workOrderDescription,
          orderType: mapChannelToOrderType(data.channel, data.campaignType || defaultCampaignType),
          priority: data.priority,
          status: 'submitted',
          projectId,
          targetIndustries: data.targetIndustries?.length ? data.targetIndustries : null,
          targetTitles: data.targetTitles?.length ? data.targetTitles : null,
          targetCompanySize: data.targetCompanySize || null,
          targetRegions: data.targetRegions?.length ? data.targetRegions : null,
          targetLeadCount: data.targetLeadCount || null,
          requestedStartDate: data.startDate || null,
          requestedEndDate: data.endDate || null,
          estimatedBudget: data.budget ? data.budget.toString() : null,
          campaignConfig,
          rejectionReason: null,
          rejectedAt: null,
          rejectedBy: null,
          submittedAt: new Date(),
          reviewedBy: null,
          reviewedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(workOrders.id, reusableRejectedOrder.id))
        .returning({
          id: workOrders.id,
          orderNumber: workOrders.orderNumber,
          title: workOrders.title,
          status: workOrders.status,
        });
      newOrder = updatedOrder;
    } else {
      const [insertedOrder] = await db
        .insert(workOrders)
        .values({
          orderNumber,
          clientAccountId,
          clientUserId,
          title: data.name,
          description: workOrderDescription,
          orderType: mapChannelToOrderType(data.channel, data.campaignType || defaultCampaignType),
          priority: data.priority,
          status: 'submitted',
          projectId,
          targetIndustries: data.targetIndustries?.length ? data.targetIndustries : null,
          targetTitles: data.targetTitles?.length ? data.targetTitles : null,
          targetCompanySize: data.targetCompanySize || null,
          targetRegions: data.targetRegions?.length ? data.targetRegions : null,
          targetLeadCount: data.targetLeadCount || null,
          requestedStartDate: data.startDate || null,
          requestedEndDate: data.endDate || null,
          estimatedBudget: data.budget ? data.budget.toString() : null,
          campaignConfig,
          submittedAt: new Date(),
        })
        .returning({
          id: workOrders.id,
          orderNumber: workOrders.orderNumber,
          title: workOrders.title,
          status: workOrders.status,
        });
      newOrder = insertedOrder;
    }

    if (linkedDraft) {
      const existingDraftFields = (linkedDraft.draftFields || {}) as Record<string, unknown>;
      await db
        .update(workOrderDrafts)
        .set({
          status: 'submitted',
          workOrderId: newOrder.id,
          submittedAt: new Date(),
          leadCount: data.targetLeadCount || linkedDraft.leadCount || null,
          draftFields: {
            ...existingDraftFields,
            title: data.name,
            description: workOrderDescription || existingDraftFields.description || '',
            objective: data.objective,
            targetAudience: data.targetTitles?.length ? data.targetTitles : existingDraftFields.targetAudience,
            targetIndustries: data.targetIndustries?.length ? data.targetIndustries : existingDraftFields.targetIndustries,
            sourceUrl: data.landingPageUrl || linkedEvent?.sourceUrl || existingDraftFields.sourceUrl || '',
            eventLocation: linkedEvent?.location || existingDraftFields.eventLocation || '',
          } as any,
          updatedAt: new Date(),
        })
        .where(eq(workOrderDrafts.id, linkedDraft.id));
    }

    // --- Step 3: Log activity ---
    try {
      const { clientPortalActivityLogs } = await import('@shared/schema');
      await db.insert(clientPortalActivityLogs).values({
        clientAccountId,
        clientUserId: clientUserId || null,
        entityType: 'campaign',
        entityId: newOrder.id,
        action: 'campaign_quick_created',
        details: {
          name: data.name,
          channel: data.channel,
          projectId,
          orderNumber: newOrder.orderNumber,
          requiresApproval: true,
          externalEventId: linkedEventId,
          argyleDraftId: linkedDraft?.id || null,
        },
      });
    } catch (logErr) {
      console.error('[CLIENT CAMPAIGNS] Activity log error:', logErr);
    }

    res.status(201).json({
      success: true,
      message: 'Campaign submitted successfully. It will be activated after project approval.',
      campaign: {
        id: newOrder.id,
        orderNumber: newOrder.orderNumber,
        name: newOrder.title,
        status: newOrder.status,
        channel: data.channel,
        type: data.campaignType || defaultCampaignType,
        projectId,
        requiresApproval: true,
        externalEventId: linkedEventId,
        argyleDraftId: linkedDraft?.id || null,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    const errMsg = error?.message || String(error);
    const errDetail = error?.detail || error?.code || '';
    console.error('[CLIENT CAMPAIGNS] Quick-create error:', errMsg, errDetail);
    console.error('[CLIENT CAMPAIGNS] Full error:', error);
    res.status(500).json({
      message: 'Failed to create campaign',
      error: process.env.NODE_ENV !== 'production' ? errMsg : undefined,
    });
  }
});

/**
 * GET /projects-for-campaign - List approved projects for campaign linking
 */
router.get('/projects-for-campaign', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { clientProjects } = await import('@shared/schema');

    const projects = await db
      .select({
        id: clientProjects.id,
        name: clientProjects.name,
        status: clientProjects.status,
        description: clientProjects.description,
      })
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.clientAccountId, clientAccountId),
          inArray(clientProjects.status, ['active', 'pending', 'draft'])
        )
      )
      .orderBy(desc(clientProjects.createdAt));

    res.json(projects);
  } catch (error) {
    console.error('[CLIENT CAMPAIGNS] Projects list error:', error);
    res.status(500).json({ message: 'Failed to fetch projects' });
  }
});

// ==================== HELPER: Campaign Access Verification ====================

async function verifyCampaignAccess(campaignId: string, clientAccountId: string): Promise<{ hasAccess: boolean; campaign?: any }> {
  const [campaign] = await db
    .select({ id: campaigns.id, name: campaigns.name, clientAccountId: campaigns.clientAccountId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) return { hasAccess: false };

  if (campaign.clientAccountId === clientAccountId) {
    return { hasAccess: true, campaign };
  }

  const [access] = await db
    .select({ id: clientCampaignAccess.id })
    .from(clientCampaignAccess)
    .where(
      and(
        eq(clientCampaignAccess.clientAccountId, clientAccountId),
        or(
          eq(clientCampaignAccess.campaignId, campaignId),
          eq(clientCampaignAccess.regularCampaignId, campaignId)
        )
      )
    )
    .limit(1);

  return { hasAccess: !!access, campaign: access ? campaign : undefined };
}

// ==================== QUEUE INTELLIGENCE ROUTES (CLIENT PORTAL) ====================

/**
 * GET /:id/queue-intelligence/overview
 * Score distribution, tier breakdown, top contacts (read-only for clients)
 */
router.get('/:id/queue-intelligence/overview', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { id: campaignId } = req.params;
    const { hasAccess } = await verifyCampaignAccess(campaignId, clientAccountId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const data = await getQueueIntelligenceOverview(campaignId, clientAccountId);
    res.json(data);
  } catch (error: any) {
    console.error('[CLIENT QI] Overview error:', error);
    res.status(500).json({ message: error.message || 'Failed to get overview' });
  }
});

/**
 * GET /:id/queue-intelligence/segment-analysis
 * Detailed tier breakdown with industry/role distribution (read-only)
 */
router.get('/:id/queue-intelligence/segment-analysis', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { id: campaignId } = req.params;
    const { hasAccess } = await verifyCampaignAccess(campaignId, clientAccountId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const data = await getSegmentAnalysis(campaignId, clientAccountId);
    res.json(data);
  } catch (error: any) {
    console.error('[CLIENT QI] Segment analysis error:', error);
    res.status(500).json({ message: error.message || 'Failed to get segment analysis' });
  }
});

/**
 * GET /:id/queue-intelligence/contact-scores
 * Paginated, sortable contact list with AI scores (read-only)
 */
router.get('/:id/queue-intelligence/contact-scores', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { id: campaignId } = req.params;
    const { hasAccess } = await verifyCampaignAccess(campaignId, clientAccountId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const sortBy = (req.query.sortBy as string) || 'score';
    const tier = req.query.tier as string | undefined;

    const data = await getContactScores(campaignId, clientAccountId, { page, limit, sortBy, tier });
    res.json(data);
  } catch (error: any) {
    console.error('[CLIENT QI] Contact scores error:', error);
    res.status(500).json({ message: error.message || 'Failed to get contact scores' });
  }
});

/**
 * GET /:id/queue-intelligence/live-stats
 * Live queue stats: country distribution, phone status, priority breakdown,
 * next-in-line contacts, timezone analysis (read-only)
 */
router.get('/:id/queue-intelligence/live-stats', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) return res.status(401).json({ message: 'Unauthorized' });

    const { id: campaignId } = req.params;
    const { hasAccess } = await verifyCampaignAccess(campaignId, clientAccountId);
    if (!hasAccess) return res.status(403).json({ message: 'Access denied' });

    // Run all independent queries in parallel
    const [
      countryRows,
      phoneRows,
      statusRows,
      nextInLineRows,
      priorityRows,
      timezoneAnalysis,
    ] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(NULLIF(TRIM(c.country), ''), 'Unknown') AS country,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE cq.status = 'queued')::int AS queued,
          COUNT(*) FILTER (WHERE cq.status = 'in_progress')::int AS in_progress,
          COUNT(*) FILTER (WHERE cq.status = 'done')::int AS done
        FROM campaign_queue cq
        INNER JOIN contacts c ON c.id = cq.contact_id
        WHERE cq.campaign_id = $1
          AND cq.status IN ('queued', 'in_progress', 'done')
        GROUP BY COALESCE(NULLIF(TRIM(c.country), ''), 'Unknown')
        ORDER BY total DESC
        LIMIT 30
      `, [campaignId]),

      pool.query(`
        SELECT
          COUNT(*)::int AS total_queued,
          COUNT(*) FILTER (
            WHERE COALESCE(
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'dialing_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone', '')), '')
            ) IS NOT NULL
          )::int AS has_phone,
          COUNT(*) FILTER (
            WHERE COALESCE(
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'dialing_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone_e164', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone', '')), ''),
              NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone', '')), '')
            ) IS NULL
          )::int AS missing_phone,
          COUNT(*) FILTER (
            WHERE NULLIF(TRIM(COALESCE(to_jsonb(c)->>'dialing_phone_e164', '')), '') IS NOT NULL
          )::int AS e164_normalized,
          COUNT(*) FILTER (
            WHERE NULLIF(TRIM(COALESCE(to_jsonb(c)->>'phone_verified_at', '')), '') IS NOT NULL
          )::int AS verified
        FROM campaign_queue cq
        INNER JOIN contacts c ON c.id = cq.contact_id
        WHERE cq.campaign_id = $1
          AND cq.status = 'queued'
      `, [campaignId]),

      pool.query(`
        SELECT status, COUNT(*)::int AS count
        FROM campaign_queue
        WHERE campaign_id = $1
        GROUP BY status
        ORDER BY count DESC
      `, [campaignId]),

      pool.query(`
        SELECT
          cq.id AS queue_id,
          cq.priority,
          NULLIF(TRIM(COALESCE(to_jsonb(cq)->>'ai_priority_score', '')), '')::int AS ai_priority_score,
          cq.next_attempt_at,
          cq.status,
          c.id AS contact_id,
          COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.last_name, 'Unknown') AS contact_name,
          NULLIF(TRIM(COALESCE(to_jsonb(c)->>'job_title', '')), '') AS job_title,
          NULLIF(TRIM(COALESCE(to_jsonb(c)->>'seniority_level', '')), '') AS seniority_level,
          NULLIF(TRIM(COALESCE(to_jsonb(c)->>'country', '')), '') AS country,
          NULLIF(TRIM(COALESCE(to_jsonb(c)->>'timezone', '')), '') AS timezone,
          COALESCE(
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'dialing_phone_e164', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone_e164', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone_e164', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'mobile_phone', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(c)->>'direct_phone', '')), '')
          ) AS best_phone,
          a.name AS account_name,
          COALESCE(
            NULLIF(TRIM(COALESCE(to_jsonb(a)->>'industry_standardized', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(a)->>'industry_raw', '')), ''),
            NULLIF(TRIM(COALESCE(to_jsonb(a)->>'industry_ai_suggested', '')), '')
          ) AS industry
        FROM campaign_queue cq
        INNER JOIN contacts c ON c.id = cq.contact_id
        LEFT JOIN accounts a ON a.id = cq.account_id
        WHERE cq.campaign_id = $1
          AND cq.status = 'queued'
          AND (cq.next_attempt_at IS NULL OR cq.next_attempt_at <= NOW())
        ORDER BY
          cq.priority DESC,
          NULLIF(TRIM(COALESCE(to_jsonb(cq)->>'ai_priority_score', '')), '')::int DESC NULLS LAST,
          cq.created_at ASC
        LIMIT 15
      `, [campaignId]),

      pool.query(`
        SELECT
          CASE
            WHEN priority >= 400 THEN 'Top Priority (400+)'
            WHEN priority >= 200 THEN 'High (200-399)'
            WHEN priority >= 100 THEN 'Medium (100-199)'
            WHEN priority >= 50  THEN 'Low (50-99)'
            ELSE 'Minimal (0-49)'
          END AS tier,
          COUNT(*)::int AS count,
          AVG(priority)::int AS avg_priority,
          MIN(priority)::int AS min_priority,
          MAX(priority)::int AS max_priority
        FROM campaign_queue
        WHERE campaign_id = $1
          AND status = 'queued'
        GROUP BY
          CASE
            WHEN priority >= 400 THEN 'Top Priority (400+)'
            WHEN priority >= 200 THEN 'High (200-399)'
            WHEN priority >= 100 THEN 'Medium (100-199)'
            WHEN priority >= 50  THEN 'Low (50-99)'
            ELSE 'Minimal (0-49)'
          END
        ORDER BY max_priority DESC
      `, [campaignId]),

      analyzeCampaignTimezones(campaignId),
    ]);

    const statusMap: Record<string, number> = {};
    let totalInQueue = 0;
    for (const row of statusRows.rows) {
      statusMap[row.status] = row.count;
      totalInQueue += row.count;
    }

    const phone = phoneRows.rows[0] || { total_queued: 0, has_phone: 0, missing_phone: 0, e164_normalized: 0, verified: 0 };

    res.json({
      campaignId,
      generatedAt: new Date().toISOString(),
      queueStatus: {
        total: totalInQueue,
        queued: statusMap['queued'] || 0,
        inProgress: statusMap['in_progress'] || 0,
        done: statusMap['done'] || 0,
        removed: statusMap['removed'] || 0,
      },
      countryDistribution: countryRows.rows.map(r => ({
        country: r.country,
        total: r.total,
        queued: r.queued,
        inProgress: r.in_progress,
        done: r.done,
      })),
      phoneStatus: {
        totalQueued: Number(phone.total_queued),
        hasPhone: Number(phone.has_phone),
        missingPhone: Number(phone.missing_phone),
        e164Normalized: Number(phone.e164_normalized),
        verified: Number(phone.verified),
        phoneRate: phone.total_queued > 0
          ? Math.round((phone.has_phone / phone.total_queued) * 100)
          : 0,
      },
      priorityTiers: priorityRows.rows.map(r => ({
        tier: r.tier,
        count: r.count,
        avgPriority: r.avg_priority,
        minPriority: r.min_priority,
        maxPriority: r.max_priority,
      })),
      nextInLine: nextInLineRows.rows.map(r => ({
        queueId: r.queue_id,
        contactId: r.contact_id,
        contactName: r.contact_name,
        jobTitle: r.job_title,
        seniorityLevel: r.seniority_level,
        accountName: r.account_name,
        industry: r.industry,
        country: r.country,
        timezone: r.timezone,
        bestPhone: r.best_phone ? '****' + r.best_phone.slice(-4) : null,
        priority: r.priority,
        aiPriorityScore: r.ai_priority_score,
        nextAttemptAt: r.next_attempt_at,
      })),
      timezoneAnalysis: {
        totalCallableNow: timezoneAnalysis.totalCallableNow,
        totalSleeping: timezoneAnalysis.totalSleeping,
        totalUnknownTimezone: timezoneAnalysis.totalUnknownTimezone,
        groups: timezoneAnalysis.timezoneGroups.map(g => ({
          timezone: g.timezone,
          contactCount: g.contactCount,
          isCurrentlyOpen: g.isCurrentlyOpen,
          opensAt: g.opensAt,
          suggestedPriority: g.suggestedPriority,
          country: g.country,
        })),
      },
    });
  } catch (error: any) {
    console.error('[CLIENT QI] Live stats error:', error);
    res.status(500).json({ message: error.message || 'Failed to get live stats' });
  }
});

// ==================== PROMO SUBMISSIONS ====================

/**
 * GET /:id/promo-submissions - Get form submissions for promo pages linked to a campaign
 */
router.get('/:id/promo-submissions', async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    // Find all content promotion pages linked to this campaign
    const pages = await db
      .select({ id: contentPromotionPages.id, title: contentPromotionPages.title, slug: contentPromotionPages.slug })
      .from(contentPromotionPages)
      .where(eq(contentPromotionPages.campaignId, campaignId));

    if (pages.length === 0) {
      return res.json({ submissions: [], total: 0 });
    }

    const pageIds = pages.map((p) => p.id);
    const pageMap = Object.fromEntries(pages.map((p) => [p.id, p]));

    // Get form_submit events for these pages
    const submissions = await db
      .select()
      .from(contentPromotionPageViews)
      .where(
        and(
          inArray(contentPromotionPageViews.pageId, pageIds),
          eq(contentPromotionPageViews.eventType, 'form_submit')
        )
      )
      .orderBy(desc(contentPromotionPageViews.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contentPromotionPageViews)
      .where(
        and(
          inArray(contentPromotionPageViews.pageId, pageIds),
          eq(contentPromotionPageViews.eventType, 'form_submit')
        )
      );

    const mapped = submissions.map((s) => {
      const formData = s.formData as Record<string, any> | null;
      const page = pageMap[s.pageId];
      return {
        id: s.id,
        visitorFirstName: s.visitorFirstName,
        visitorLastName: s.visitorLastName,
        visitorEmail: s.visitorEmail,
        visitorCompany: s.visitorCompany,
        jobTitle: formData?.jobTitle || null,
        formData,
        createdAt: s.createdAt,
        pageTitle: page?.title || null,
        pageSlug: page?.slug || null,
      };
    });

    res.json({ submissions: mapped, total: countResult?.count || 0 });
  } catch (error: any) {
    console.error('[CLIENT CAMPAIGNS] Promo submissions error:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch submissions' });
  }
});

export default router;
