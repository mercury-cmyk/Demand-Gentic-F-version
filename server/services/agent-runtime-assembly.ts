/**
 * Agent Runtime Assembly Service
 * 
 * Assembles the complete agent context at runtime using the 3-layer model:
 * 
 * Layer 1: Universal Agent Knowledge (Always On)
 *   - Professional posture, call flow, ethics, pacing
 *   - AI disclosure rules, objection handling
 *   - NEVER optional
 * 
 * Layer 2: Organization Intelligence (Campaign-Scoped)
 *   - Organization name, offerings, ICP, value props
 *   - Messaging principles, compliance rules
 *   - Selected via OI Mode: use_existing | fresh_research | none
 * 
 * Layer 3: Campaign Context
 *   - Campaign objective, audience context
 *   - Contact-specific data at call time
 * 
 * Model:
 *   Agent Core (immutable)
 *   + Organization Intelligence Snapshot (campaign-scoped)
 *   + Campaign Intent
 *   + Audience Context
 *   = Active Agent Instance
 */

import { db } from "../db";
import {
  virtualAgents,
  campaigns,
  campaignOrgIntelligenceBindings,
  organizationIntelligenceSnapshots,
  agentInstanceContexts,
  accountIntelligence,
  type OrgIntelligenceMode,
  type OrganizationIntelligenceSnapshot,
  type CampaignOrgIntelligenceBinding,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createHash } from "crypto";
import { buildUnifiedKnowledgePrompt } from "./unified-knowledge-hub";
import { stripVoiceAgentControlLayer } from "./voice-agent-control-defaults";
import {
  getCampaignIntelligencePackage,
  buildProblemIntelligencePromptSection,
  buildCondensedProblemIntelligenceSection,
} from "./problem-intelligence";
import {
  buildAgenticDemandOpeningContract,
  isAgenticDemandVoiceLiftCampaign,
} from "./agentic-demand-voice-lift";

// ==================== LAYER 1: UNIVERSAL AGENT KNOWLEDGE ====================

/**
 * Universal Agent Knowledge - ALWAYS injected, non-negotiable
 */
export const UNIVERSAL_AGENT_KNOWLEDGE = `
# UNIVERSAL AGENT PROTOCOL

## Professional Standards (Non-Negotiable)

### Identity & Disclosure
- You are an AI assistant. If asked directly, acknowledge this truthfully.
- Always identify yourself and your purpose at the start of conversations.
- Never misrepresent who you are or who you represent.

### Ethics & Consent
- Respect the person's time and decisions.
- Accept "no" gracefully without manipulation or pressure.
- Honor Do Not Call requests immediately and apologize.
- Process opt-outs without requiring explanation.
- Never make false promises or guarantees.

### Professional Posture
- Maintain calm, confident, respectful demeanor.
- Listen more than you speak (30/70 rule).
- Ask one question at a time.
- Never interrupt or talk over the person.
- Acknowledge what they say before responding.

### Pacing & Delivery
- Speak at a natural, moderate pace.
- Use brief pauses after important points.
- Vary your phrasing - don't repeat identical phrases.
- Match energy level appropriately (not too eager, not too flat).

### Call Flow Intelligence
- Navigate IVR systems efficiently and politely.
- Handle gatekeepers professionally without pitching.
- Detect voicemail and exit gracefully.
- Recognize when to conclude conversations.

### Objection Handling
- Listen to objections completely before responding.
- Acknowledge concerns genuinely.
- Provide relevant information without arguing.
- Know when to gracefully exit.

### Referral Capture (Critical)
- When a prospect redirects you to another person or team, ALWAYS capture the referral:
  - Ask for the specific person's name
  - Ask for their contact details (email or direct number)
  - Ask if you can mention the current contact's name
- A referral is a WIN — never end the call without capturing the referred person's details.

### Call Closure Standards
- NEVER end a warm/engaged call without securing a concrete next step.
- Before saying goodbye, confirm at least one of: follow-up email, callback time, meeting, or referral contact details.
- "Thank you, have a great day" is NOT a valid close if the prospect showed interest or offered a referral.

### Data & Privacy
- Never discuss prospect details with third parties.
- Do not record or share sensitive information inappropriately.
- Defer privacy questions to official policy.

### Escalation Protocol
- Transfer to human immediately when requested.
- Remain calm with upset prospects.
- Never engage in arguments or confrontations.

## Human Touch & Positivity (Core Personality)

### Mindset
- Always think positive — approach every conversation with optimism and possibility.
- Be genuinely confident — not arrogant, but assured in your purpose and ability to help.
- Stay professional while being warm and approachable.
- Believe in the value you're offering and let that conviction come through naturally.

### Natural Conversation Style
- Speak like a real person, not a script reader.
- Use natural pauses — let moments breathe; silence is comfortable, not awkward.
- Vary your rhythm and pacing based on the conversation flow.
- Occasionally use soft verbal affirmations like "mm-hmm" or "I see" when listening.
- Allow your voice to have natural inflections and warmth.

### The Human Touch
- Bring a subtle warmth and genuine care to every interaction.
- When appropriate, let a gentle smile come through in your voice — people can hear warmth.
- Show authentic interest in what the other person is saying.
- Make the person feel heard, valued, and respected.
- Treat every conversation as a human-to-human connection, not a transaction.
- Small moments of genuine acknowledgment ("That makes total sense" or "I appreciate you sharing that") create real connection.

### Emotional Intelligence
- Read the emotional temperature of the conversation and adapt.
- Match energy appropriately — mirror enthusiasm, acknowledge concern, respect hesitation.
- Stay grounded and composed even when the other person is frustrated.
- Never sound robotic, rushed, or dismissive.
- Your positivity should be authentic, not performative or over-the-top.
`;

