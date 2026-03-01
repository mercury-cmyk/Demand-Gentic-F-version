
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  workOrders,
  clientAccounts,
  clientUsers,
  campaigns,
  virtualAgents,
  users,
} from '@shared/schema';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth';

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
 * POST /create - Create a new campaign from the wizard (ADMIN)
 */
router.post('/create', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const campaignSchema = z.object({
      // Admin specific - required to associate campaign with a client
      clientAccountId: z.string().min(1, 'Client Account ID is required. Please select a client before creating a campaign.'),
      
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

    // Verify client account exists
    const clientAccount = await db.query.clientAccounts.findFirst({
        where: eq(clientAccounts.id, data.clientAccountId)
    });

    if (!clientAccount) {
        return res.status(404).json({ message: 'Client account not found' });
    }

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
        clientAccountId: data.clientAccountId,
        // No clientUserId because created by Admin
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
    console.error('[ADMIN CAMPAIGNS] Create campaign error:', error);
    res.status(500).json({ message: 'Failed to create campaign' });
  }
});

// Re-use voices/agents endpoints for Admin if needed, or point frontend to client-portal ones (if they are public? no they are auth protected)

/**
 * GET /voices - Get available AI voices for preview
 */
router.get('/voices', requireAuth, async (req: Request, res: Response) => {
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
      console.error('[ADMIN CAMPAIGNS] Get voices error:', error);
      res.status(500).json({ message: 'Failed to fetch voices' });
    }
  });

router.get('/agents', requireAuth, async (req: Request, res: Response) => {
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
    console.error('[ADMIN CAMPAIGNS] Get agents error:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
});

router.post('/voice-preview', requireAuth, async (req: Request, res: Response) => {
    try {
      const { voiceId, text } = req.body;

      if (!voiceId || !text) {
        return res.status(400).json({ message: 'Voice ID and text are required' });
      }

      res.json({
        success: true,
        message: 'Voice preview generated',
        voiceId,
      });
    } catch (error) {
      console.error('[ADMIN CAMPAIGNS] Voice preview error:', error);
      res.status(500).json({ message: 'Failed to generate voice preview' });
    }
  });

export default router;
