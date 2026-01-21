import { Router } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import {
  previewStudioSessions,
  previewSimulationTranscripts,
  previewGeneratedContent,
  campaigns,
  accounts,
  contacts,
  campaignAgentAssignments,
  leads,
  type PreviewStudioSession,
  type PreviewSimulationTranscript,
  type PreviewGeneratedContent,
} from "@shared/schema";
import {
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  getAccountProfileData,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
  type AccountProfileData,
} from "../services/account-messaging-service";
import { generateJSON, chat } from "../services/vertex-ai/vertex-client";
import {
  getOrBuildAccountCallBrief,
  getOrBuildParticipantCallPlan,
  buildParticipantCallContext,
  type AccountCallBriefPayload,
  type ParticipantCallPlanPayload,
  type ParticipantCallContext,
} from "../services/account-call-service";
import { ensureVoiceAgentControlLayer } from "../services/voice-agent-control-defaults";
import {
  getVirtualAgentConfig,
  mergeAgentSettings,
  type VirtualAgentSettings,
} from "../services/virtual-agent-settings";

type AgentSettingsSource = 'agent' | 'default';

type VirtualAgentConfig = {
  systemPrompt: string | null;
  firstMessage: string | null;
  voice: string | null;
  provider: string | null;
  settings: Partial<VirtualAgentSettings> | null;
};

type PromptVariantPerspective =
  | 'consultative'
  | 'direct_value'
  | 'pain_point'
  | 'social_proof'
  | 'educational'
  | 'urgent'
  | 'relationship';

type VariantSelectionMethod = 'default' | 'manual';

const PREVIEW_PHONE_TEST_DEFAULT_FIRST_MESSAGE =
  "Hello, may I speak with the person responsible for technology decisions?";

async function resolveVirtualAgentId(params: {
  campaignId: string;
  virtualAgentId?: string | null;
}): Promise<string | null> {
  if (params.virtualAgentId) {
    console.log(`[Preview Studio] Using provided virtualAgentId: ${params.virtualAgentId}`);
    return params.virtualAgentId;
  }

  console.log(`[Preview Studio] Looking up virtual agent for campaign: ${params.campaignId}`);

  // First, check all assignments for this campaign (for debugging)
  const allAssignments = await db
    .select({
      id: campaignAgentAssignments.id,
      virtualAgentId: campaignAgentAssignments.virtualAgentId,
      agentId: campaignAgentAssignments.agentId,
      agentType: campaignAgentAssignments.agentType,
      isActive: campaignAgentAssignments.isActive,
    })
    .from(campaignAgentAssignments)
    .where(eq(campaignAgentAssignments.campaignId, params.campaignId));

  console.log(`[Preview Studio] Found ${allAssignments.length} assignments for campaign:`,
    allAssignments.map(a => ({
      id: a.id,
      virtualAgentId: a.virtualAgentId,
      agentId: a.agentId,
      agentType: a.agentType,
      isActive: a.isActive
    }))
  );

  // Now query for active virtual agent assignment
  // Virtual agents are assigned with agentType: 'ai' (not 'virtual')
  const [assignment] = await db
    .select({ virtualAgentId: campaignAgentAssignments.virtualAgentId })
    .from(campaignAgentAssignments)
    .where(
      and(
        eq(campaignAgentAssignments.campaignId, params.campaignId),
        eq(campaignAgentAssignments.isActive, true),
        eq(campaignAgentAssignments.agentType, 'ai')
      )
    )
    .limit(1);

  console.log(`[Preview Studio] Active AI agent assignment query result:`, assignment);

  if (!assignment?.virtualAgentId) {
    console.log(`[Preview Studio] No active virtual agent found for campaign ${params.campaignId}`);
  } else {
    console.log(`[Preview Studio] Found virtual agent: ${assignment.virtualAgentId}`);
  }

  return assignment?.virtualAgentId ?? null;
}

async function getAgentSimulationSettings(virtualAgentId: string | null): Promise<{
  agentConfig: VirtualAgentConfig | null;
  mergedSettings: VirtualAgentSettings;
  settingsSource: AgentSettingsSource;
}> {
  if (!virtualAgentId) {
    return {
      agentConfig: null,
      mergedSettings: mergeAgentSettings(),
      settingsSource: 'default',
    };
  }

  const agentConfig = await getVirtualAgentConfig(virtualAgentId);
  const mergedSettings = mergeAgentSettings(agentConfig?.settings ?? undefined);
  const settingsSource: AgentSettingsSource = agentConfig?.settings ? 'agent' : 'default';

  return {
    agentConfig: agentConfig ? agentConfig : null,
    mergedSettings,
    settingsSource,
  };
}

const router = Router();

// ==================== REQUEST SCHEMAS ====================

const getContextSchema = z.object({
  campaignId: z.string(),
  accountId: z.string(),
  contactId: z.string().optional(),
});

const generateCallPlanSchema = z.object({
  campaignId: z.string(),
  accountId: z.string(),
  contactId: z.string().optional(),
  attemptNumber: z.number().optional().default(1),
  regenerate: z.boolean().optional().default(false),
});

const generateEmailSchema = z.object({
  campaignId: z.string(),
  accountId: z.string(),
  contactId: z.string(),
  sequenceStepId: z.string().optional(),
  regenerate: z.boolean().optional().default(false),
});

const startSimulationSchema = z.object({
  campaignId: z.string(),
  accountId: z.string(),
  contactId: z.string(),
  virtualAgentId: z.string().optional(),
  voice: z.string().optional(),
  provider: z.string().optional(),
});

const getAssembledPromptSchema = z.object({
  campaignId: z.string(),
  accountId: z.string(),
  contactId: z.string().optional(),
  virtualAgentId: z.string().optional(),
});

const initiatePhoneTestSchema = z.object({
  campaignId: z.string(),
  accountId: z.string(),
  contactId: z.string().optional(),
  virtualAgentId: z.string().optional(),
  variantId: z.string().optional(), // Prompt variant ID for A/B testing
  testPhoneNumber: z.string().min(10, "Valid phone number required"),
  voiceProvider: z.enum(["openai", "google"]).optional().default("google"),
  voice: z.string().optional(),
  // OpenAI Realtime configuration
  turnDetection: z.enum(["server_vad", "semantic", "disabled"]).optional().default("server_vad"),
  eagerness: z.enum(["low", "medium", "high"]).optional().default("medium"),
  maxTokens: z.number().min(256).max(16384).optional().default(4096),
  // Custom prompt overrides
  customSystemPrompt: z.string().optional(),
  customFirstMessage: z.string().optional(),
});

// ==================== RESPONSE TYPES ====================

export interface PreviewContextResponse {
  sessionId: string;
  accountIntelligence: AccountIntelligencePayload | null;
  accountMessagingBrief: AccountMessagingBriefPayload | null;
  accountCallBrief: AccountCallBriefPayload | null;
  participantCallPlan: ParticipantCallPlanPayload | null;
  participantContext: ParticipantCallContext | null;
  account: {
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
  } | null;
  contact: {
    id: string;
    fullName: string | null;
    jobTitle: string | null;
    email: string | null;
  } | null;
  campaign: {
    id: string;
    name: string | null;
    type: string | null;
  } | null;
}