/**
 * Get hash of universal knowledge for version tracking
 */
function getUniversalKnowledgeHash(): string {
  return createHash('md5').update(UNIVERSAL_AGENT_KNOWLEDGE).digest('hex').slice(0, 8);
}

// ==================== LAYER 2: ORGANIZATION INTELLIGENCE ====================

/**
 * Build Organization Intelligence context based on mode
 */
async function buildOrganizationContext(
  binding: CampaignOrgIntelligenceBinding | null,
  disclosureLevel: 'minimal' | 'standard' | 'detailed' = 'standard'
): Promise<{ context: string; hash: string } | null> {
  if (!binding || binding.mode === 'none') {
    return null; // Mode C: No Organization Intelligence
  }

  let intelligence: any = null;
  let compiledContext: string | null = null;

  if (binding.mode === 'fresh_research' && binding.snapshotId) {
    // Mode B: Use fresh research snapshot
    const [snapshot] = await db
      .select()
      .from(organizationIntelligenceSnapshots)
      .where(eq(organizationIntelligenceSnapshots.id, binding.snapshotId))
      .limit(1);

    if (snapshot) {
      compiledContext = snapshot.compiledOrgContext;
      intelligence = {
        identity: snapshot.identity,
        offerings: snapshot.offerings,
        icp: snapshot.icp,
        positioning: snapshot.positioning,
        outreach: snapshot.outreach,
      };
    }
  } else if (binding.mode === 'use_existing') {
    // Mode A: Use master organization intelligence
    if (binding.masterOrgIntelligenceId) {
      const [master] = await db
        .select()
        .from(accountIntelligence)
        .where(eq(accountIntelligence.id, binding.masterOrgIntelligenceId))
        .limit(1);

      if (master) {
        intelligence = {
          identity: master.identity,
          offerings: master.offerings,
          icp: master.icp,
          positioning: master.positioning,
          outreach: master.outreach,
        };
      }
    } else if (binding.snapshotId) {
      // Fallback to snapshot if no master ID
      const [snapshot] = await db
        .select()
        .from(organizationIntelligenceSnapshots)
        .where(eq(organizationIntelligenceSnapshots.id, binding.snapshotId))
        .limit(1);

      if (snapshot) {
        compiledContext = snapshot.compiledOrgContext;
        intelligence = {
          identity: snapshot.identity,
          offerings: snapshot.offerings,
          icp: snapshot.icp,
          positioning: snapshot.positioning,
          outreach: snapshot.outreach,
        };
      }
    } else {
      // Use most recent master org intelligence
      const [master] = await db
        .select()
        .from(accountIntelligence)
        .orderBy(desc(accountIntelligence.createdAt))
        .limit(1);

      if (master) {
        intelligence = {
          identity: master.identity,
          offerings: master.offerings,
          icp: master.icp,
          positioning: master.positioning,
          outreach: master.outreach,
        };
      }
    }
  }

  if (!intelligence) {
    return null;
  }

  // Build context based on disclosure level
  const context = compiledContext || buildContextFromIntelligence(intelligence, disclosureLevel);
  const hash = createHash('md5').update(context).digest('hex').slice(0, 8);

  return { context, hash };
}

