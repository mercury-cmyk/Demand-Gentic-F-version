/**
 * Execution Prompt Assembler Service
 *
 * Assembles final execution-ready prompts for AI agents by combining:
 * - Shared campaign context
 * - Channel-specific flow (CallFlow or EmailSequence)
 * - Resolved templates (with variable substitution)
 * - Compliance rules
 *
 * Prompts are cached for performance and invalidated when inputs change.
 */

import { createHash } from 'crypto';
import { db } from '../db';
import {
  campaigns,
  campaignChannelVariants,
  campaignExecutionPrompts,
  accounts,
  contacts,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type {
  ChannelType,
  AssembledPrompt,
  AssembledPromptComponents,
  CampaignExecutionPrompt,
  ResolvedTemplates,
  EmailSequenceFlow,
} from '@shared/multi-channel-types';
import {
  resolveAndSubstituteTemplates,
  buildVariablesFromContext,
  substituteVariables,
} from './template-resolution-service';
import { getChannelVariant } from './channel-variant-generator';

// ============================================================
// PROMPT ASSEMBLY
// ============================================================

export interface AssemblePromptOptions {
  campaignId: string;
  channelType: ChannelType;
  accountId?: string;
  contactId?: string;
  forceRegenerate?: boolean;
}

/**
 * Assemble the final execution prompt for an agent.
 * Uses caching to avoid regeneration when inputs haven't changed.
 */
export async function assembleExecutionPrompt(
  options: AssemblePromptOptions
): Promise<AssembledPrompt> {
  const { campaignId, channelType, accountId, contactId, forceRegenerate } = options;

  // Check cache first (unless force regenerate)
  if (!forceRegenerate) {
    const cached = await getCachedPrompt(campaignId, channelType, accountId, contactId);
    if (cached) {
      return cached;
    }
  }

  // Get campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Get channel variant
  const variant = await getChannelVariant(campaignId, channelType);
  if (!variant) {
    throw new Error(`Channel variant not found for ${channelType}`);
  }

  // Resolve templates with variable substitution
  const resolvedTemplates = await resolveAndSubstituteTemplates({
    campaignId,
    channelType,
    accountId,
    contactId,
  });

  // Build the prompt components
  const components = await buildPromptComponents(
    campaign,
    variant,
    channelType,
    resolvedTemplates,
    accountId,
    contactId
  );

  // Assemble the final prompt
  const finalPrompt = assembleFinalPrompt(components, channelType);

  // Generate hash for change detection
  const promptHash = generatePromptHash(finalPrompt);

  // Get or create version number
  const existingPrompt = await getExistingPromptRecord(campaignId, channelType, accountId, contactId);
  const version = existingPrompt ? (existingPrompt.version || 0) + 1 : 1;

  // Cache the prompt
  await cachePrompt({
    campaignId,
    channelType,
    accountId,
    contactId,
    components,
    finalPrompt,
    promptHash,
    version,
  });

  return {
    finalPrompt,
    components,
    promptHash,
    version,
  };
}

/**
 * Build prompt components from campaign, variant, and templates.
 */
async function buildPromptComponents(
  campaign: any,
  variant: any,
  channelType: ChannelType,
  resolvedTemplates: ResolvedTemplates,
  accountId?: string,
  contactId?: string
): Promise<AssembledPromptComponents> {
  // Build base context from campaign
  const baseContext = buildBaseContext(campaign);

  // Build channel-specific instructions
  const channelInstructions = buildChannelInstructions(channelType, variant);

  // Build compliance rules
  const complianceRules = buildComplianceRules(campaign, channelType);

  // Get the flow from variant (or override if present)
  const flow = variant.flowOverride
    ? { ...variant.generatedFlow, ...variant.flowOverride }
    : variant.generatedFlow;

  const components: AssembledPromptComponents = {
    baseContext,
    channelInstructions,
    resolvedTemplates,
    complianceRules,
  };

  // Add email sequence flow if email channel
  if (channelType === 'email') {
    components.emailSequence = flow as EmailSequenceFlow;
  }

  return components;
}

/**
 * Build base context from campaign fields.
 */
function buildBaseContext(campaign: any): string {
  const parts: string[] = [];

  parts.push(`CAMPAIGN: ${campaign.name}`);

  if (campaign.campaignObjective) {
    parts.push(`\nOBJECTIVE (Internal - Do NOT share with prospect):\n${campaign.campaignObjective}`);
  }

  if (campaign.productServiceInfo) {
    parts.push(`\nPRODUCT/SERVICE:\n${campaign.productServiceInfo}`);
  }

  if (campaign.targetAudienceDescription) {
    parts.push(`\nTARGET AUDIENCE:\n${campaign.targetAudienceDescription}`);
  }

  if (campaign.talkingPoints && Array.isArray(campaign.talkingPoints)) {
    parts.push(`\nKEY TALKING POINTS:\n${campaign.talkingPoints.map((tp: string) => `- ${tp}`).join('\n')}`);
  }

  if (campaign.campaignObjections && Array.isArray(campaign.campaignObjections)) {
    parts.push(`\nOBJECTION HANDLING:`);
    for (const obj of campaign.campaignObjections) {
      parts.push(`\nObjection: "${obj.objection}"\nResponse: "${obj.response}"`);
    }
  }

  if (campaign.successCriteria) {
    parts.push(`\nSUCCESS CRITERIA:\n${campaign.successCriteria}`);
  }

  if (campaign.campaignContextBrief) {
    parts.push(`\nCONTEXT BRIEF:\n${campaign.campaignContextBrief}`);
  }

  return parts.join('\n');
}

/**
 * Build channel-specific instructions.
 */
function buildChannelInstructions(channelType: ChannelType, variant: any): string {
  if (channelType === 'voice') {
    return buildVoiceInstructions(variant);
  } else {
    return buildEmailInstructions(variant);
  }
}

/**
 * Build voice channel instructions.
 */
function buildVoiceInstructions(variant: any): string {
  const settings = variant.channelSettings || {};
  const parts: string[] = [];

  parts.push(`CHANNEL: Voice Call\n`);

  if (settings.persona) {
    parts.push(`AGENT PERSONA:
- Name: ${settings.persona.name || 'Agent'}
- Company: ${settings.persona.companyName || 'Our Company'}
- Role: ${settings.persona.role || 'Business Development'}`);
  }

  parts.push(`\nVOICE SETTINGS:
- Provider: ${settings.voiceProvider || 'google'}
- Voice: ${settings.voice || 'Kore'}
- Max Duration: ${settings.maxCallDurationSeconds || 360} seconds`);

  parts.push(`\nBEHAVIOR GUIDELINES:
1. Always identify yourself clearly after confirming you're speaking with the right person
2. Keep the conversation natural and conversational
3. Listen actively and respond to what the prospect says
4. Never go silent after the prospect confirms their identity
5. If asked "what is this about?" - give a brief value statement immediately
6. Respect time constraints - offer to be brief
7. Handle objections gracefully using the provided responses
8. Always end calls professionally`);

  return parts.join('\n');
}

/**
 * Build email channel instructions.
 */
function buildEmailInstructions(variant: any): string {
  const settings = variant.channelSettings || {};
  const parts: string[] = [];

  parts.push(`CHANNEL: Email\n`);

  parts.push(`EMAIL SETTINGS:
- Tone: ${settings.emailTone || 'professional'}
- Track Opens: ${settings.trackOpens !== false ? 'Yes' : 'No'}
- Track Clicks: ${settings.trackClicks !== false ? 'Yes' : 'No'}`);

  parts.push(`\nEMAIL GUIDELINES:
1. Personalize each email using available merge fields
2. Keep subject lines under 60 characters
3. Avoid spam trigger words (free, guarantee, act now, etc.)
4. Include a clear but not pushy call-to-action
5. Vary the approach across sequence steps
6. Exit the sequence if the prospect replies or unsubscribes
7. Honor all opt-out requests immediately
8. Include proper sender identification`);

  return parts.join('\n');
}

/**
 * Build compliance rules.
 */
function buildComplianceRules(campaign: any, channelType: ChannelType): string {
  const parts: string[] = [];

  parts.push(`COMPLIANCE REQUIREMENTS:`);

  if (channelType === 'voice') {
    parts.push(`
- TCPA: Do not call numbers on the National Do Not Call Registry
- Caller ID: Must display valid callback number
- Time Restrictions: Only call during appropriate business hours
- DNC Requests: Honor do-not-call requests immediately
- Recording Disclosure: Inform if call is being recorded (where required)
- Consent: Obtain explicit consent before sending any materials`);
  } else {
    parts.push(`
- CAN-SPAM: Include valid physical address and unsubscribe link
- GDPR: Honor data subject rights and privacy preferences
- Opt-Out: Process unsubscribe requests within 24 hours
- Identification: Clearly identify the sender
- No Deception: Subject line must accurately reflect content`);
  }

  return parts.join('\n');
}

/**
 * Assemble all components into the final prompt.
 */
function assembleFinalPrompt(
  components: AssembledPromptComponents,
  channelType: ChannelType
): string {
  const sections: string[] = [];

  // Header
  sections.push(`=== EXECUTION PROMPT ===\n`);

  // Base Context
  sections.push(`--- CAMPAIGN CONTEXT ---\n${components.baseContext}\n`);

  // Channel Instructions
  sections.push(`--- ${channelType.toUpperCase()} CHANNEL INSTRUCTIONS ---\n${components.channelInstructions}\n`);

  // Resolved Templates
  sections.push(`--- TEMPLATES ---`);
  if (components.resolvedTemplates.opening) {
    sections.push(`Opening: ${components.resolvedTemplates.opening}`);
  }
  if (components.resolvedTemplates.pitch) {
    sections.push(`Pitch: ${components.resolvedTemplates.pitch}`);
  }
  if (components.resolvedTemplates.closing) {
    sections.push(`Closing: ${components.resolvedTemplates.closing}`);
  }
  if (components.resolvedTemplates.subject) {
    sections.push(`Email Subject: ${components.resolvedTemplates.subject}`);
  }
  if (components.resolvedTemplates.greeting) {
    sections.push(`Email Greeting: ${components.resolvedTemplates.greeting}`);
  }
  if (components.resolvedTemplates.callToAction) {
    sections.push(`Call to Action: ${components.resolvedTemplates.callToAction}`);
  }
  if (components.resolvedTemplates.objectionHandling) {
    sections.push(`\nObjection Responses:`);
    for (const [key, value] of Object.entries(components.resolvedTemplates.objectionHandling)) {
      sections.push(`- ${key}: ${value}`);
    }
  }
  sections.push('');

  // Email Sequence (Email only)
  if (channelType === 'email' && components.emailSequence) {
    sections.push(`--- EMAIL SEQUENCE ---`);
    sections.push(`Timing: ${components.emailSequence.defaultTiming}`);
    sections.push(`Exit Conditions: ${components.emailSequence.exitConditions?.join(', ')}`);
    sections.push(`Emails:`);
    for (const step of components.emailSequence.steps) {
      sections.push(`\n[${step.id}] ${step.name} (Day ${step.delayDays})`);
      sections.push(`Type: ${step.type}, Tone: ${step.tone}`);
      sections.push(`Subject: ${step.subject}`);
    }
    sections.push('');
  }

  // Compliance Rules
  sections.push(`--- COMPLIANCE ---\n${components.complianceRules}\n`);

  // Footer
  sections.push(`=== END PROMPT ===`);

  return sections.join('\n');
}

// ============================================================
// CACHING
// ============================================================

/**
 * Generate a hash for the prompt content.
 */
function generatePromptHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 64);
}