export interface CallPlanPreviewResponse {
  sessionId: string;
  accountCallBrief: AccountCallBriefPayload;
  participantCallPlan: ParticipantCallPlanPayload | null;
  participantContext: ParticipantCallContext | null;
  memoryNotes: Array<{ content: string; createdAt: Date }>;
}

export interface AssembledPromptResponse {
  systemPrompt: string;
  firstMessage: string;
  sections: {
    foundation: string;
    campaign: string;
    account: string;
    contact: string;
    callPlan: string;
  };
  tokenCount: number;
  virtualAgentId: string | null;
  agentSettings: VirtualAgentSettings;
  agentSettingsSource: AgentSettingsSource;
  hasAgent: boolean;
}

export interface SimulationStartResponse {
  sessionId: string;
  websocketUrl: string;
  assembledPrompt: string;
  firstMessage: string;
  virtualAgentId: string | null;
  agentSettings: VirtualAgentSettings;
  agentSettingsSource: AgentSettingsSource;
  agentVoice: string | null;
  agentProvider: string | null;
}

export interface PhoneTestStartResponse {
  success: boolean;
  message: string;
  sessionId: string;
  testCallId: string;
  callControlId: string;
  phoneNumber: string;
  campaignName: string | null;
  agentName: string | null;
  voiceProvider: string;
}

// ==================== ENDPOINTS ====================

/**
 * GET /api/preview-studio/context
 * Fetch assembled context for preview (account intelligence, messaging brief, call brief)
 */
router.get("/context", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const query = getContextSchema.parse(req.query);
    const { campaignId, accountId, contactId } = query;

    // Get campaign
    const [campaign] = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        type: campaigns.type,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    // Get account
    const [account] = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        domain: accounts.domain,
        industry: accounts.industryStandardized,
      })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Get contact if provided
    let contact = null;
    if (contactId) {
      const [contactResult] = await db
        .select({
          id: contacts.id,
          fullName: contacts.fullName,
          jobTitle: contacts.jobTitle,
          email: contacts.email,
        })
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);
      contact = contactResult || null;
    }

    // Create preview session
    const [session] = await db.insert(previewStudioSessions).values({
      campaignId,
      accountId,
      contactId: contactId || null,
      userId,
      sessionType: 'context',
      status: 'active',
      metadata: { source: 'preview-studio' },
    }).returning({
      id: previewStudioSessions.id,
      campaignId: previewStudioSessions.campaignId,
      accountId: previewStudioSessions.accountId,
      contactId: previewStudioSessions.contactId,
      userId: previewStudioSessions.userId,
      createdAt: previewStudioSessions.createdAt,
    });

    // Get account intelligence
    let accountIntelligence: AccountIntelligencePayload | null = null;
    let accountMessagingBrief: AccountMessagingBriefPayload | null = null;
    let accountCallBrief: AccountCallBriefPayload | null = null;
    let participantCallPlan: ParticipantCallPlanPayload | null = null;
    let participantContext: ParticipantCallContext | null = null;

    try {
      const intelligenceRecord = await getOrBuildAccountIntelligence(accountId);
      accountIntelligence = intelligenceRecord?.payloadJson as AccountIntelligencePayload || null;
    } catch (e) {
      console.warn("Failed to get account intelligence:", e);
    }

    try {
      const messagingBriefRecord = await getOrBuildAccountMessagingBrief({
        accountId,
        campaignId,
      });
      accountMessagingBrief = messagingBriefRecord?.payloadJson as AccountMessagingBriefPayload || null;
    } catch (e) {
      console.warn("Failed to get messaging brief:", e);
    }

    // For call campaigns, also get call brief and plan
    if (campaign.type === 'call' || campaign.type === 'combo') {
      try {
        const callBriefRecord = await getOrBuildAccountCallBrief({
          accountId,
          campaignId,
        });
        accountCallBrief = callBriefRecord?.payloadJson as AccountCallBriefPayload || null;
      } catch (e) {
        console.warn("Failed to get call brief:", e);
      }

      if (contactId) {
        try {
          participantContext = await buildParticipantCallContext(contactId);
        } catch (e) {
          console.warn("Failed to build participant context:", e);
        }

        try {
          const planRecord = await getOrBuildParticipantCallPlan({
            contactId,
            accountId,
            campaignId,
          });
          participantCallPlan = planRecord?.payloadJson as ParticipantCallPlanPayload || null;
        } catch (e) {
          console.warn("Failed to get participant call plan:", e);
        }
      }
    }

    // Mark session as completed
    await db.update(previewStudioSessions)
      .set({ status: 'completed', endedAt: new Date() })
      .where(eq(previewStudioSessions.id, session.id));

    const response: PreviewContextResponse = {
      sessionId: session.id,
      accountIntelligence,
      accountMessagingBrief,
      accountCallBrief,
      participantCallPlan,
      participantContext,
      account,
      contact,
      campaign,
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching preview context:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid request", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to fetch preview context" });
  }
});

/**
 * POST /api/preview-studio/generate-call-plan
 * Generate call plan for preview
 */
router.post("/generate-call-plan", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const body = generateCallPlanSchema.parse(req.body);
    const { campaignId, accountId, contactId, attemptNumber, regenerate } = body;

    // Create preview session
    const [session] = await db.insert(previewStudioSessions).values({
      campaignId,
      accountId,
      contactId,
      userId,
      sessionType: 'call_plan',
      status: 'active',
      metadata: { attemptNumber, regenerate },
    }).returning();

    // If regenerate, we should clear the cache (handled by the service with forceRegenerate)
    const callBriefRecord = await getOrBuildAccountCallBrief({
      accountId,
      campaignId,
    });
    const accountCallBrief = callBriefRecord?.payloadJson as AccountCallBriefPayload;

    let participantContext: ParticipantCallContext | null = null;
    let participantCallPlan: ParticipantCallPlanPayload | null = null;

    // Only build participant-specific context if contactId is provided
    if (contactId) {
      participantContext = await buildParticipantCallContext(contactId);
      const planRecord = await getOrBuildParticipantCallPlan({
        contactId,
        accountId,
        campaignId,
        attemptNumber,
      });
      participantCallPlan = planRecord?.payloadJson as ParticipantCallPlanPayload;
    }

    // Get memory notes (TODO: implement getCallMemoryNotes if not available)
    const memoryNotes: Array<{ content: string; createdAt: Date }> = [];

    // Store generated content
    await db.insert(previewGeneratedContent).values({
      sessionId: session.id,
      contentType: 'call_plan',
      content: {
        accountCallBrief,
        participantCallPlan,
        participantContext,
      },
    });

    // Mark session as completed
    await db.update(previewStudioSessions)
      .set({ status: 'completed', endedAt: new Date() })
      .where(eq(previewStudioSessions.id, session.id));

    const response: CallPlanPreviewResponse = {
      sessionId: session.id,
      accountCallBrief,
      participantCallPlan,
      participantContext,
      memoryNotes,
    };

    res.json(response);
  } catch (error) {
    console.error("Error generating call plan preview:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid request", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to generate call plan preview" });
  }
});

/**
 * GET /api/preview-studio/assembled-prompt
 * Get the fully assembled system prompt for voice agent
 */