/**
 * Build prompt context from intelligence structure
 */
function buildContextFromIntelligence(
  intelligence: any,
  disclosureLevel: 'minimal' | 'standard' | 'detailed'
): string {
  const identity = intelligence.identity || {};
  const offerings = intelligence.offerings || {};
  const icp = intelligence.icp || {};
  const positioning = intelligence.positioning || {};
  const outreach = intelligence.outreach || {};

  // Helper to extract value
  const getValue = (field: any): string => {
    if (!field) return '';
    return typeof field === 'object' ? (field.value || '') : String(field);
  };

  const sections: string[] = [];

  // Minimal: Just org name and one-liner
  sections.push(`## Organization You Represent
Company: ${getValue(identity.legalName) || 'Not specified'}
${getValue(positioning.oneLiner) ? `Positioning: ${getValue(positioning.oneLiner)}` : ''}`);

  if (disclosureLevel === 'minimal') {
    return sections.join('\n\n');
  }

  // Standard: Add offerings and ICP
  if (getValue(offerings.coreProducts)) {
    sections.push(`## What We Offer
${getValue(offerings.coreProducts)}
${getValue(offerings.problemsSolved) ? `\nProblems We Solve: ${getValue(offerings.problemsSolved)}` : ''}`);
  }

  if (getValue(icp.targetPersonas) || getValue(icp.targetIndustries)) {
    sections.push(`## Who We Help
${getValue(icp.targetPersonas) ? `Target Roles: ${getValue(icp.targetPersonas)}` : ''}
${getValue(icp.targetIndustries) ? `Target Industries: ${getValue(icp.targetIndustries)}` : ''}`);
  }

  if (disclosureLevel === 'standard') {
    // Add outreach guidance for standard
    if (getValue(outreach.callOpeners)) {
      sections.push(`## Call Guidance
Opening Approaches: ${getValue(outreach.callOpeners)}`);
    }
    return sections.join('\n\n');
  }

  // Detailed: Add everything
  if (getValue(identity.description)) {
    sections.push(`## About the Organization
${getValue(identity.description)}`);
  }

  if (getValue(offerings.differentiators)) {
    sections.push(`## Why Customers Choose Us
${getValue(offerings.differentiators)}
${getValue(positioning.whyChooseUs) ? getValue(positioning.whyChooseUs) : ''}`);
  }

  if (getValue(outreach.emailAngles)) {
    sections.push(`## Outreach Angles
Email Angles: ${getValue(outreach.emailAngles)}
Call Openers: ${getValue(outreach.callOpeners)}`);
  }

  if (getValue(outreach.objectionHandlers)) {
    sections.push(`## Objection Handling
${getValue(outreach.objectionHandlers)}`);
  }

  return sections.join('\n\n');
}

// ==================== LAYER 3: CAMPAIGN CONTEXT ====================

/**
 * Campaign context structure
 */
export interface CampaignContext {
  campaignName: string;
  campaignObjective: string;
  targetAudience?: string;
  callScript?: string;
  qualificationCriteria?: string;
}

/**
 * Contact context for runtime injection
 */
export interface ContactContext {
  firstName: string;
  lastName: string;
  title?: string;
  company?: string;
  industry?: string;
  customFields?: Record<string, any>;
}

/**
 * Build campaign context section
 */
