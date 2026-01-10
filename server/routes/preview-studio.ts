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
  type PreviewStudioSession,
  type PreviewSimulationTranscript,
  type PreviewGeneratedContent,
} from "@shared/schema";
import {
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
} from "../services/account-messaging-service";
import {
  getOrBuildAccountCallBrief,
  getOrBuildParticipantCallPlan,
  buildParticipantCallContext as buildParticipantCallContextById,
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

// Wrapper to match our API interface
async function buildParticipantCallContext(params: {
  contactId: string;
  accountId: string;
  campaignId: string;
}): Promise<ParticipantCallContext> {
  return buildParticipantCallContextById(params.contactId);
}

type AgentSettingsSource = 'agent' | 'default';

type VirtualAgentConfig = {
  systemPrompt: string | null;
  firstMessage: string | null;
  voice: string | null;
  settings: Partial<VirtualAgentSettings> | null;
};

async function resolveVirtualAgentId(params: {
  campaignId: string;
  virtualAgentId?: string | null;
}): Promise<string | null> {
  if (params.virtualAgentId) {
    return params.virtualAgentId;
  }

  const [assignment] = await db
    .select({ virtualAgentId: campaignAgentAssignments.virtualAgentId })
    .from(campaignAgentAssignments)
    .where(
      and(
        eq(campaignAgentAssignments.campaignId, params.campaignId),
        eq(campaignAgentAssignments.isActive, true)
      )
    )
    .limit(1);

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
  contactId: z.string(),
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
});