/**
 * Get cached prompt if it exists and is still valid.
 */
async function getCachedPrompt(
  campaignId: string,
  channelType: ChannelType,
  accountId?: string,
  contactId?: string
): Promise<AssembledPrompt | null> {
  const record = await getExistingPromptRecord(campaignId, channelType, accountId, contactId);

  if (!record) {
    return null;
  }

  // Reconstruct the AssembledPrompt from the cached record
  return {
    finalPrompt: record.finalPrompt,
    components: {
      baseContext: record.basePrompt,
      channelInstructions: record.channelAdditions || '',
      resolvedTemplates: (record.templateInsertions as unknown as ResolvedTemplates) || { resolutionLog: [] },
      complianceRules: record.complianceAdditions || '',
    },
    promptHash: record.promptHash,
    version: record.version || 1,
    contextVersion: record.contextVersion || undefined,
  };
}

/**
 * Get existing prompt record from database.
 */
async function getExistingPromptRecord(
  campaignId: string,
  channelType: ChannelType,
  accountId?: string,
  contactId?: string
): Promise<CampaignExecutionPrompt | null> {
  // Build the where clause based on nullable values
  const [record] = await db
    .select()
    .from(campaignExecutionPrompts)
    .where(
      and(
        eq(campaignExecutionPrompts.campaignId, campaignId),
        eq(campaignExecutionPrompts.channelType, channelType),
        accountId
          ? eq(campaignExecutionPrompts.accountId, accountId)
          : eq(campaignExecutionPrompts.accountId, campaignExecutionPrompts.accountId), // No filter if null
        contactId
          ? eq(campaignExecutionPrompts.contactId, contactId)
          : eq(campaignExecutionPrompts.contactId, campaignExecutionPrompts.contactId) // No filter if null
      )
    )
    .limit(1);

  return (record as unknown) as CampaignExecutionPrompt | null;
}

