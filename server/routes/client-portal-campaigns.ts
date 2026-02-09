/**
 * Client Portal Campaigns Routes
 *
 * Handles campaign creation from the wizard, AI agent configuration,
 * and audience management for client portal users.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  workOrders,
  clientAccounts,
  clientUsers,
  campaigns,
  campaignIntakeRequests,
  virtualAgents,
} from '@shared/schema';
import { z } from 'zod';
import { isFeatureEnabled } from '../feature-flags';

const router = Router();

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

    // Also include campaigns created from approved intake requests (agentic orders)
    const approvedIntakeStatuses = ['approved', 'qso_approved', 'in_progress', 'completed'] as const;

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
      .where(and(
        eq(campaignIntakeRequests.clientAccountId, clientAccountId),
        inArray(campaignIntakeRequests.status, approvedIntakeStatuses as any)
      ))
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
    if (isFeatureEnabled('client_campaign_listing_v2')) {
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

    res.json([...clientCampaigns, ...mappedIntakeCampaigns, ...directCampaigns]);
  } catch (error) {
     console.error('[CLIENT CAMPAIGNS] List error:', error);
     res.status(500).json({ message: 'Failed to list campaigns' });
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

export default router;