const getAssembledPromptSchema = z.object({
  campaignId: z.string(),
  accountId: z.string(),
  contactId: z.string().optional(),
  virtualAgentId: z.string().optional(),
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
  participantCallPlan: ParticipantCallPlanPayload;
  participantContext: ParticipantCallContext;
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
}

export interface SimulationStartResponse {
  sessionId: string;
  websocketUrl: string;
  assembledPrompt: string;
  firstMessage: string;
  virtualAgentId: string | null;
  agentSettings: VirtualAgentSettings;
  agentSettingsSource: AgentSettingsSource;
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
        industry: accounts.industry,
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
    }).returning();

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
          participantContext = await buildParticipantCallContext({
            contactId,
            accountId,
            campaignId,
          });
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

    const participantContext = await buildParticipantCallContext({
      contactId,
      accountId,
      campaignId,
    });

    const planRecord = await getOrBuildParticipantCallPlan({
      contactId,
      accountId,
      campaignId,
      attemptNumber,
    });
    const participantCallPlan = planRecord?.payloadJson as ParticipantCallPlanPayload;

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
    const { agentConfig, mergedSettings, settingsSource } =
      await getAgentSimulationSettings(resolvedVirtualAgentId);
    const useCondensedPrompt =
      mergedSettings.advanced.costOptimization.useCondensedPrompt !== false;

    // Build prompt sections
    const sections = {
      foundation: agentConfig?.systemPrompt || '',
      campaign: buildCampaignContextSection(campaign),
      account: '',
      contact: '',
      callPlan: '',
    };

    // Get account context
    try {
      const intelligenceRecord = await getOrBuildAccountIntelligence(accountId);
      const messagingBriefRecord = await getOrBuildAccountMessagingBrief({ accountId, campaignId });
      sections.account = buildAccountContextSection(
        intelligenceRecord?.payloadJson as AccountIntelligencePayload,
        messagingBriefRecord?.payloadJson as AccountMessagingBriefPayload
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

        const participantContext = await buildParticipantCallContext({
          contactId,
          accountId,
          campaignId,
        });
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
      virtualAgentId: resolvedVirtualAgentId,
      agentSettings: mergedSettings,
      agentSettingsSource: settingsSource,
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

/**
 * POST /api/preview-studio/simulation/start
 * Start a browser-based voice simulation session
 */
router.post("/simulation/start", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const body = startSimulationSchema.parse(req.body);
    const { campaignId, accountId, contactId, virtualAgentId } = body;

    const resolvedVirtualAgentId = await resolveVirtualAgentId({
      campaignId,
      virtualAgentId,
    });
    const { agentConfig, mergedSettings, settingsSource } =
      await getAgentSimulationSettings(resolvedVirtualAgentId);

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
        agentVoice: agentConfig?.voice || null,
      },
    }).returning();

    // Build WebSocket URL
    const wsHost = process.env.PUBLIC_WEBSOCKET_URL?.split('/openai-realtime-dialer')[0] ||
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

    const response: SimulationStartResponse = {
      sessionId: session.id,
      try {
        const userId = (req as any).user?.id;
        const body = startSimulationSchema.parse(req.body);
        const { campaignId, accountId, contactId, virtualAgentId } = body;

        // Fetch virtual agent settings
        let agentSettings = null;
        if (virtualAgentId) {
          const [agent] = await db
            .select({ settings: virtualAgents.settings })
            .from(virtualAgents)
            .where(eq(virtualAgents.id, virtualAgentId))
            .limit(1);
          agentSettings = agent?.settings || null;
        }

        // Create preview session with agentSettings in metadata
        const [session] = await db.insert(previewStudioSessions).values({
          campaignId,
          accountId,
          contactId,
          userId,
          virtualAgentId: virtualAgentId || null,
          sessionType: 'simulation',
          status: 'active',
          metadata: { startedAt: new Date().toISOString(), agentSettings },
        }).returning();

        // Build WebSocket URL
        const wsHost = process.env.PUBLIC_WEBSOCKET_URL?.split('/openai-realtime-dialer')[0] ||
                       process.env.REPLIT_DEV_DOMAIN ||
                       req.get('X-Public-Host') ||
                       req.get('host') ||
                       'localhost:5000';

        const wsUrl = wsHost.startsWith('wss://') || wsHost.startsWith('ws://')
          ? `${wsHost}/preview-simulation?sessionId=${session.id}`
          : `wss://${wsHost}/preview-simulation?sessionId=${session.id}`;

        // Get assembled prompt for reference, pass agentSettings if needed
        const promptResponse = await buildAssembledPrompt({
          campaignId,
          accountId,
          contactId,
          virtualAgentId,
          agentSettings,
        });

        const response: SimulationStartResponse = {
          sessionId: session.id,
          websocketUrl: wsUrl,
          assembledPrompt: promptResponse.systemPrompt,
          agentSettings,
        };

        res.json(response);
      } catch (error) {
        console.error("Error starting simulation:", error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Invalid request", errors: error.errors });
        }
        res.status(500).json({ message: "Failed to start simulation" });
      }
    await db.update(previewStudioSessions)
      .set({
        status: 'completed',
        endedAt: endTime,
        metadata: {
          ...session.metadata as object,
          duration,
          transcriptCount: transcripts.length,
        },
      })
      .where(eq(previewStudioSessions.id, sessionId));

    // Basic analysis (can be enhanced with AI analysis later)
    const analysis = {
      statesVisited: [] as string[],
      objectionsHandled: [] as string[],
      dispositionReached: null as string | null,
    };

    res.json({
      duration,
      transcripts: transcripts.map(t => ({
        role: t.role,
        content: t.content,
        timestampMs: t.timestampMs,
      })),
      analysis,
    });
  } catch (error) {
    console.error("Error ending simulation:", error);
    res.status(500).json({ message: "Failed to end simulation" });
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

// ==================== HELPER FUNCTIONS ====================

function buildCampaignContextSection(campaign: any): string {
  const parts = ['## Campaign Context'];

  if (campaign.campaignObjective) {
    parts.push(`**Objective:** ${campaign.campaignObjective}`);
  }
  if (campaign.productServiceInfo) {
    parts.push(`**Product/Service:** ${campaign.productServiceInfo}`);
  }
  if (campaign.targetAudienceDescription) {
    parts.push(`**Target Audience:** ${campaign.targetAudienceDescription}`);
  }
  if (campaign.successCriteria) {
    parts.push(`**Success Criteria:** ${campaign.successCriteria}`);
  }
  if (campaign.talkingPoints && Array.isArray(campaign.talkingPoints)) {
    parts.push(`**Key Points:**\n${campaign.talkingPoints.map((p: string) => `- ${p}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

function buildAccountContextSection(
  intelligence: AccountIntelligencePayload | null,
  brief: AccountMessagingBriefPayload | null
): string {
  const parts = ['## Account Context'];

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
    sections.push(buildAccountContextSection(
      intelligenceRecord?.payloadJson as AccountIntelligencePayload,
      messagingBriefRecord?.payloadJson as AccountMessagingBriefPayload
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

      const participantContext = await buildParticipantCallContext({
        contactId,
        accountId,
        campaignId,
      });
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
