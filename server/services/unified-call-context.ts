/**
 * Unified Call Context Builder
 *
 * CRITICAL: This module ensures test calls and queue calls operate under
 * the EXACT same configuration. Any update made to one must automatically
 * propagate to the other.
 *
 * Both test AI campaigns and live call queues MUST use this builder to
 * ensure zero configuration drift between environments.
 */

import { db } from '../db';
import { campaigns, campaignAgentAssignments, virtualAgents } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { getOrganizationById } from './problem-intelligence/organization-service';
import { mergeAgentSettings, type VirtualAgentSettings } from './virtual-agent-settings';

/**
 * Unified call context - used by both test calls and queue calls
 */
export interface UnifiedCallContext {
  // Call identifiers
  callId: string;
  runId: string;
  campaignId: string;
  queueItemId: string;
  callAttemptId: string;
  contactId: string;

  // Phone numbers
  calledNumber: string;
  fromNumber: string;
  callerNumberId: string | null;
  callerNumberDecisionId: string | null;

  // Agent configuration
  virtualAgentId: string | null;
  agentName: string;
  voice: string;
  firstMessage: string;
  systemPrompt: string | null;
  agentSettings: Record<string, any> | null;

  // Contact information
  contactName: string;
  contactFirstName: string;
  contactLastName: string;
  contactJobTitle: string;
  contactEmail: string;
  accountName: string;

  // Organization (who we're calling FROM)
  organizationName: string;

  // Campaign context
  campaignObjective: string;
  campaignType: string;
  successCriteria: string;
  targetAudienceDescription: string;
  productServiceInfo: string;
  talkingPoints: string[];
  campaignContextBrief: string;
  callFlow: unknown;
  maxCallDurationSeconds: number | null;

  // Session metadata
  isTestCall: boolean;
  testCallId: string | null;
  provider: 'google' | 'openai';
}

/**
 * Agent assignment resolved from campaign
 */
export interface ResolvedAgentAssignment {
  virtualAgentId: string | null;
  agentName: string;
  systemPrompt: string;
  firstMessage: string;
  voice: string;
  settings: Record<string, any> | null;
}

/**
 * Fully resolved agent configuration — the Unified Agent Architecture abstraction.
 *
 * Once built, no consumer should ever need to query the virtualAgents table.
 * The originId is kept for audit/locking purposes ONLY — consumers MUST NOT
 * use it to re-fetch config. It may be a DB ID, "campaign-{id}-inline", or
 * any future source.
 */
export interface ResolvedAgentConfig {
  /** Opaque origin identifier — for audit trails and queue locking only. */
  originId: string;
  agentName: string;
  systemPrompt: string;
  firstMessage: string;
  voice: string;
  provider: 'google' | 'openai';
  /** Fully merged settings (defaults already applied). */
  settings: VirtualAgentSettings;
  /** Raw settings before merge (for override logic). */
  rawSettings: Record<string, any> | null;
}

/**
 * Resolve agent config from campaign — single resolution point.
 * Returns a fully resolved config so downstream code never needs
 * to query the virtualAgents table directly.
 */
export async function resolveAgentConfig(
  campaignId: string,
  providerHint?: 'google' | 'openai'
): Promise<ResolvedAgentConfig | null> {
  const assignment = await resolveAgentAssignment(campaignId);
  if (!assignment) return null;

  const mergedSettings = mergeAgentSettings(
    assignment.settings as Partial<VirtualAgentSettings> | undefined
  );

  return {
    originId: assignment.virtualAgentId || `campaign-${campaignId}-inline`,
    agentName: assignment.agentName,
    systemPrompt: assignment.systemPrompt,
    firstMessage: assignment.firstMessage,
    voice: assignment.voice,
    provider: providerHint || 'google',
    settings: mergedSettings,
    rawSettings: assignment.settings,
  };
}

/** Check if an agent origin ID represents an inline campaign agent (not a DB record) */
export function isInlineAgentOrigin(originId: string | null | undefined): boolean {
  return !!originId && originId.startsWith('campaign-') && originId.includes('-inline');
}

/** Extract a DB-safe virtualAgentId (null for inline agents) */
export function toDbVirtualAgentId(originId: string | null | undefined): string | null {
  return isInlineAgentOrigin(originId) ? null : (originId || null);
}

/**
 * Input for building unified call context
 */
export interface BuildCallContextInput {
  // Required identifiers
  campaignId: string;

  // Call identifiers (can be generated if not provided)
  callId?: string;
  runId?: string;
  queueItemId?: string;
  callAttemptId?: string;
  contactId?: string;