router.get("/assembled-prompt", requireAuth, async (req, res) => {
  try {
    const query = getAssembledPromptSchema.parse(req.query);
    const { campaignId, accountId, contactId, virtualAgentId } = query;

    // Get campaign with agent settings
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const resolvedVirtualAgentId = await resolveVirtualAgentId({
      campaignId,
      virtualAgentId,
    });

    // Get agent settings (may be null if no agent assigned)
    let agentConfig: Awaited<ReturnType<typeof getVirtualAgentConfig>> = null;
    let mergedSettings = mergeAgentSettings(undefined);
    let settingsSource: AgentSettingsSource = 'default';

    if (resolvedVirtualAgentId) {
      const result = await getAgentSimulationSettings(resolvedVirtualAgentId);
      agentConfig = result.agentConfig;
      mergedSettings = result.mergedSettings;
      settingsSource = result.settingsSource;
    }

    const useCondensedPrompt =
      mergedSettings.advanced.costOptimization.useCondensedPrompt !== false;

    // Build default foundation prompt if no agent assigned
    const defaultFoundation = !resolvedVirtualAgentId
      ? `You are a professional sales development representative making outbound calls on behalf of the company. Your goal is to have a natural, helpful conversation and qualify the prospect for a follow-up meeting.

Be conversational, friendly, and professional. Listen actively and respond appropriately. Focus on understanding the prospect's needs and challenges. If they show interest, work to schedule a follow-up meeting.

Key guidelines:
- Introduce yourself and the company clearly
- Ask open-ended questions to understand their situation
- Listen more than you talk
- Handle objections gracefully
- Aim to schedule a meeting if there's mutual interest
- Be respectful of their time`
      : '';

    // Build prompt sections
    const sections = {
      foundation: agentConfig?.systemPrompt || defaultFoundation,
      campaign: buildCampaignContextSection(campaign),
      account: '',
      contact: '',
      callPlan: '',
    };

    // Get account context
    try {
      const intelligenceRecord = await getOrBuildAccountIntelligence(accountId);
      const messagingBriefRecord = await getOrBuildAccountMessagingBrief({ accountId, campaignId });
      const accountProfile = await getAccountProfileData(accountId);
      sections.account = buildAccountContextSection(
        intelligenceRecord?.payloadJson as AccountIntelligencePayload,
        messagingBriefRecord?.payloadJson as AccountMessagingBriefPayload,
        accountProfile
      );
    } catch (e) {
      console.warn("Failed to build account context:", e);
    }

    // Get contact context
    if (contactId) {
      try {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1);

        if (contact) {
          sections.contact = buildContactContextSection(contact);
        }

        const participantContext = await buildParticipantCallContext(contactId);
        const planRecord = await getOrBuildParticipantCallPlan({
          contactId,
          accountId,
          campaignId,
        });
        sections.callPlan = buildCallPlanSection(
          participantContext,
          planRecord?.payloadJson as ParticipantCallPlanPayload
        );
      } catch (e) {
        console.warn("Failed to build contact/call plan context:", e);
      }
    }

    // Assemble full prompt
    const systemPromptBase = [
      sections.foundation,
      sections.campaign,
      sections.account,
      sections.contact,
      sections.callPlan,
    ].filter(Boolean).join('\n\n');
    const systemPrompt = ensureVoiceAgentControlLayer(systemPromptBase, useCondensedPrompt);

    // Estimate token count (rough: ~4 chars per token)
    const tokenCount = Math.ceil(systemPrompt.length / 4);

    // Build first message
    const firstMessage =
      agentConfig?.firstMessage ||
      buildDefaultFirstMessage(contactId ? sections.contact : '');

    const response: AssembledPromptResponse = {
      systemPrompt,
      firstMessage,
      sections,
      tokenCount,
      virtualAgentId: resolvedVirtualAgentId || null,
      agentSettings: mergedSettings,
      agentSettingsSource: settingsSource,
      hasAgent: !!resolvedVirtualAgentId,
    };

    res.json(response);
  } catch (error) {
    console.error("Error getting assembled prompt:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid request", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to get assembled prompt" });
  }
});

// Schema for text simulation chat
const simulationChatSchema = z.object({
  sessionId: z.string().optional(),
  campaignId: z.string(),
  accountId: z.string(),
  contactId: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),
  userMessage: z.string(),
  provider: z.enum(['openai', 'gemini']).default('openai'),
});

/**
 * POST /api/preview-studio/simulation/chat
 * Text-based simulation chat using Preview Studio personalization
 */