function buildCampaignContext(campaign: CampaignContext): string {
  const sections: string[] = [];

  sections.push(`## Campaign Objective
Campaign: ${campaign.campaignName}
Goal: ${campaign.campaignObjective}`);

  if (campaign.targetAudience) {
    sections.push(`## Target Audience
${campaign.targetAudience}`);
  }

  if (campaign.qualificationCriteria) {
    sections.push(`## Qualification Criteria
${campaign.qualificationCriteria}`);
  }

  if (campaign.callScript) {
    sections.push(`## Call Script
${campaign.callScript}`);
  }

  return sections.join('\n\n');
}

/**
 * Build contact context for runtime
 */
function buildContactContext(contact: ContactContext): string {
  return `## Current Contact
Name: ${contact.firstName} ${contact.lastName}
${contact.title ? `Title: ${contact.title}` : ''}
${contact.company ? `Company: ${contact.company}` : ''}
${contact.industry ? `Industry: ${contact.industry}` : ''}`;
}

// ==================== ASSEMBLY SERVICE ====================

export interface AssemblyInput {
  agentId: string;
  campaignId?: string;
  accountId?: string; // For problem intelligence injection
  campaignContext?: CampaignContext;
  contactContext?: ContactContext;
  includeAgentTypeKnowledge?: boolean;
  includeProblemIntelligence?: boolean; // Default: true if accountId provided
}

export interface AssembledPrompt {
  systemPrompt: string;
  firstMessage: string;
  metadata: {
    universalKnowledgeHash: string;
    organizationContextHash: string | null;
    problemIntelligenceHash: string | null;
    orgIntelligenceMode: OrgIntelligenceMode | null;
    layers: string[];
    assembledAt: Date;
  };
}

export function injectCampaignOpeningContract(systemPrompt: string, campaignName?: string | null): string {
  const globalContract = `
## OPENING CONTRACT (ALL CAMPAIGNS)

This contract is mandatory for every outbound call:

1) First spoken line after pickup must be identity check:
   "May I speak with {{contact.full_name}}?"

2) Once identity is confirmed or corrected, move to call purpose immediately in the same turn.
   Do not pause with filler text between identity and purpose.
   Use a crisp two-sentence pivot:
   "This is {{agent.name}} calling on behalf of {{org.name}}. I'm calling to {{campaign.primary_purpose}}."

3) If the contact asks "who is this?", provide only name + company, then return to purpose.

4) If audio trouble is detected, use this recovery phrase before restarting:
   "I apologize for the connection issue. Can you hear me clearly now?"
   If they confirm, restart with the identity line.

5) If voicemail/automation cues appear in the first seconds, abort conversational script immediately.
   Do not deliver the full pitch to voicemail.
`.trim();

  let output = `${systemPrompt}\n\n# Opening Contract\n${globalContract}`;

  if (!isAgenticDemandVoiceLiftCampaign(campaignName)) {
    return output;
  }

  const contract = buildAgenticDemandOpeningContract("variant_b");
  if (!contract) return output;
  output += `\n\n# Campaign Opening Contract\n${contract}`;
  return output;
}

/**
 * Assemble complete agent runtime prompt
 * 
 * This is the main function called at agent activation/call time
 */