  // Phone numbers
  calledNumber: string;
  fromNumber: string;
  callerNumberId?: string | null;
  callerNumberDecisionId?: string | null;

  // Contact information
  contactName?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactJobTitle?: string;
  contactEmail?: string;
  accountName?: string;

  // Test mode
  isTestCall?: boolean;

  // Provider preference
  provider?: 'google' | 'openai';
}

/**
 * Resolve agent assignment from campaign configuration
 * This is the SINGLE SOURCE OF TRUTH for agent configuration
 */
export async function resolveAgentAssignment(campaignId: string): Promise<ResolvedAgentAssignment | null> {
  // Fetch campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    console.warn(`[UnifiedCallContext] Campaign not found: ${campaignId}`);
    return null;
  }

  // Fetch organization name
  let organizationName: string | undefined;
  const campaignOrgId = (campaign as any).problemIntelligenceOrgId;
  if (campaignOrgId) {
    try {
      const campaignOrg = await getOrganizationById(campaignOrgId);
      if (campaignOrg) {
        organizationName = campaignOrg.name;
      }
    } catch (err) {
      console.warn(`[UnifiedCallContext] Failed to fetch organization ${campaignOrgId}:`, err);
    }
  }

  // PRIORITY 1: Use aiAgentSettings from campaign (wizard-based approach)
  const aiSettings = (campaign as any).aiAgentSettings as Record<string, any> | null;
  if (aiSettings) {
    const persona = aiSettings.persona || {};

    // Build system prompt from persona and campaign context
    const systemPromptParts: string[] = [];

    // Organization identity
    const orgName = persona.companyName || organizationName;

    // Voice Selection Logic (resolve BEFORE agent name so voice name can be used as fallback)
    // Priority: 1. Assigned Voices Rotation, 2. Persona Voice, 3. Fallback
    let voice = persona.voice || aiSettings.voiceId || aiSettings.voice || 'Puck';
    let voiceName = voice; // The voice's display name (e.g., "Kore", "Puck")

    const assignedVoices = (campaign as any).assignedVoices as { id: string; name: string }[] | null;
    if (assignedVoices && Array.isArray(assignedVoices) && assignedVoices.length > 0) {
      // Pick a random voice from the assigned list
      const randomVoice = assignedVoices[Math.floor(Math.random() * assignedVoices.length)];
      if (randomVoice?.id) {
        voice = randomVoice.id;
        voiceName = randomVoice.name || randomVoice.id;
        console.log(`[UnifiedCallContext] 🎲 Voice rotation: picked "${voice}" (${voiceName}) from ${assignedVoices.length} assigned voices: [${assignedVoices.map(v => v.name || v.id).join(', ')}]`);
      }
    } else {
      console.log(`[UnifiedCallContext] Single voice mode: "${voice}" (no assigned voices rotation)`);
    }

    // Agent identity - check persona fields first, then fall back to the selected voice name
    // This ensures the AI always has a real name to use without manual entry
    const agentName = persona.agentName || persona.name || voiceName;

    // Build system prompt from persona and campaign context
    if (agentName) {
      systemPromptParts.push(`You are ${agentName}.`);
    }

    if (orgName) {
      systemPromptParts.push(`You represent ${orgName}.`);
    }

    // Role and personality
    if (persona.role) {
      systemPromptParts.push(`Your role is ${persona.role}.`);
    }
    if (persona.personality) {
      systemPromptParts.push(`Your personality: ${persona.personality}.`);
    }

    // Talking points
    if (aiSettings.talkingPoints?.length) {
      systemPromptParts.push(`Key talking points: ${aiSettings.talkingPoints.join('; ')}`);
    }

    // Campaign objective
    const objective = aiSettings.objective || (campaign as any).campaignObjective;
    if (objective) {
      systemPromptParts.push(`Objective: ${objective}`);
    }

    // CRITICAL BEHAVIOR RULES (applies to all calls)
    systemPromptParts.push(`

CRITICAL CONVERSATION BEHAVIOR:
1. CALL OPENING — LISTEN FIRST: When the call connects, LISTEN before speaking. Wait for the person to say "Hello?" or greet you. When you hear a human voice, respond IMMEDIATELY with your greeting — no hesitation. If you hear an automated recording, voicemail prompt, or IVR menu, follow the voicemail/IVR exit rules. If the person is completely silent for several seconds, the system will prompt you to start the conversation.
2. CALL CLOSING: You MUST ALWAYS say a proper farewell before ending the call. After confirming any appointment, email, or completing your objective, say "Thank you so much for your time today! Have a great day!" and WAIT for their response before calling end_call. NEVER hang up immediately after confirming details.
3. TURN-TAKING: Wait for the prospect to finish speaking before responding. Do not interrupt.
4. IDENTITY: When anyone asks "who are you?", "who is calling?", or "where are you calling from?", ALWAYS respond with your name and organization: "This is ${agentName} calling from ${orgName || 'our company'}." Be confident and clear about your identity.
`);

    // Build first message - check multiple fields
    const firstMessage = aiSettings.openingMessage
      || aiSettings.firstMessage
      || aiSettings.scripts?.opening
      || `Hello, this is ${agentName} calling from ${orgName || 'our company'}.`;

    return {
      virtualAgentId: `campaign-${campaignId}-inline`,
      agentName,
      systemPrompt: systemPromptParts.join(' ') || 'You are a helpful sales development representative.',
      firstMessage,
      // Voice priority: Rotation > persona.voice > aiSettings.voiceId > aiSettings.voice > fallback
      voice,
      settings: aiSettings,
    };
  }

  // PRIORITY 2: Fallback to legacy virtual agent assignment
  const [dbAssignment] = await db
    .select({
      virtualAgentId: campaignAgentAssignments.virtualAgentId,
      agentName: virtualAgents.name,
      systemPrompt: virtualAgents.systemPrompt,
      firstMessage: virtualAgents.firstMessage,
      voice: virtualAgents.voice,
      settings: virtualAgents.settings,
    })
    .from(campaignAgentAssignments)
    .innerJoin(virtualAgents, eq(virtualAgents.id, campaignAgentAssignments.virtualAgentId))
    .where(
      and(
        eq(campaignAgentAssignments.campaignId, campaignId),
        eq(campaignAgentAssignments.agentType, 'ai'),
        eq(campaignAgentAssignments.isActive, true)
      )
    )
    .limit(1);

  if (dbAssignment) {
    return {
      virtualAgentId: dbAssignment.virtualAgentId,
      agentName: dbAssignment.agentName || 'AI Sales Agent',
      systemPrompt: dbAssignment.systemPrompt || 'You are a helpful sales development representative.',
      firstMessage: dbAssignment.firstMessage || 'Hello, how can I help you today?',
      voice: dbAssignment.voice || 'Puck',
      settings: dbAssignment.settings as Record<string, any> | null,
    };
  }

  return null;
}