router.post("/simulation/chat", requireAuth, async (req, res) => {
  try {
    const body = simulationChatSchema.parse(req.body);
    const { sessionId, campaignId, accountId, contactId, messages, userMessage, provider } = body;

    const historyLimit = 16;
    const maxTokens = 320;
    const temperature = 0.2;

    // Build the assembled prompt using Preview Studio's personalization
    const resolvedVirtualAgentId = await resolveVirtualAgentId({ campaignId });
    const { agentConfig, mergedSettings } = await getAgentSimulationSettings(resolvedVirtualAgentId);

    const promptResult = await buildAssembledPrompt({
      campaignId,
      accountId,
      contactId,
      virtualAgentId: resolvedVirtualAgentId || undefined,
      agentConfig,
      agentSettings: mergedSettings,
    });

    // Build message history
    const rawMessages = [
      ...messages.filter(msg => msg.content.trim().length > 0),
      { role: 'user' as const, content: userMessage.trim() },
    ];

    // Check if identity is confirmed (simple detection)
    const confirmPhrases = ['yes', 'yeah', 'speaking', 'this is', 'i am'];
    const userMessages = rawMessages.filter(m => m.role === 'user');
    const identityConfirmed = userMessages.some(m =>
      confirmPhrases.some(p => m.content.toLowerCase().includes(p))
    );

    // Build full system prompt
    let systemPrompt = promptResult.systemPrompt;
    if (identityConfirmed) {
      systemPrompt += `\n\n---\n\n[Conversation State]\nIdentity is already confirmed. Do not ask to confirm identity again. Continue the conversation without restarting the opening.`;
    }

    // Limit messages
    const trimmedMessages = rawMessages.slice(-historyLimit);
    if (trimmedMessages.length === 0 && promptResult.firstMessage) {
      trimmedMessages.push({ role: 'assistant' as const, content: promptResult.firstMessage });
    }

    let reply = "";

    if (provider === 'gemini') {
      try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
        const model = genai.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction: systemPrompt,
        });

        const geminiMessages = trimmedMessages.map(m => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          parts: [{ text: m.content }],
        }));

        const result = await model.generateContent({
          contents: geminiMessages,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        });

        reply = result.response.text()?.trim() || "";
      } catch (geminiErr) {
        console.error('[Preview Studio] Gemini chat error:', geminiErr);
        throw new Error(`Gemini error: ${geminiErr instanceof Error ? geminiErr.message : geminiErr}`);
      }
    } else {
      // Use OpenAI
      const openai = (await import("../lib/openai")).default;
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_VIRTUAL_AGENT_PREVIEW_MODEL || "gpt-4o-mini",
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          ...trimmedMessages.map(m => ({ role: m.role, content: m.content })),
        ],
      });
      reply = response.choices?.[0]?.message?.content?.trim() || "";
    }

    if (!reply) {
      return res.status(502).json({ message: `${provider} returned an empty response` });
    }

    // Generate session ID if not provided
    const responseSessionId = sessionId || `sim_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    res.json({
      reply,
      sessionId: responseSessionId,
      conversationState: {
        identityConfirmed,
        currentStage: messages.length < 2 ? 'opening' : 'discovery',
      },
    });
  } catch (error) {
    console.error("[Preview Studio] Simulation chat error:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: "Failed to generate response", error: message });
  }
});

/**
 * POST /api/preview-studio/simulation/start
 * Start a browser-based voice simulation session
 */
router.post("/simulation/start", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const body = startSimulationSchema.parse(req.body);
    const { campaignId, accountId, contactId, virtualAgentId, voice, provider } = body;

    const resolvedVirtualAgentId = await resolveVirtualAgentId({
      campaignId,
      virtualAgentId,
    });
    const { agentConfig, mergedSettings, settingsSource } =
      await getAgentSimulationSettings(resolvedVirtualAgentId);

    // Apply voice overrides if provided
    const finalVoice = voice || agentConfig?.voice || null;
    const finalProvider = provider || agentConfig?.provider || null;

  // Create preview session
  const [session] = await db.insert(previewStudioSessions).values({
    campaignId,
    accountId,
    contactId,
    userId,
    virtualAgentId: resolvedVirtualAgentId,
    sessionType: 'simulation',
    status: 'active',
    metadata: {
      startedAt: new Date().toISOString(),
      agentSettings: mergedSettings,
      agentSettingsSource: settingsSource,
      agentSystemPrompt: agentConfig?.systemPrompt || null,
      agentFirstMessage: agentConfig?.firstMessage || null,
      agentVoice: finalVoice,
      agentProvider: finalProvider,
    },
  }).returning();

    // Build WebSocket URL
    const wsHost = process.env.PUBLIC_WEBSOCKET_URL?.split('/voice-dialer')[0] ||
                   process.env.REPLIT_DEV_DOMAIN ||
                   req.get('X-Public-Host') ||
                   req.get('host') ||
                   'localhost:5000';

    const wsUrl = wsHost.startsWith('wss://') || wsHost.startsWith('ws://')
      ? `${wsHost}/preview-simulation?sessionId=${session.id}`
      : `wss://${wsHost}/preview-simulation?sessionId=${session.id}`;

    // Get assembled prompt for reference
    const promptResponse = await buildAssembledPrompt({
      campaignId,
      accountId,
      contactId,
      virtualAgentId: resolvedVirtualAgentId || undefined,
      agentConfig,
      agentSettings: mergedSettings,
    });

    // ...existing code...

    const response: SimulationStartResponse = {
      sessionId: session.id,
      websocketUrl: wsUrl,
      assembledPrompt: promptResponse.systemPrompt,
      firstMessage: promptResponse.firstMessage,
      virtualAgentId: resolvedVirtualAgentId,
      agentSettings: mergedSettings,
      agentSettingsSource: settingsSource,
      agentVoice: finalVoice,
      agentProvider: finalProvider,
    };

    res.json(response);
  } catch (error) {
    console.error("Error starting simulation:", error);
    res.status(500).json({ message: "Failed to start simulation" });
  }
});

/**
 * POST /api/preview-studio/phone-test/start
 * Initiate a real phone call test (same flow as campaign test calls)
 * This uses Telnyx TeXML to place a real call and connects to OpenAI Realtime
 */