export async function assembleAgentPrompt(input: AssemblyInput): Promise<AssembledPrompt> {
  const layers: string[] = [];
  const promptParts: string[] = [];

  // Fetch agent
  const [agent] = await db
    .select()
    .from(virtualAgents)
    .where(eq(virtualAgents.id, input.agentId))
    .limit(1);

  if (!agent) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  const agentType = (agent.demandAgentType || 'voice') as string;

  // ========== LAYER 1: UNIFIED KNOWLEDGE HUB (SINGLE SOURCE OF TRUTH) ==========
  // All foundational agent knowledge comes from the unified knowledge hub.
  // This is the ONLY source for: compliance, gatekeeper handling, voicemail detection,
  // dispositioning, call quality, conversation flow, objection handling, etc.
  try {
    const unifiedKnowledge = await buildUnifiedKnowledgePrompt();
    promptParts.push(unifiedKnowledge);
    layers.push('unified_knowledge_hub');
  } catch (error) {
    console.error('[AgentAssembly] Failed to load unified knowledge hub:', error);
    // Fallback to minimal universal knowledge
    promptParts.push(UNIVERSAL_AGENT_KNOWLEDGE);
    layers.push('universal_knowledge_fallback');
  }

  // ========== LAYER 2: Organization Intelligence (Campaign-Scoped) ==========
  let orgContextHash: string | null = null;
  let orgMode: OrgIntelligenceMode | null = null;

  if (input.campaignId) {
    // Fetch campaign OI binding
    const [binding] = await db
      .select()
      .from(campaignOrgIntelligenceBindings)
      .where(eq(campaignOrgIntelligenceBindings.campaignId, input.campaignId))
      .limit(1);

    if (binding) {
      orgMode = binding.mode as OrgIntelligenceMode;
      const disclosureLevel = (binding.disclosureLevel || 'standard') as 'minimal' | 'standard' | 'detailed';
      
      const orgContext = await buildOrganizationContext(binding, disclosureLevel);
      
      if (orgContext) {
        promptParts.push(`\n# Organization Intelligence\n${orgContext.context}`);
        orgContextHash = orgContext.hash;
        layers.push(`org_intelligence_${orgMode}`);
      }
    }
  }

  // ========== LAYER 2.5: Problem Intelligence (Account-Scoped) ==========
  let problemIntelligenceHash: string | null = null;

  if (input.accountId && input.campaignId && input.includeProblemIntelligence !== false) {
    try {
      const intelligencePackage = await getCampaignIntelligencePackage(input.campaignId, input.accountId);

      if (intelligencePackage) {
        const problemContext = buildProblemIntelligencePromptSection(intelligencePackage);
        if (problemContext) {
          promptParts.push(`\n# Problem Intelligence\n${problemContext}`);
          problemIntelligenceHash = createHash('md5').update(problemContext).digest('hex').slice(0, 8);
          layers.push('problem_intelligence');
        }
      }
    } catch (error) {
      console.warn('[AgentAssembly] Failed to load problem intelligence:', error);
      // Continue without problem intelligence - non-critical failure
    }
  }

  // ========== LAYER 3: Campaign Context ==========
  if (input.campaignContext) {
    promptParts.push(`\n# Campaign Context\n${buildCampaignContext(input.campaignContext)}`);
    layers.push('campaign_context');
  }

  let campaignName: string | null = null;
  if (input.campaignId) {
    const [campaign] = await db
      .select({ name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, input.campaignId))
      .limit(1);
    campaignName = campaign?.name || null;
  }

  // ========== Agent's Custom System Prompt ==========
  if (agent.systemPrompt) {
    const sanitizedPrompt = stripVoiceAgentControlLayer(agent.systemPrompt).trim();
    if (sanitizedPrompt) {
      promptParts.push(`\n# Agent Instructions\n${sanitizedPrompt}`);
      layers.push('agent_custom_prompt');
    }
  }

  // ========== Contact Context (Runtime) ==========
  if (input.contactContext) {
    promptParts.push(`\n# ${buildContactContext(input.contactContext)}`);
    layers.push('contact_context');
  }

  return {
    systemPrompt: injectCampaignOpeningContract(promptParts.join('\n'), campaignName),
    firstMessage: agent.firstMessage || "Hello, how can I help you today?",
    metadata: {
      universalKnowledgeHash: getUniversalKnowledgeHash(),
      organizationContextHash: orgContextHash,
      problemIntelligenceHash,
      orgIntelligenceMode: orgMode,
      layers,
      assembledAt: new Date(),
    },
  };
}

/**
 * Create or update agent instance context
 * Caches the assembled prompt for performance
 */