/**
 * Resolve campaign context (objective, talking points, etc.)
 * This is the SINGLE SOURCE OF TRUTH for campaign context
 */
export async function resolveCampaignContext(campaignId: string): Promise<{
  organizationName: string;
  campaignObjective: string;
  campaignType: string;
  successCriteria: string;
  targetAudienceDescription: string;
  productServiceInfo: string;
  talkingPoints: string[];
  campaignContextBrief: string;
  callFlow: unknown;
  maxCallDurationSeconds: number | null;
}> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return {
      organizationName: 'our organization',
      campaignObjective: '',
      campaignType: '',
      successCriteria: '',
      targetAudienceDescription: '',
      productServiceInfo: '',
      talkingPoints: [],
      campaignContextBrief: '',
      callFlow: null,
      maxCallDurationSeconds: null,
    };
  }

  // Resolve organization name
  let organizationName = 'our organization';
  const aiSettings = (campaign as any).aiAgentSettings as Record<string, any> | null;

  // Priority 1: Check aiSettings.persona.companyName
  if (aiSettings?.persona?.companyName) {
    organizationName = aiSettings.persona.companyName;
  } else {
    // Priority 2: Look up from problemIntelligenceOrgId
    const campaignOrgId = (campaign as any).problemIntelligenceOrgId;
    if (campaignOrgId) {
      try {
        const campaignOrg = await getOrganizationById(campaignOrgId);
        if (campaignOrg?.name) {
          organizationName = campaignOrg.name;
        }
      } catch (err) {
        console.warn(`[UnifiedCallContext] Failed to fetch organization:`, err);
      }
    }
  }

  return {
    organizationName,
    campaignObjective: (campaign as any).campaignObjective || '',
    campaignType: (campaign as any).type || (campaign as any).campaignType || '',
    successCriteria: (campaign as any).successCriteria || '',
    targetAudienceDescription: (campaign as any).targetAudienceDescription || '',
    productServiceInfo: (campaign as any).productServiceInfo || '',
    talkingPoints: ((campaign as any).talkingPoints as string[]) || [],
    campaignContextBrief: (campaign as any).campaignContextBrief || '',
    callFlow: (campaign as any).callFlow || null,
    maxCallDurationSeconds: (campaign as any).maxCallDurationSeconds || null,
  };
}