router.post("/phone-test/start", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const body = initiatePhoneTestSchema.parse(req.body);
    const {
      campaignId,
      accountId,
      contactId,
      virtualAgentId,
      variantId,
      testPhoneNumber,
      voiceProvider,
      voice: voiceOverride,
      turnDetection,
      eagerness,
      maxTokens,
      customSystemPrompt,
      customFirstMessage,
    } = body;

    console.log("[Preview Studio Phone Test] Request received:", {
      campaignId,
      accountId,
      contactId,
      userId,
      variantId,
      voiceProvider,
      voiceOverride,
      turnDetection,
      eagerness,
      maxTokens,
      hasCustomPrompt: !!customSystemPrompt,
      hasCustomFirstMessage: !!customFirstMessage,
    });

    // Check environment configuration
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    const fromNumber = process.env.TELNYX_FROM_NUMBER;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const texmlAppId = process.env.TELNYX_TEXML_APP_ID;

    if (!telnyxApiKey || !fromNumber || telnyxApiKey.startsWith('REPLACE_ME')) {
      return res.status(500).json({ message: "Telnyx not configured. Please set TELNYX_API_KEY and TELNYX_FROM_NUMBER." });
    }
    if (!openaiApiKey) {
      return res.status(500).json({ message: "OpenAI API key not configured" });
    }
    if (!texmlAppId) {
      return res.status(500).json({ message: "Telnyx TeXML Application ID not configured." });
    }

    // Get campaign
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    // Resolve virtual agent (optional for Preview Studio - can use custom prompts)
    const resolvedVirtualAgentId = await resolveVirtualAgentId({
      campaignId,
      virtualAgentId,
    });

    // In Preview Studio, we allow testing without an agent if custom prompt is provided
    const hasCustomPrompt = !!customSystemPrompt && customSystemPrompt.trim().length > 0;

    if (!resolvedVirtualAgentId && !hasCustomPrompt) {
      return res.status(400).json({
        message: "No AI agent assigned to this campaign",
        suggestion: "Please assign a virtual agent to the campaign, or load and customize a prompt in Preview Studio before testing"
      });
    }

    // Get agent config (may be null if no agent assigned)
    const agentConfig = resolvedVirtualAgentId
      ? await getVirtualAgentConfig(resolvedVirtualAgentId)
      : null;
    const mergedSettings = mergeAgentSettings(agentConfig?.settings ?? undefined);

    const buildCustomOrAssembledPrompt = async () => {
      if (hasCustomPrompt && !resolvedVirtualAgentId) {
        return {
          systemPrompt: customSystemPrompt!,
          firstMessage: customFirstMessage || PREVIEW_PHONE_TEST_DEFAULT_FIRST_MESSAGE,
        };
      }

      return await buildAssembledPrompt({
        campaignId,
        accountId,
        contactId: contactId || undefined,
        virtualAgentId: resolvedVirtualAgentId!,
        agentConfig,
        agentSettings: mergedSettings,
      });
    };

    // Get account and contact info for context
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    let contact = null;
    if (contactId) {
      const [contactResult] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);
      contact = contactResult || null;
    }

    // Normalize phone number to E.164
    let normalizedPhone = testPhoneNumber.replace(/[^\d+]/g, '');
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+44' + normalizedPhone.substring(1);
      } else {
        normalizedPhone = '+' + normalizedPhone;
      }
    }

    // Create preview session
    const testCallId = `preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const runId = `run-preview-${Date.now()}`;

    const [session] = await db.insert(previewStudioSessions).values({
      campaignId,
      accountId,
      contactId: contactId || null,
      userId,
      virtualAgentId: resolvedVirtualAgentId || null,
      sessionType: 'simulation',
      status: 'active',
      metadata: {
        type: 'phone_test',
        testCallId,
        testPhoneNumber: normalizedPhone,
        voiceProvider,
        startedAt: new Date().toISOString(),
        agentSettings: mergedSettings,
        accountName: account?.name || null,
        contactName: contact?.fullName || null,
        hasCustomPrompt,
      },
    }).returning();

    // Build the system prompt with full context (same as campaign test calls)
    let promptResponse: { systemPrompt: string; firstMessage: string };
    let variantInfo: {
      variantId: string | null;
      perspective: PromptVariantPerspective | null;
      selectionMethod: VariantSelectionMethod;
    } = { variantId: null, perspective: null, selectionMethod: 'default' };

    // Load variant if specified (for A/B testing)
    if (variantId) {
      try {
        const { getVariantWithTests } = await import('../services/prompt-variant-service');
        const variantData = await getVariantWithTests(variantId);
        if (variantData) {
          promptResponse = {
            systemPrompt: variantData.variant.systemPrompt,
            firstMessage: variantData.variant.firstMessage || PREVIEW_PHONE_TEST_DEFAULT_FIRST_MESSAGE,
          };
          variantInfo = {
            variantId: variantData.variant.id,
            perspective: variantData.variant.perspective,
            selectionMethod: 'manual',
          };
          console.log(
            `[Preview Studio Phone Test] Using prompt variant: ${variantData.variant.variantName} (${variantData.variant.perspective})`
          );
        } else {
          console.warn(
            `[Preview Studio Phone Test] Variant ${variantId} not found, falling back to default`
          );
          promptResponse = await buildCustomOrAssembledPrompt();
        }
      } catch (err) {
        console.warn('[Preview Studio Phone Test] Error loading variant:', err);
        promptResponse = await buildCustomOrAssembledPrompt();
      }
    } else {
      promptResponse = await buildCustomOrAssembledPrompt();
    }

    // Use custom prompts if provided, otherwise use assembled prompt
    const finalSystemPrompt = customSystemPrompt || promptResponse.systemPrompt;
    const finalFirstMessage = customFirstMessage || agentConfig?.firstMessage || promptResponse.firstMessage;

    // Prepare voice selection
    let voice = 'marin';

    if (voiceProvider === 'google') {
      // Google Gemini voices - preserve case
      voice = (voiceOverride || agentConfig?.voice || 'Puck').toString().trim();
    } else {
      // OpenAI voices - strict validation
      const supportedVoices = new Set(['alloy', 'ash', 'coral', 'marin', 'verse']);
      const rawVoice = (voiceOverride || agentConfig?.voice || '').toString().trim().toLowerCase();
      voice = supportedVoices.has(rawVoice) ? rawVoice : 'marin';
    }

    // Map provider selection
    const providerForClientState = voiceProvider === 'google' ? 'google' : 'openai_realtime';
    const providerForSession = voiceProvider === 'google' ? 'google' : 'openai';

    // OpenAI Realtime configuration
    const openaiConfig = voiceProvider === 'openai' ? {
      turn_detection: turnDetection,
      eagerness,
      max_tokens: maxTokens,
    } : undefined;

    // Determine agent name based on context
    const agentName = hasCustomPrompt
      ? 'Custom Prompt Agent'
      : (agentConfig?.systemPrompt ? 'Preview Agent' : 'Default Agent');

    // Custom parameters for WebSocket
    const customParams = {
      call_id: testCallId,
      run_id: runId,
      campaign_id: campaignId,
      queue_item_id: `preview-queue-${testCallId}`,
      call_attempt_id: `preview-attempt-${testCallId}`,
      contact_id: contactId || `preview-contact-${testCallId}`,
      called_number: normalizedPhone, // Required for database tracking
      virtual_agent_id: resolvedVirtualAgentId || undefined,
      is_test_call: true,
      is_preview_test: true,
      test_call_id: testCallId,
      preview_session_id: session.id,
      first_message: finalFirstMessage,
      voice,
      agent_name: agentName,
      test_contact: {
        name: contact?.fullName || account?.name || 'Preview Contact',
        company: account?.name || 'Preview Company',
        title: contact?.jobTitle || 'Contact',
        email: contact?.email || undefined,
      },
      provider: providerForClientState,
      openai_config: openaiConfig,
    };

    // Store full session data in Redis
    const { callSessionStore } = await import("../services/call-session-store");
    await callSessionStore.setSession(testCallId, {
      call_id: testCallId,
      run_id: runId,
      campaign_id: campaignId,
      queue_item_id: customParams.queue_item_id,
      call_attempt_id: customParams.call_attempt_id,
      contact_id: customParams.contact_id,
      called_number: normalizedPhone, // Required for database tracking
      virtual_agent_id: resolvedVirtualAgentId || undefined,
      is_test_call: true,
      is_preview_test: true,
      test_call_id: testCallId,
      preview_session_id: session.id,
      first_message: finalFirstMessage || undefined,
      voice,
      agent_name: agentName,
      test_contact: customParams.test_contact,
      provider: providerForSession,
      system_prompt: finalSystemPrompt,
      openai_config: openaiConfig,
    });

    const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');

    // Prepare webhook URL
    const webhookHost = process.env.PUBLIC_WEBHOOK_HOST || req.get('X-Public-Host') || req.get('host') || 'localhost:5000';
    const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';
    const texmlUrl = `${webhookProtocol}://${webhookHost}/api/texml/ai-call?client_state=${encodeURIComponent(clientStateB64)}`;

    console.log('[Preview Studio Phone Test] Initiating Telnyx call to:', normalizedPhone);

    // Initiate Telnyx TeXML call
    const telnyxEndpoint = `https://api.telnyx.com/v2/texml/calls/${texmlAppId}`;
    const telnyxResponse = await fetch(telnyxEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${telnyxApiKey}`,
      },
      body: JSON.stringify({
        To: normalizedPhone,
        From: fromNumber,
        Url: texmlUrl,
        StatusCallback: `https://${process.env.PUBLIC_WEBHOOK_HOST || 'localhost'}/api/webhooks/telnyx`,
      }),
    });

    if (!telnyxResponse.ok) {
      const errorText = await telnyxResponse.text();
      console.error(`[Preview Studio Phone Test] Telnyx API error:`, errorText);

      let friendlyMessage = `Telnyx API error`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errors && errorJson.errors.length > 0) {
          const firstError = errorJson.errors[0];
          friendlyMessage = firstError.detail || firstError.title || friendlyMessage;
        }
      } catch (e) {
        // ignore parse error
      }

      await db.update(previewStudioSessions)
        .set({
          status: 'error',
          endedAt: new Date(),
          metadata: { ...(session.metadata as Record<string, unknown> || {}), error: friendlyMessage },
        })
        .where(eq(previewStudioSessions.id, session.id));

      return res.status(400).json({ message: friendlyMessage, error: errorText });
    }

    const telnyxResult = await telnyxResponse.json();
    const callControlId = telnyxResult.data?.call_control_id;

    // Update session with call control ID
    await db.update(previewStudioSessions)
      .set({
        metadata: { ...(session.metadata as Record<string, unknown> || {}), callControlId },
      })
      .where(eq(previewStudioSessions.id, session.id));

    console.log(`[Preview Studio Phone Test] Call initiated successfully: ${callControlId}`);

    const response: PhoneTestStartResponse = {
      success: true,
      message: "Phone test initiated. Your phone will ring shortly.",
      sessionId: session.id,
      testCallId,
      callControlId,
      phoneNumber: normalizedPhone,
      campaignName: campaign.name,
      agentName: agentConfig?.systemPrompt ? 'Custom Agent' : 'Preview Agent',
      voiceProvider,
    };

    res.json(response);
  } catch (error) {
    console.error("[Preview Studio Phone Test] Error:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to initiate phone test", error: String(error) });
  }
});