/**
 * Cache the assembled prompt.
 */
async function cachePrompt(params: {
  campaignId: string;
  channelType: ChannelType;
  accountId?: string;
  contactId?: string;
  components: AssembledPromptComponents;
  finalPrompt: string;
  promptHash: string;
  version: number;
}): Promise<void> {
  const existing = await getExistingPromptRecord(
    params.campaignId,
    params.channelType,
    params.accountId,
    params.contactId
  );

  const data = {
    campaignId: params.campaignId,
    channelType: params.channelType,
    accountId: params.accountId || null,
    contactId: params.contactId || null,
    basePrompt: params.components.baseContext,
    channelAdditions: params.components.channelInstructions,
    templateInsertions: params.components.resolvedTemplates,
    complianceAdditions: params.components.complianceRules,
    finalPrompt: params.finalPrompt,
    promptHash: params.promptHash,
    version: params.version,
    createdAt: new Date(),
  };

  if (existing) {
    await db
      .update(campaignExecutionPrompts)
      .set(data)
      .where(eq(campaignExecutionPrompts.id, existing.id));
  } else {
    await db.insert(campaignExecutionPrompts).values(data);
  }
}

/**
 * Invalidate cached prompts for a campaign.
 */
export async function invalidateCachedPrompts(
  campaignId: string,
  channelType?: ChannelType
): Promise<void> {
  if (channelType) {
    await db
      .delete(campaignExecutionPrompts)
      .where(
        and(
          eq(campaignExecutionPrompts.campaignId, campaignId),
          eq(campaignExecutionPrompts.channelType, channelType)
        )
      );
  } else {
    await db
      .delete(campaignExecutionPrompts)
      .where(eq(campaignExecutionPrompts.campaignId, campaignId));
  }
}