/**
 * Build unified call context
 * This is THE function both test calls and queue calls MUST use
 */
export async function buildUnifiedCallContext(input: BuildCallContextInput): Promise<UnifiedCallContext | null> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 11);
  const isTestCall = input.isTestCall || false;

  if (!isTestCall) {
    const missing = [
      !input.queueItemId ? 'queueItemId' : null,
      !input.callAttemptId ? 'callAttemptId' : null,
      !input.contactId ? 'contactId' : null,
    ].filter(Boolean);

    if (missing.length > 0) {
      console.error(`[UnifiedCallContext] Refusing to build non-test call context without canonical linkage: ${missing.join(', ')}`);
      return null;
    }
  }

  // Generate IDs if not provided
  const callId = input.callId || `ai-call-${timestamp}-${randomSuffix}`;
  const runId = input.runId || `run-${timestamp}`;
  const queueItemId = input.queueItemId || `test-queue-${callId}`;
  const callAttemptId = input.callAttemptId || `test-attempt-${callId}`;
  const contactId = input.contactId || `test-contact-${callId}`;

  // Resolve agent assignment
  const agentAssignment = await resolveAgentAssignment(input.campaignId);
  if (!agentAssignment) {
    console.error(`[UnifiedCallContext] No agent assignment found for campaign ${input.campaignId}`);
    return null;
  }

  // Resolve campaign context
  const campaignContext = await resolveCampaignContext(input.campaignId);

  // Build contact full name
  const contactName = input.contactName
    || [input.contactFirstName, input.contactLastName].filter(Boolean).join(' ').trim()
    || 'there';

  const contactFirstName = input.contactFirstName
    || (input.contactName ? input.contactName.split(' ')[0] : 'there');

  const contactLastName = input.contactLastName
    || (input.contactName ? input.contactName.split(' ').slice(1).join(' ') : '');

  return {
    // Call identifiers
    callId,
    runId,
    campaignId: input.campaignId,
    queueItemId,
    callAttemptId,
    contactId,

    // Phone numbers
    calledNumber: input.calledNumber,
    fromNumber: input.fromNumber,
    callerNumberId: input.callerNumberId || null,
    callerNumberDecisionId: input.callerNumberDecisionId || null,

    // Agent configuration (from unified resolver)
    virtualAgentId: agentAssignment.virtualAgentId,
    agentName: agentAssignment.agentName,
    voice: agentAssignment.voice,
    firstMessage: agentAssignment.firstMessage,
    systemPrompt: agentAssignment.systemPrompt,
    agentSettings: agentAssignment.settings,

    // Contact information
    contactName,
    contactFirstName,
    contactLastName,
    contactJobTitle: input.contactJobTitle || '',
    contactEmail: input.contactEmail || '',
    accountName: input.accountName || '',

    // Organization (who we're calling FROM) - from unified resolver
    organizationName: campaignContext.organizationName,

    // Campaign context (from unified resolver)
    campaignObjective: campaignContext.campaignObjective,
    campaignType: campaignContext.campaignType,
    successCriteria: campaignContext.successCriteria,
    targetAudienceDescription: campaignContext.targetAudienceDescription,
    productServiceInfo: campaignContext.productServiceInfo,
    talkingPoints: campaignContext.talkingPoints,
    campaignContextBrief: campaignContext.campaignContextBrief,
    callFlow: campaignContext.callFlow,
    maxCallDurationSeconds: campaignContext.maxCallDurationSeconds,

    // Session metadata
    isTestCall,
    testCallId: isTestCall ? callId : null,
    provider: input.provider || 'google',
  };
}

/**
 * Convert unified context to client_state params for Telnyx WebSocket
 * This ensures both test calls and queue calls pass IDENTICAL parameters
 */