/**
 * GET /api/preview-studio/phone-test/:sessionId
 * Get phone test session status and results
 */
router.get("/phone-test/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const [session] = await db
      .select()
      .from(previewStudioSessions)
      .where(eq(previewStudioSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Get transcripts if available
    const transcripts = await db
      .select()
      .from(previewSimulationTranscripts)
      .where(eq(previewSimulationTranscripts.sessionId, sessionId))
      .orderBy(previewSimulationTranscripts.timestampMs);

    res.json({
      session,
      transcripts,
    });
  } catch (error) {
    console.error("[Preview Studio Phone Test] Error fetching session:", error);
    res.status(500).json({ message: "Failed to fetch phone test session" });
  }
});

/**
 * POST /api/preview-studio/phone-test/:sessionId/hangup
 * End an active phone test call
 */
router.post("/phone-test/:sessionId/hangup", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const [session] = await db
      .select()
      .from(previewStudioSessions)
      .where(eq(previewStudioSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const metadata = session.metadata as any;
    const callControlId = metadata?.callControlId;

    if (!callControlId) {
      // No call control ID - just mark as ended
      await db.update(previewStudioSessions)
        .set({
          status: 'completed',
          endedAt: new Date(),
          metadata: { ...metadata, endReason: 'user_hangup_no_call_control' },
        })
        .where(eq(previewStudioSessions.id, sessionId));

      return res.json({ success: true, message: "Session ended (no active call)" });
    }

    // Call Telnyx to hang up the call
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    if (!telnyxApiKey) {
      return res.status(500).json({ message: "Telnyx API key not configured" });
    }

    console.log(`[Preview Studio] Hanging up call with call_control_id: ${callControlId}`);

    try {
      const hangupResponse = await fetch(
        `https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${telnyxApiKey}`,
          },
          body: JSON.stringify({}),
        }
      );

      if (!hangupResponse.ok) {
        const errorText = await hangupResponse.text();
        console.error(`[Preview Studio] Telnyx hangup error: ${hangupResponse.status} - ${errorText}`);
        // Still mark as ended even if Telnyx fails (call might have already ended)
      } else {
        console.log(`[Preview Studio] Telnyx hangup successful for ${callControlId}`);
      }
    } catch (telnyxError) {
      console.error("[Preview Studio] Telnyx hangup request failed:", telnyxError);
      // Continue to mark session as ended
    }

    // Update session status
    await db.update(previewStudioSessions)
      .set({
        status: 'completed',
        endedAt: new Date(),
        metadata: { ...metadata, endReason: 'user_hangup' },
      })
      .where(eq(previewStudioSessions.id, sessionId));

    res.json({ success: true, message: "Call ended successfully" });
  } catch (error) {
    console.error("[Preview Studio] Error hanging up call:", error);
    res.status(500).json({ message: "Failed to hang up call" });
  }
});

/**
 * GET /api/preview-studio/history
 * Get preview session history
 */
router.get("/history", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { campaignId, limit = 50 } = req.query;

    let query = db
      .select({
        id: previewStudioSessions.id,
        sessionType: previewStudioSessions.sessionType,
        status: previewStudioSessions.status,
        createdAt: previewStudioSessions.createdAt,
        endedAt: previewStudioSessions.endedAt,
        accountName: accounts.name,
        contactName: contacts.fullName,
        campaignName: campaigns.name,
      })
      .from(previewStudioSessions)
      .leftJoin(accounts, eq(accounts.id, previewStudioSessions.accountId))
      .leftJoin(contacts, eq(contacts.id, previewStudioSessions.contactId))
      .leftJoin(campaigns, eq(campaigns.id, previewStudioSessions.campaignId))
      .where(eq(previewStudioSessions.userId, userId))
      .orderBy(desc(previewStudioSessions.createdAt))
      .limit(Number(limit));

    const sessions = await query;

    res.json({ sessions });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ message: "Failed to fetch history" });
  }
});

/**
 * GET /api/preview-studio/session/:sessionId
 * Get a specific session with its content
 */
router.get("/session/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const [session] = await db
      .select()
      .from(previewStudioSessions)
      .where(eq(previewStudioSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Get generated content
    const content = await db
      .select()
      .from(previewGeneratedContent)
      .where(eq(previewGeneratedContent.sessionId, sessionId));

    // Get transcripts if simulation
    let transcripts: PreviewSimulationTranscript[] = [];
    if (session.sessionType === 'simulation') {
      transcripts = await db
        .select()
        .from(previewSimulationTranscripts)
        .where(eq(previewSimulationTranscripts.sessionId, sessionId))
        .orderBy(previewSimulationTranscripts.timestampMs);
    }

    res.json({
      session,
      content,
      transcripts,
    });
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({ message: "Failed to fetch session" });
  }
});

/**
 * POST /api/preview-studio/transcript
 * Add a transcript entry (used by WebSocket handler)
 */
router.post("/transcript", requireAuth, async (req, res) => {
  try {
    const { sessionId, role, content, timestampMs, audioDurationMs } = req.body;

    const [transcript] = await db.insert(previewSimulationTranscripts).values({
      sessionId,
      role,
      content,
      timestampMs,
      audioDurationMs,
    }).returning();

    res.json(transcript);
  } catch (error) {
    console.error("Error adding transcript:", error);
    res.status(500).json({ message: "Failed to add transcript" });
  }
});

/**
 * POST /api/preview-studio/analyze
 * Server-side AI analysis of Preview Studio conversation using Vertex AI (Gemini)
 */