/**
 * Invalidate cached prompts for a specific account.
 */
export async function invalidateAccountPrompts(
  campaignId: string,
  accountId: string
): Promise<void> {
  await db
    .delete(campaignExecutionPrompts)
    .where(
      and(
        eq(campaignExecutionPrompts.campaignId, campaignId),
        eq(campaignExecutionPrompts.accountId, accountId)
      )
    );
}

/**
 * Invalidate cached prompts for a specific contact.
 */
export async function invalidateContactPrompts(
  campaignId: string,
  contactId: string
): Promise<void> {
  await db
    .delete(campaignExecutionPrompts)
    .where(
      and(
        eq(campaignExecutionPrompts.campaignId, campaignId),
        eq(campaignExecutionPrompts.contactId, contactId)
      )
    );
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get prompt statistics for a campaign.
 */
export async function getPromptStats(campaignId: string): Promise<{
  totalCached: number;
  byChannel: Record<string, number>;
  lastGenerated: Date | null;
}> {
  const prompts = await db
    .select()
    .from(campaignExecutionPrompts)
    .where(eq(campaignExecutionPrompts.campaignId, campaignId));

  const byChannel: Record<string, number> = {};
  let lastGenerated: Date | null = null;

  for (const prompt of prompts) {
    const channel = prompt.channelType;
    byChannel[channel] = (byChannel[channel] || 0) + 1;

    if (!lastGenerated || prompt.createdAt > lastGenerated) {
      lastGenerated = prompt.createdAt;
    }
  }

  return {
    totalCached: prompts.length,
    byChannel,
    lastGenerated,
  };
}