export function contextToClientStateParams(ctx: UnifiedCallContext): Record<string, any> {
  return {
    // Call identifiers
    call_id: ctx.callId,
    run_id: ctx.runId,
    campaign_id: ctx.campaignId,
    queue_item_id: ctx.queueItemId,
    call_attempt_id: ctx.callAttemptId,
    contact_id: ctx.contactId,

    // Phone numbers
    called_number: ctx.calledNumber,
    from_number: ctx.fromNumber,
    caller_number_id: ctx.callerNumberId ?? undefined,
    caller_number_decision_id: ctx.callerNumberDecisionId ?? undefined,

    // Agent configuration
    virtual_agent_id: ctx.virtualAgentId,
    agent_name: ctx.agentName,
    voice: ctx.voice,
    first_message: ctx.firstMessage,
    // system_prompt intentionally NOT included — voice-dialer builds the full
    // canonical prompt from campaign config at call time (same as production).
    // agent_settings also omitted — voice-dialer resolves from campaign/agent config.

    // Contact information - both underscore and dot notation for compatibility
    contact_name: ctx.contactName,
    contact_first_name: ctx.contactFirstName,
    contact_last_name: ctx.contactLastName,
    contact_job_title: ctx.contactJobTitle,
    account_name: ctx.accountName,
    'contact.full_name': ctx.contactName,
    'contact.first_name': ctx.contactFirstName,
    'contact.last_name': ctx.contactLastName,
    'contact.job_title': ctx.contactJobTitle,
    'account.name': ctx.accountName,

    // Organization
    organization_name: ctx.organizationName,

    // Campaign context
    campaign_objective: ctx.campaignObjective,
    success_criteria: ctx.successCriteria,
    target_audience_description: ctx.targetAudienceDescription,
    product_service_info: ctx.productServiceInfo,
    talking_points: ctx.talkingPoints,
    max_call_duration_seconds: ctx.maxCallDurationSeconds,

    // Session metadata
    is_test_call: ctx.isTestCall,
    test_call_id: ctx.testCallId,
    provider: ctx.provider === 'google' ? 'gemini_live' : 'openai_realtime',

    // Test contact object for backward compatibility
    test_contact: ctx.isTestCall ? {
      name: ctx.contactName,
      company: ctx.accountName,
      title: ctx.contactJobTitle,
      email: ctx.contactEmail,
    } : undefined,
  };
}

/**
 * Store session data in Redis for retrieval by voice-dialer
 * This ensures both test calls and queue calls have identical session data
 */
export async function storeCallSession(ctx: UnifiedCallContext): Promise<void> {
  const { callSessionStore } = await import('./call-session-store');

  // CRITICAL: Do NOT store system_prompt or agent_settings in Redis.
  // The voice-dialer MUST build the full system prompt from campaign config
  // at call time using buildSystemPrompt(), which includes the canonical
  // foundational prompt with full behavioral framework (identity confirmation,
  // gatekeeper handling, turn-taking, conversation discipline, etc.).
  // Storing a simplified prompt here causes the voice-dialer to short-circuit
  // its normal prompt building pipeline (PATH 1 override vs PATH 3 canonical),
  // resulting in weaker agent behavior during test calls vs production calls.
  // Production calls (via telnyx-ai-bridge.ts) never store system_prompt in Redis.
  await callSessionStore.setSession(ctx.callId, {
    call_id: ctx.callId,
    run_id: ctx.runId,
    campaign_id: ctx.campaignId,
    queue_item_id: ctx.queueItemId,
    call_attempt_id: ctx.callAttemptId,
    contact_id: ctx.contactId,
    called_number: ctx.calledNumber,
    from_number: ctx.fromNumber,
    caller_number_id: ctx.callerNumberId ?? undefined,
    caller_number_decision_id: ctx.callerNumberDecisionId ?? undefined,
    virtual_agent_id: ctx.virtualAgentId ?? undefined,
    is_test_call: ctx.isTestCall,
    test_call_id: ctx.testCallId ?? undefined,
    first_message: ctx.firstMessage,
    voice: ctx.voice,
    agent_name: ctx.agentName,
    organization_name: ctx.organizationName,
    // system_prompt intentionally omitted — voice-dialer builds it from campaign config
    // agent_settings intentionally omitted — voice-dialer resolves from campaign/agent config
    provider: ctx.provider,
    test_contact: ctx.isTestCall ? {
      name: ctx.contactName,
      company: ctx.accountName,
      title: ctx.contactJobTitle,
      email: ctx.contactEmail,
    } : undefined,
    // Campaign context for prompt building
    campaign_objective: ctx.campaignObjective,
    success_criteria: ctx.successCriteria,
    target_audience_description: ctx.targetAudienceDescription,
    product_service_info: ctx.productServiceInfo,
    talking_points: ctx.talkingPoints,
  });

  console.log(`[UnifiedCallContext] Stored session ${ctx.callId} (isTest=${ctx.isTestCall})`);
}