router.post("/analyze", requireAuth, async (req, res) => {
  try {
    const { transcript, sessionId, campaignId, contactId } = req.body;

    if (!transcript || (Array.isArray(transcript) && transcript.length === 0)) {
      return res.status(400).json({ message: "Transcript is required" });
    }

    console.log(`[Preview Studio AI] Analyzing conversation (${Array.isArray(transcript) ? transcript.length + ' turns' : 'text transcript'})`);

    // Build conversation text from transcript (handle both string and array)
    let conversationText: string;
    if (typeof transcript === 'string') {
      conversationText = transcript;
    } else {
      conversationText = transcript.map((t: any) => 
        `${t.role === 'assistant' ? 'Agent' : 'Contact'}: ${t.content}`
      ).join('\n');
    }

    // Get campaign context if available
    let campaignContext = '';
    if (campaignId) {
      try {
        const [campaign] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, campaignId))
          .limit(1);
        if (campaign) {
          campaignContext = `
Campaign: ${campaign.name}
Objective: ${campaign.campaignObjective || 'Not specified'}
Product/Service: ${campaign.productService || 'Not specified'}
`;
        }
      } catch (e) {
        // Ignore campaign lookup errors
      }
    }

    // Build AI analysis prompt
    const analysisPrompt = `You are an expert B2B sales call analyst. Analyze this Preview Studio conversation and provide a comprehensive 135-point evaluation.

${campaignContext ? '## Campaign Context' + campaignContext : ''}

## Conversation Transcript
${conversationText}

## Analysis Required
Provide a detailed JSON analysis with the following structure:

{
  "executiveSummary": {
    "verdict": "approve" | "needs-edits" | "reject",
    "whatWentWell": ["list of 2-4 positive points"],
    "needsImprovement": ["list of 2-4 improvement areas"]
  },
  "scorecard": {
    "voicemail": number (0-10),
    "humanity": number (0-25),
    "intelligence": number (0-30),
    "objectionHandling": number (0-35),
    "closing": number (0-35),
    "total": number (0-135)
  },
  "voicemailDiscipline": {
    "passed": boolean,
    "violations": ["list of any voicemail-related violations"]
  },
  "humanityReport": {
    "gratitudeExpressions": number,
    "warmClosing": boolean,
    "professionalTone": boolean,
    "issues": ["list of any humanity/professionalism issues"]
  },
  "intelligenceReport": {
    "questionQuality": "excellent" | "good" | "fair" | "poor",
    "activeListening": boolean,
    "contextualResponses": boolean,
    "insights": ["key intelligence gathering observations"]
  },
  "objectionReview": {
    "objectionsIdentified": number,
    "objectionsHandled": number,
    "handlingQuality": "excellent" | "good" | "fair" | "poor",
    "details": ["specific objection handling observations"]
  },
  "timelineHighlights": [
    {
      "turnNumber": number,
      "tag": "good-move" | "missed-opportunity" | "risk" | "unclear",
      "speaker": "agent" | "contact",
      "summary": "brief description of what happened",
      "recommendation": "what should have been done differently (if applicable)"
    }
  ],
  "promptImprovements": ["list of 2-4 specific prompt improvement suggestions"],
  "conversationQuality": {
    "overall": "excellent" | "good" | "fair" | "poor",
    "engagement": number (1-10),
    "clarity": number (1-10),
    "persuasiveness": number (1-10)
  },
  "nextStepRecommendation": "string describing recommended next action"
}

Analyze the conversation thoroughly and return ONLY valid JSON.`;

    // Call Vertex AI for analysis
    const aiAnalysis = await generateJSON<any>(analysisPrompt, {
      temperature: 0.3,
      maxTokens: 4000,
    });

    console.log(`[Preview Studio AI] Analysis complete. Score: ${aiAnalysis.scorecard?.total || 'N/A'}/135`);

    res.json({
      success: true,
      analysis: aiAnalysis,
      source: 'vertex-ai',
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("[Preview Studio AI] Analysis error:", error);
    res.status(500).json({ 
      message: "Failed to analyze conversation", 
      error: error.message 
    });
  }
});

/**
 * POST /api/preview-studio/save-as-lead
 * Save Preview Studio session as a lead for conversation intelligence tracking
 */