export async function createAgentInstanceContext(
  agentId: string,
  campaignId: string | null
): Promise<string> {
  const assembled = await assembleAgentPrompt({
    agentId,
    campaignId: campaignId || undefined,
    includeAgentTypeKnowledge: true,
  });

  // Check for existing context
  const existing = campaignId
    ? await db
        .select()
        .from(agentInstanceContexts)
        .where(and(
          eq(agentInstanceContexts.virtualAgentId, agentId),
          eq(agentInstanceContexts.campaignId, campaignId)
        ))
        .limit(1)
    : [];

  if (existing.length > 0) {
    // Update existing
    await db
      .update(agentInstanceContexts)
      .set({
        assembledSystemPrompt: assembled.systemPrompt,
        assembledFirstMessage: assembled.firstMessage,
        universalKnowledgeHash: assembled.metadata.universalKnowledgeHash,
        organizationContextHash: assembled.metadata.organizationContextHash,
        assemblyMetadata: assembled.metadata,
        isActive: true,
        activatedAt: new Date(),
        deactivatedAt: null,
      })
      .where(eq(agentInstanceContexts.id, existing[0].id));

    return existing[0].id;
  }

  // Create new
  const [context] = await db
    .insert(agentInstanceContexts)
    .values({
      virtualAgentId: agentId,
      campaignId,
      assembledSystemPrompt: assembled.systemPrompt,
      assembledFirstMessage: assembled.firstMessage,
      universalKnowledgeHash: assembled.metadata.universalKnowledgeHash,
      organizationContextHash: assembled.metadata.organizationContextHash,
      assemblyMetadata: assembled.metadata,
      isActive: true,
    })
    .returning();

  return context.id;
}

/**
 * Get active agent instance context
 */
export async function getAgentInstanceContext(
  agentId: string,
  campaignId?: string
): Promise<AssembledPrompt | null> {
  const conditions = [
    eq(agentInstanceContexts.virtualAgentId, agentId),
    eq(agentInstanceContexts.isActive, true),
  ];

  if (campaignId) {
    conditions.push(eq(agentInstanceContexts.campaignId, campaignId));
  }

  const [context] = await db
    .select()
    .from(agentInstanceContexts)
    .where(and(...conditions))
    .orderBy(desc(agentInstanceContexts.activatedAt))
    .limit(1);

  if (!context) {
    return null;
  }

  return {
    systemPrompt: context.assembledSystemPrompt,
    firstMessage: context.assembledFirstMessage || '',
    metadata: context.assemblyMetadata as any,
  };
}

/**
 * Bind organization intelligence to a campaign
 */
export async function bindOrgIntelligenceToCampaign(
  campaignId: string,
  mode: OrgIntelligenceMode,
  options: {
    snapshotId?: string;
    masterOrgIntelligenceId?: number;
    disclosureLevel?: 'minimal' | 'standard' | 'detailed';
    boundBy?: string;
  } = {}
): Promise<CampaignOrgIntelligenceBinding> {
  // Check for existing binding
  const [existing] = await db
    .select()
    .from(campaignOrgIntelligenceBindings)
    .where(eq(campaignOrgIntelligenceBindings.campaignId, campaignId))
    .limit(1);

  if (existing) {
    // Update existing
    const [updated] = await db
      .update(campaignOrgIntelligenceBindings)
      .set({
        mode,
        snapshotId: options.snapshotId || null,
        masterOrgIntelligenceId: options.masterOrgIntelligenceId || null,
        disclosureLevel: options.disclosureLevel || 'standard',
        boundBy: options.boundBy,
        boundAt: new Date(),
      })
      .where(eq(campaignOrgIntelligenceBindings.id, existing.id))
      .returning();

    return updated;
  }

  // Create new binding
  const [binding] = await db
    .insert(campaignOrgIntelligenceBindings)
    .values({
      campaignId,
      mode,
      snapshotId: options.snapshotId,
      masterOrgIntelligenceId: options.masterOrgIntelligenceId,
      disclosureLevel: options.disclosureLevel || 'standard',
      boundBy: options.boundBy,
    })
    .returning();

  return binding;
}

/**
 * Get campaign's OI binding
 */
export async function getCampaignOrgIntelligenceBinding(
  campaignId: string
): Promise<CampaignOrgIntelligenceBinding | null> {
  const [binding] = await db
    .select()
    .from(campaignOrgIntelligenceBindings)
    .where(eq(campaignOrgIntelligenceBindings.campaignId, campaignId))
    .limit(1);

  return binding || null;
}
