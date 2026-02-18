/**
 * Client Portal Campaigns Routes
 *
 * Handles campaign creation from the wizard, AI agent configuration,
 * and audience management for client portal users.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, or, desc, sql, inArray, isNull, asc } from 'drizzle-orm';
import {
  workOrders,
  clientAccounts,
  clientUsers,
  campaigns,
  campaignIntakeRequests,
  virtualAgents,
  campaignQueue,
  callAttempts,
  dialerCallAttempts,
  leads,
  clientCampaignAccess,
  contacts,
  accounts,
} from '@shared/schema';
import { z } from 'zod';
import { isFeatureEnabled } from '../feature-flags';
import multer from 'multer';
import { notificationService } from '../services/notification-service';

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

    // Fetch campaigns linked to work orders for this client
    const clientCampaigns = await db
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
      .where(eq(workOrders.clientAccountId, clientAccountId))
      .orderBy(desc(campaigns.createdAt));

    const campaignIds = new Set(clientCampaigns.map((c) => c.id));

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
        intakeStatus: campaignIntakeRequests.status,
        intakeRequestId: campaignIntakeRequests.id,
        requestedLeadCount: campaignIntakeRequests.requestedLeadCount,
      })
      .from(campaigns)
      .innerJoin(campaignIntakeRequests, eq(campaigns.id, campaignIntakeRequests.campaignId))
      .where(eq(campaignIntakeRequests.clientAccountId, clientAccountId))
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
    let directCampaigns: typeof clientCampaigns = [];
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

    const campaignsList = [...clientCampaigns, ...mappedIntakeCampaigns, ...directCampaigns];
    const campaignIdList = campaignsList.map((c) => c.id);

    if (campaignIdList.length === 0) {
      return res.json([]);
    }

    // Enrich with stats using batched aggregate queries (avoid per-campaign N+1 query fanout)
    const [queueStatsRows, attemptStatsRows, leadStatsRows, dialerCallStatsRows] = await Promise.all([
      db
        .select({
          campaignId: campaignQueue.campaignId,
          total: sql<number>`count(*)::int`,
          pending: sql<number>`sum(case when status = 'queued' or status = 'pending' then 1 else 0 end)::int`,
        })
        .from(campaignQueue)
        .where(inArray(campaignQueue.campaignId, campaignIdList))
        .groupBy(campaignQueue.campaignId),
      db
        .select({
          campaignId: callAttempts.campaignId,
          count: sql<number>`count(*)::int`,
        })
        .from(callAttempts)
        .where(inArray(callAttempts.campaignId, campaignIdList))
        .groupBy(callAttempts.campaignId),
      db
        .select({
          campaignId: leads.campaignId,
          count: sql<number>`count(*)::int`,
        })
        .from(leads)
        .where(inArray(leads.campaignId, campaignIdList))
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
        deliveredCount: attempts,
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

    res.json(campaignsWithStats);
  } catch (error) {
     console.error('[CLIENT CAMPAIGNS] List error:', error);
     res.status(500).json({ message: 'Failed to list campaigns' });
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
        voice: data.selectedVoice,
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
      .returning();

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

    // Default: Google Cloud TTS
    const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
    const client = new TextToSpeechClient();

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
    const isNeural = targetVoice.includes('Neural2');

    const [ttsResponse] = await client.synthesizeSpeech({
      input: { text: previewText },
      voice: {
        languageCode: isNeural
          ? targetVoice.startsWith('en-GB')
            ? 'en-GB'
            : 'en-US'
          : 'en-US',
        name: targetVoice,
      },
      audioConfig: { audioEncoding: 'MP3' as const },
    });

    res.set('Content-Type', 'audio/mpeg');
    res.send(ttsResponse.audioContent);
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
      callScript: z.string().optional(),

      // Whether to create a new project or link to existing
      projectId: z.string().optional(),

      // URLs (optional)
      referenceUrls: z.array(z.string()).optional(),
      landingPageUrl: z.string().optional(),
    });

    const data = quickCreateSchema.parse(rawPayload);

    // --- Step 1: Create or link project (pending approval) ---
    let projectId = data.projectId;

    if (!projectId) {
      // Auto-create a project from campaign info
      const { clientProjects } = await import('@shared/schema');
      const [newProject] = await db
        .insert(clientProjects)
        .values({
          clientAccountId,
          name: data.name,
          description: data.description || data.objective,
          status: 'pending',
          requestedLeadCount: data.targetLeadCount || null,
          budgetAmount: data.budget ? data.budget.toString() : null,
        })
        .returning();

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
      const { clientProjects } = await import('@shared/schema');
      const [existingProject] = await db
        .select({ id: clientProjects.id, status: clientProjects.status })
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
      campaignConfig.aiAgent = {
        voice: data.selectedVoice || 'Aoede',
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

    const [newOrder] = await db
      .insert(workOrders)
      .values({
        orderNumber,
        clientAccountId,
        clientUserId,
        title: data.name,
        description: data.description || data.objective,
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
      .returning();

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
          orderNumber,
          requiresApproval: true,
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
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CLIENT CAMPAIGNS] Quick-create error:', error);
    res.status(500).json({ message: 'Failed to create campaign' });
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

export default router;