router.post("/save-as-lead", requireAuth, async (req, res) => {
  try {
    const { 
      sessionId, 
      campaignId, 
      contactId, 
      transcript, 
      analysis,
      disposition = 'preview-test',
      notes 
    } = req.body;

    if (!campaignId) {
      return res.status(400).json({ message: "Campaign ID is required" });
    }

    console.log(`[Preview Studio] Saving session as lead for campaign: ${campaignId}`);

    // Build transcript text if array provided
    let transcriptText = '';
    if (Array.isArray(transcript)) {
      transcriptText = transcript.map((t: any) => 
        `${t.role === 'assistant' ? 'Agent' : 'Contact'}: ${t.content}`
      ).join('\n');
    } else if (typeof transcript === 'string') {
      transcriptText = transcript;
    }

    // Get contact details if provided
    let contactName = 'Preview Test Contact';
    let contactEmail = '';
    if (contactId) {
      try {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1);
        if (contact) {
          contactName = contact.fullName || 
            `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 
            'Preview Test Contact';
          contactEmail = contact.email || '';
        }
      } catch (e) {
        // Ignore contact lookup errors
      }
    }

    // Generate unique lead ID
    const leadId = `preview-${sessionId || Date.now()}`;

    // Create lead record
    const [lead] = await db.insert(leads).values({
      id: leadId,
      contactId: contactId || undefined,
      contactName,
      contactEmail,
      campaignId,
      dialedNumber: '',
      notes: `[Preview Studio Test - ${disposition}]${notes ? '\n\n' + notes : ''}${analysis?.executiveSummary ? '\n\nAnalysis Summary:\nVerdict: ' + analysis.executiveSummary.verdict + '\nScore: ' + (analysis.scorecard?.total || 'N/A') + '/135' : ''}`,
      transcript: transcriptText,
      transcriptionStatus: transcriptText ? 'completed' : 'pending',
      qaStatus: 'new',
      accountName: '',
      customFields: {
        previewStudioSession: true,
        sessionId: sessionId,
        analysisScore: analysis?.scorecard?.total,
        analysisVerdict: analysis?.executiveSummary?.verdict,
        aiAnalysis: analysis,
      },
      aiScore: analysis?.scorecard?.total,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing().returning();

    console.log(`[Preview Studio] Created lead from session: ${leadId}`);

    res.json({
      success: true,
      leadId: lead?.id || leadId,
      message: "Session saved as lead for conversation intelligence tracking",
    });

  } catch (error: any) {
    console.error("[Preview Studio] Error saving as lead:", error);
    res.status(500).json({ 
      message: "Failed to save session as lead", 
      error: error.message 
    });
  }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Build campaign context section with PRIORITIZED talking points and key messages
 *
 * Priority Order:
 * 1. Campaign Objective (PRIMARY GOAL)
 * 2. Key Talking Points (MUST DELIVER)
 * 3. Campaign Brief (context)
 * 4. Product/Service Info
 * 5. Target Audience
 * 6. Success Criteria
 */
function buildCampaignContextSection(campaign: any): string {
  const parts = ['## Campaign Context'];

  // CRITICAL: Campaign objective comes first - this is the PRIMARY GOAL
  if (campaign.campaignObjective) {
    parts.push(`### PRIMARY OBJECTIVE (Critical)\n${campaign.campaignObjective}\n\n**You MUST work toward this objective in every conversation.**`);
  }

  // KEY TALKING POINTS - HIGHEST PRIORITY for message delivery
  // These are placed early and emphasized to ensure the agent delivers them
  // Following OpenAI/Gemini voice best practices for natural delivery
  if (campaign.talkingPoints && Array.isArray(campaign.talkingPoints) && campaign.talkingPoints.length > 0) {
    const points = campaign.talkingPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n');
    parts.push(`### KEY TALKING POINTS (Must Deliver)

**CRITICAL: You MUST naturally weave these points into the conversation. These are the core messages to communicate:**

${points}

**Delivery Guidelines (Voice-Optimized):**
- Introduce these points conversationally, NOT as a reading list
- Look for natural moments to bring up each point based on conversation flow
- Prioritize points 1-3 as most critical if time is limited
- VARY your phrasing — do not repeat identical phrases
- Use natural pauses after important points to let them land
- Adapt your enthusiasm level to match the prospect's energy
- If interrupted mid-point, acknowledge and return naturally when appropriate`);
  }

  // Campaign brief provides additional context for intelligent delivery
  if (campaign.campaignContextBrief) {
    parts.push(`### Campaign Brief\n${campaign.campaignContextBrief}`);
  }

  // Product/Service info for context
  if (campaign.productServiceInfo) {
    parts.push(`### Product/Service Information\n${campaign.productServiceInfo}`);
  }

  // Target audience helps agent adapt their approach
  if (campaign.targetAudienceDescription) {
    parts.push(`### Target Audience\n${campaign.targetAudienceDescription}`);
  }

  // Success criteria defines what a good outcome looks like
  if (campaign.successCriteria) {
    parts.push(`### Success Criteria\n${campaign.successCriteria}`);
  }

  // Log if no campaign context was added
  if (parts.length === 1) {
    console.warn('[Preview Studio] ⚠️ Campaign has no context fields populated (objective, brief, talking points, etc.)');
  } else {
    console.log(`[Preview Studio] ✅ Built campaign context with ${parts.length - 1} sections (talking points: ${campaign.talkingPoints?.length || 0})`);
  }

  return parts.join('\n\n');
}

function buildAccountContextSection(
  intelligence: AccountIntelligencePayload | null,
  brief: AccountMessagingBriefPayload | null,
  accountProfile?: AccountProfileData | null
): string {
  const parts = ['## Account Context'];

  // Add account profile info first
  if (accountProfile) {
    if (accountProfile.name) {
      parts.push(`**Company:** ${accountProfile.name}`);
    }
    if (accountProfile.domain) {
      parts.push(`**Domain:** ${accountProfile.domain}`);
    }
    if (accountProfile.industry) {
      parts.push(`**Industry:** ${accountProfile.industry}`);
    }
    if (accountProfile.description) {
      parts.push(`**Description:** ${accountProfile.description}`);
    }
    if (accountProfile.employeeCount) {
      parts.push(`**Employee Count:** ${accountProfile.employeeCount}`);
    }
    if (accountProfile.revenue) {
      parts.push(`**Revenue:** ${accountProfile.revenue}`);
    }
  }

  if (intelligence) {
    if (intelligence.problem_hypothesis) {
      parts.push(`**Problem Hypothesis:** ${intelligence.problem_hypothesis}`);
    }
    if (intelligence.recommended_angle) {
      parts.push(`**Recommended Angle:** ${intelligence.recommended_angle}`);
    }
    if (intelligence.tone) {
      parts.push(`**Tone:** ${intelligence.tone}`);
    }
    if (intelligence.do_not_use && intelligence.do_not_use.length > 0) {
      parts.push(`**Avoid:** ${intelligence.do_not_use.join(', ')}`);
    }
  }

  if (brief) {
    if (brief.problem) {
      parts.push(`**Core Problem:** ${brief.problem}`);
    }
    if (brief.insight) {
      parts.push(`**Insight:** ${brief.insight}`);
    }
    if (brief.posture) {
      parts.push(`**Posture:** ${brief.posture}`);
    }
  }

  return parts.join('\n\n');
}

function buildContactContextSection(contact: any): string {
  const parts = ['## Contact Context'];

  if (contact.fullName) {
    parts.push(`**Name:** ${contact.fullName}`);
  }
  if (contact.jobTitle) {
    parts.push(`**Title:** ${contact.jobTitle}`);
  }
  if (contact.seniorityLevel) {
    parts.push(`**Seniority:** ${contact.seniorityLevel}`);
  }
  if (contact.department) {
    parts.push(`**Department:** ${contact.department}`);
  }

  return parts.join('\n');
}

function buildCallPlanSection(
  context: ParticipantCallContext | null,
  plan: ParticipantCallPlanPayload | null
): string {
  const parts = ['## Call Plan'];

  if (context) {
    parts.push(`**Relationship State:** ${context.relationship_state}`);
    if (context.prior_touches.length > 0) {
      parts.push(`**Prior Touches:** ${context.prior_touches.join(', ')}`);
    }
    if (context.last_call_outcome) {
      parts.push(`**Last Call Outcome:** ${context.last_call_outcome}`);
    }
  }

  if (plan) {
    if (plan.opening_lines.length > 0) {
      parts.push(`**Opening Options:**\n${plan.opening_lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`);
    }
    if (plan.first_question) {
      parts.push(`**First Question:** ${plan.first_question}`);
    }
    if (plan.micro_insight) {
      parts.push(`**Micro Insight:** ${plan.micro_insight}`);
    }
    if (plan.cta) {
      parts.push(`**CTA:** ${plan.cta}`);
    }
  }

  return parts.join('\n\n');
}

function buildDefaultFirstMessage(contactContext: string): string {
  // Extract contact name from context if available
  const nameMatch = contactContext.match(/\*\*Name:\*\* (.+)/);
  const name = nameMatch ? nameMatch[1] : 'there';

  return `Hello, may I please speak with ${name}?`;
}

async function buildAssembledPrompt(params: {
  campaignId: string;
  accountId: string;
  contactId?: string;
  virtualAgentId?: string;
  agentConfig?: VirtualAgentConfig | null;
  agentSettings?: VirtualAgentSettings;
}): Promise<{ systemPrompt: string; firstMessage: string }> {
  const {
    campaignId,
    accountId,
    contactId,
    virtualAgentId,
    agentConfig: agentConfigOverride,
    agentSettings,
  } = params;

  // Get campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  // Get virtual agent
  const agentConfig = agentConfigOverride
    ? agentConfigOverride
    : (virtualAgentId ? await getVirtualAgentConfig(virtualAgentId) : null);
  const mergedSettings = agentSettings || mergeAgentSettings(agentConfig?.settings ?? undefined);
  const useCondensedPrompt =
    mergedSettings.advanced.costOptimization.useCondensedPrompt !== false;

  // Build sections
  const sections = [
    agentConfig?.systemPrompt || '',
    campaign ? buildCampaignContextSection(campaign) : '',
  ];

  try {
    const intelligenceRecord = await getOrBuildAccountIntelligence(accountId);
    const messagingBriefRecord = await getOrBuildAccountMessagingBrief({ accountId, campaignId });
    const accountProfile = await getAccountProfileData(accountId);
    sections.push(buildAccountContextSection(
      intelligenceRecord?.payloadJson as AccountIntelligencePayload,
      messagingBriefRecord?.payloadJson as AccountMessagingBriefPayload,
      accountProfile
    ));
  } catch (e) {
    // Ignore
  }

  if (contactId) {
    try {
      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);

      if (contact) {
        sections.push(buildContactContextSection(contact));
      }

      const participantContext = await buildParticipantCallContext(contactId);
      const planRecord = await getOrBuildParticipantCallPlan({
        contactId,
        accountId,
        campaignId,
      });
      sections.push(buildCallPlanSection(
        participantContext,
        planRecord?.payloadJson as ParticipantCallPlanPayload
      ));
    } catch (e) {
      // Ignore
    }
  }

  const systemPromptBase = sections.filter(Boolean).join('\n\n');
  const systemPrompt = ensureVoiceAgentControlLayer(systemPromptBase, useCondensedPrompt);
  const firstMessage =
    agentConfig?.firstMessage ||
    'Hello, may I speak with the person in charge of your technology decisions?';

  return { systemPrompt, firstMessage };
}

export default router;
