/**
 * Vertex AI Prompt Refinement Service
 *
 * ALL final prompts for voice agents MUST be refined through this service
 * before runtime deployment. This ensures:
 *
 * 1. Gemini Voice Optimization - Prompts are tuned for natural speech patterns
 * 2. Campaign Compliance - Guidelines and brand voice are enforced
 * 3. Context Integration - Account and contact intelligence is properly merged
 * 4. Safety Checks - Harmful or inappropriate content is filtered
 * 5. Performance Optimization - Prompts are structured for low latency
 *
 * MANDATORY: No voice agent should receive an unrefined prompt.
 */

import { generateJSON, reason } from "./vertex-client";
import { db } from "../../db";
import { campaigns, accounts, contacts, virtualAgents } from "@shared/schema";
import { eq } from "drizzle-orm";

// ==================== TYPES ====================

export interface PromptRefinementRequest {
  promptType: "campaign" | "account" | "contact" | "combined";
  basePrompt: string;
  context: PromptContext;
  refinementOptions?: RefinementOptions;
}

export interface PromptContext {
  // Campaign context
  campaignId?: string;
  campaignType?: string;
  campaignObjective?: string;
  campaignGuidelines?: string[];

  // Account context
  accountId?: string;
  accountName?: string;
  accountIndustry?: string;
  accountSize?: string;
  accountIntelligence?: Record<string, any>;

  // Contact context
  contactId?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactTitle?: string;
  contactPersonality?: string;
  previousInteractions?: string[];

  // Voice agent context
  agentPersona?: {
    name: string;
    role: string;
    company: string;
    tone: string;
  };

  // Additional context
  valueProposition?: string;
  targetPainPoints?: string[];
  competitorMentions?: string[];
  callObjective?: string;
}

export interface RefinementOptions {
  voiceProvider: "gemini" | "openai" | "elevenlabs";
  voiceName?: string;
  language?: string;
  targetDuration?: number; // seconds
  maxResponseLength?: number; // words
  emotionalTone?: "professional" | "friendly" | "urgent" | "consultative" | "empathetic";
  pacePreference?: "slow" | "normal" | "fast";
  includeFillerWords?: boolean;
  enforceBrandVoice?: boolean;
  complianceLevel?: "strict" | "moderate" | "flexible";
}

export interface RefinedPrompt {
  refinedPrompt: string;
  systemInstructions: string;
  voiceDirectives: VoiceDirectives;
  qualityScore: number;
  refinementNotes: string[];
  warnings: string[];
  optimizations: string[];
  metadata: {
    refinedAt: Date;
    refinementVersion: string;
    promptHash: string;
    estimatedTokens: number;
  };
}

export interface VoiceDirectives {
  speakingRate: number; // 0.5 to 2.0
  pitch: number; // -20 to 20 semitones
  volumeGain: number; // -96 to 16 dB
  pauseBeforeResponse: number; // ms
  emphasisWords: string[];
  avoidWords: string[];
  pronunciationGuide: Record<string, string>;
}

// ==================== GEMINI VOICE GUIDELINES ====================

export const GEMINI_VOICE_GUIDELINES = `
# GEMINI LIVE VOICE OPTIMIZATION GUIDELINES

## SPEECH PATTERNS
1. Use natural conversational language - avoid written-style prose
2. Keep sentences short (10-15 words max) for natural breath patterns
3. Use contractions (I'm, you're, we'll) for conversational flow
4. Include appropriate discourse markers (Well, So, Actually, You know)
5. Avoid complex nested clauses - break into simple statements

## RESPONSE STRUCTURE
1. Lead with the most important information
2. Use verbal signposting ("First...", "The key thing is...", "Here's what matters...")
3. End statements with falling intonation cues (periods, not ellipses)
4. Include natural pause points with commas and periods
5. Avoid bullet points - convert to flowing speech

## PHRASING FOR SPEECH
1. Replace "utilize" with "use"
2. Replace "implement" with "set up" or "put in place"
3. Replace "leverage" with "use" or "take advantage of"
4. Replace "synergy" with specific benefits
5. Avoid acronyms unless commonly spoken (say "return on investment" not "ROI" first time)

## EMOTIONAL CUES
1. Include empathy markers ("I understand", "That makes sense")
2. Use confidence language ("Absolutely", "Definitely", "Of course")
3. Acknowledge prospect responses ("Great question", "I hear you")
4. Show enthusiasm naturally ("This is exciting because...")

## OBJECTION HANDLING
1. Always acknowledge before responding ("I get that concern...")
2. Bridge with "and" not "but" (positive framing)
3. Provide specific evidence, not generalities
4. End with a forward-moving question

## PROHIBITED PATTERNS
1. NO robotic greetings ("Greetings and salutations")
2. NO excessive formality ("I would be delighted to...")
3. NO written abbreviations in speech (e.g., vs., etc., i.e.)
4. NO complex jargon without explanation
5. NO more than 3 consecutive sentences without a pause/question
6. NO assumptions about prospect responses
`;

export const COMPLIANCE_RULES = `
# COMPLIANCE AND SAFETY RULES

## MANDATORY DISCLOSURES
1. Agent must identify themselves and company within first 30 seconds
2. Must not misrepresent AI as human if directly asked
3. Must respect "not interested" or "do not call" requests immediately

## PROHIBITED CONTENT
1. NO false claims or guarantees
2. NO pressure tactics or artificial urgency
3. NO competitor disparagement
4. NO personal data requests beyond business context
5. NO discriminatory language or assumptions

## BRAND PROTECTION
1. Stay within approved messaging framework
2. Do not make commitments outside authority
3. Escalate complex requests appropriately
4. Maintain professional tone even if prospect is hostile
`;

// ==================== PROMPT REFINER CLASS ====================

export class VertexPromptRefiner {
  private static instance: VertexPromptRefiner | null = null;
  private refinementCache: Map<string, RefinedPrompt> = new Map();
  private cacheTimeout: number = 30 * 60 * 1000; // 30 minutes

  private constructor() {}

  static getInstance(): VertexPromptRefiner {
    if (!VertexPromptRefiner.instance) {
      VertexPromptRefiner.instance = new VertexPromptRefiner();
    }
    return VertexPromptRefiner.instance;
  }

  /**
   * MAIN ENTRY POINT: Refine any prompt through Vertex AI
   * This MUST be called before deploying any prompt to voice agents
   */
  async refinePrompt(request: PromptRefinementRequest): Promise<RefinedPrompt> {
    const cacheKey = this.generateCacheKey(request);

    // Check cache first
    const cached = this.refinementCache.get(cacheKey);
    if (cached && Date.now() - cached.metadata.refinedAt.getTime() < this.cacheTimeout) {
      console.log(`[PromptRefiner] Using cached refined prompt: ${cacheKey.substring(0, 20)}...`);
      return cached;
    }

    console.log(`[PromptRefiner] Refining ${request.promptType} prompt through Vertex AI...`);

    // Build the refinement prompt
    const refinementPrompt = this.buildRefinementPrompt(request);

    // Use Gemini reasoning model for complex refinement
    const { answer } = await reason(refinementPrompt);

    // Parse the refined result
    let refinedResult: any;
    try {
      refinedResult = JSON.parse(answer);
    } catch (e) {
      // If not valid JSON, use generateJSON
      refinedResult = await generateJSON(refinementPrompt, { temperature: 0.3 });
    }

    // Build the final refined prompt object
    const refinedPrompt: RefinedPrompt = {
      refinedPrompt: refinedResult.refinedPrompt || request.basePrompt,
      systemInstructions: refinedResult.systemInstructions || "",
      voiceDirectives: refinedResult.voiceDirectives || this.getDefaultVoiceDirectives(),
      qualityScore: refinedResult.qualityScore || 0,
      refinementNotes: refinedResult.refinementNotes || [],
      warnings: refinedResult.warnings || [],
      optimizations: refinedResult.optimizations || [],
      metadata: {
        refinedAt: new Date(),
        refinementVersion: "1.0.0",
        promptHash: this.hashString(request.basePrompt),
        estimatedTokens: Math.ceil(refinedResult.refinedPrompt?.length / 4) || 0,
      },
    };

    // Validate and apply final checks
    const validated = await this.validateRefinedPrompt(refinedPrompt, request);

    // Cache the result
    this.refinementCache.set(cacheKey, validated);

    console.log(`[PromptRefiner] Prompt refined. Quality score: ${validated.qualityScore}/100`);

    return validated;
  }

  /**
   * Build the refinement prompt for Vertex AI
   */
  private buildRefinementPrompt(request: PromptRefinementRequest): string {
    const options: RefinementOptions = request.refinementOptions || {
      voiceProvider: "gemini",
      emotionalTone: "professional",
      pacePreference: "normal",
      complianceLevel: "strict",
    };

    return `You are an expert AI Prompt Engineer specializing in voice agent optimization for Gemini Live.

YOUR TASK: Refine the following prompt to be optimized for real-time voice conversations.

${GEMINI_VOICE_GUIDELINES}

${COMPLIANCE_RULES}

=== ORIGINAL PROMPT TO REFINE ===
${request.basePrompt}

=== CONTEXT ===
Prompt Type: ${request.promptType}
Voice Provider: ${options.voiceProvider || "gemini"}
Voice Name: ${options.voiceName || "Kore"}
Emotional Tone: ${options.emotionalTone || "professional"}
Pace: ${options.pacePreference || "normal"}
Compliance Level: ${options.complianceLevel || "strict"}

${request.context.campaignId ? `Campaign ID: ${request.context.campaignId}` : ""}
${request.context.campaignType ? `Campaign Type: ${request.context.campaignType}` : ""}
${request.context.campaignObjective ? `Campaign Objective: ${request.context.campaignObjective}` : ""}

${request.context.accountName ? `Account: ${request.context.accountName}` : ""}
${request.context.accountIndustry ? `Industry: ${request.context.accountIndustry}` : ""}

${request.context.contactFirstName ? `Contact: ${request.context.contactFirstName} ${request.context.contactLastName || ""}` : ""}
${request.context.contactTitle ? `Title: ${request.context.contactTitle}` : ""}

${request.context.agentPersona ? `
Agent Persona:
- Name: ${request.context.agentPersona.name}
- Role: ${request.context.agentPersona.role}
- Company: ${request.context.agentPersona.company}
- Tone: ${request.context.agentPersona.tone}
` : ""}

${request.context.valueProposition ? `Value Proposition: ${request.context.valueProposition}` : ""}
${request.context.targetPainPoints?.length ? `Target Pain Points: ${request.context.targetPainPoints.join(", ")}` : ""}
${request.context.callObjective ? `Call Objective: ${request.context.callObjective}` : ""}

=== REFINEMENT REQUIREMENTS ===

1. VOICE OPTIMIZATION
   - Rewrite for natural spoken delivery
   - Ensure sentences are short and clear
   - Add appropriate discourse markers
   - Include emotional cues where appropriate
   - Add pause points for natural rhythm

2. CONTEXT INTEGRATION
   - Seamlessly incorporate all provided context
   - Personalize for the specific account/contact
   - Align with campaign objectives
   - Reference relevant pain points naturally

3. COMPLIANCE CHECK
   - Verify all compliance rules are followed
   - Flag any potential issues
   - Ensure proper disclosures are included

4. QUALITY SCORING
   - Score the refined prompt 0-100
   - Identify specific improvements made
   - Note any warnings or concerns

Return your response as JSON:
{
  "refinedPrompt": "The fully refined prompt optimized for Gemini voice",
  "systemInstructions": "Additional system-level instructions for the voice agent",
  "voiceDirectives": {
    "speakingRate": 1.0,
    "pitch": 0,
    "volumeGain": 0,
    "pauseBeforeResponse": 500,
    "emphasisWords": ["key", "important", "benefit"],
    "avoidWords": ["utilize", "leverage", "synergy"],
    "pronunciationGuide": {"API": "A-P-I", "ROI": "return on investment"}
  },
  "qualityScore": 85,
  "refinementNotes": [
    "Converted formal language to conversational",
    "Added empathy markers",
    "Shortened average sentence length"
  ],
  "warnings": [
    "Consider adding company disclosure earlier"
  ],
  "optimizations": [
    "Restructured opening for faster engagement",
    "Added natural pause points"
  ]
}`;
  }

  /**
   * Validate the refined prompt meets quality standards
   */
  private async validateRefinedPrompt(
    refined: RefinedPrompt,
    request: PromptRefinementRequest
  ): Promise<RefinedPrompt> {
    // Check for common issues
    const warnings: string[] = [...refined.warnings];

    // Check prompt length
    if (refined.refinedPrompt.length > 10000) {
      warnings.push("Prompt is very long - consider condensing for faster processing");
    }

    // Check for prohibited patterns
    const prohibitedPatterns = [
      /guarantee[ds]?\s+(success|results|outcomes)/i,
      /100%\s+(guaranteed|certain|sure)/i,
      /act now or/i,
      /limited time only/i,
    ];

    for (const pattern of prohibitedPatterns) {
      if (pattern.test(refined.refinedPrompt)) {
        warnings.push(`Prohibited pattern detected: ${pattern.toString()}`);
        refined.qualityScore = Math.max(0, refined.qualityScore - 10);
      }
    }

    // Check for required elements based on compliance level
    const complianceLevel = request.refinementOptions?.complianceLevel || "strict";

    if (complianceLevel === "strict") {
      // Must have agent identification
      if (!refined.refinedPrompt.toLowerCase().includes("my name is") &&
          !refined.refinedPrompt.toLowerCase().includes("i'm calling from") &&
          !refined.systemInstructions.toLowerCase().includes("identify yourself")) {
        warnings.push("Agent identification not found - add self-introduction");
      }
    }

    // Update warnings
    refined.warnings = warnings;

    return refined;
  }

  /**
   * Get default voice directives for Gemini
   */
  private getDefaultVoiceDirectives(): VoiceDirectives {
    return {
      speakingRate: 1.0,
      pitch: 0,
      volumeGain: 0,
      pauseBeforeResponse: 300,
      emphasisWords: [],
      avoidWords: ["utilize", "leverage", "synergize", "paradigm", "bandwidth"],
      pronunciationGuide: {},
    };
  }

  /**
   * Generate cache key for prompt
   */
  private generateCacheKey(request: PromptRefinementRequest): string {
    const keyData = {
      type: request.promptType,
      baseHash: this.hashString(request.basePrompt),
      campaignId: request.context.campaignId,
      accountId: request.context.accountId,
      contactId: request.context.contactId,
    };
    return this.hashString(JSON.stringify(keyData));
  }

  /**
   * Simple string hash
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Clear the refinement cache
   */
  clearCache(): void {
    this.refinementCache.clear();
  }
}

// ==================== SPECIALIZED REFINEMENT FUNCTIONS ====================

/**
 * Refine a campaign-specific prompt
 */
export async function refineCampaignPrompt(
  campaignId: string,
  basePrompt: string,
  options?: RefinementOptions
): Promise<RefinedPrompt> {
  // Fetch campaign data
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);

  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  // Fetch associated virtual agent if exists via aiAgentSettings
  let agentPersona = null;
  const aiAgentSettings = campaign.aiAgentSettings as any;
  if (aiAgentSettings?.virtualAgentId) {
    const [agent] = await db.select().from(virtualAgents).where(eq(virtualAgents.id, aiAgentSettings.virtualAgentId)).limit(1);
    if (agent) {
      agentPersona = {
        name: agent.name,
        role: "Sales Development Representative",
        company: (agent.settings as any)?.persona?.companyName || "Our Company",
        tone: (agent.settings as any)?.persona?.tone || "professional",
      };
    }
  }

  const refiner = VertexPromptRefiner.getInstance();

  return refiner.refinePrompt({
    promptType: "campaign",
    basePrompt,
    context: {
      campaignId,
      campaignType: campaign.type,
      campaignObjective: campaign.targetAudienceDescription || undefined,
      campaignGuidelines: (campaign.aiAgentSettings as any)?.guidelines || [],
      agentPersona: agentPersona || undefined,
    },
    refinementOptions: options,
  });
}

/**
 * Refine an account-specific prompt
 */
export async function refineAccountPrompt(
  accountId: string,
  basePrompt: string,
  campaignId?: string,
  options?: RefinementOptions
): Promise<RefinedPrompt> {
  // Fetch account data
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  // Build account intelligence context using correct schema fields
  const accountIntelligence = {
    size: account.staffCount,
    employeesRange: account.employeesSizeRange,
    revenue: account.revenueRange,
    techStack: account.techStack,
    webTechnologies: account.webTechnologies,
    intentTopics: account.intentTopics,
    aiEnrichment: account.aiEnrichmentData,
  };

  const refiner = VertexPromptRefiner.getInstance();

  return refiner.refinePrompt({
    promptType: "account",
    basePrompt,
    context: {
      campaignId,
      accountId,
      accountName: account.name,
      accountIndustry: account.industryStandardized || account.industryRaw || undefined,
      accountSize: account.staffCount?.toString() || account.employeesSizeRange || undefined,
      accountIntelligence,
    },
    refinementOptions: options,
  });
}

/**
 * Refine a contact-specific prompt
 */
export async function refineContactPrompt(
  contactId: string,
  basePrompt: string,
  campaignId?: string,
  accountId?: string,
  options?: RefinementOptions
): Promise<RefinedPrompt> {
  // Fetch contact data
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);

  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  // Fetch account if not provided
  let account = null;
  const accId = accountId || contact.accountId;
  if (accId) {
    const [acc] = await db.select().from(accounts).where(eq(accounts.id, accId)).limit(1);
    account = acc;
  }

  const refiner = VertexPromptRefiner.getInstance();

  return refiner.refinePrompt({
    promptType: "contact",
    basePrompt,
    context: {
      campaignId,
      accountId: accId ?? undefined,
      accountName: account?.name ?? undefined,
      accountIndustry: account?.industryStandardized ?? account?.industryRaw ?? undefined,
      contactId,
      contactFirstName: contact.firstName ?? undefined,
      contactLastName: contact.lastName ?? undefined,
      contactTitle: contact.jobTitle ?? undefined,
    },
    refinementOptions: options,
  });
}

/**
 * Refine a combined prompt with all context
 * This is the RECOMMENDED method for voice agent deployment
 */
export async function refineCombinedPrompt(
  basePrompt: string,
  context: {
    campaignId?: string;
    accountId?: string;
    contactId?: string;
    agentPersona?: {
      name: string;
      role: string;
      company: string;
      tone: string;
    };
    valueProposition?: string;
    targetPainPoints?: string[];
    callObjective?: string;
  },
  options?: RefinementOptions
): Promise<RefinedPrompt> {
  // Build complete context from IDs
  let campaign = null;
  let account = null;
  let contact = null;

  if (context.campaignId) {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, context.campaignId)).limit(1);
    campaign = c;
  }

  if (context.accountId) {
    const [a] = await db.select().from(accounts).where(eq(accounts.id, context.accountId)).limit(1);
    account = a;
  }

  if (context.contactId) {
    const [ct] = await db.select().from(contacts).where(eq(contacts.id, context.contactId)).limit(1);
    contact = ct;

    // If account not provided, get from contact
    if (!account && ct?.accountId) {
      const [a] = await db.select().from(accounts).where(eq(accounts.id, ct.accountId)).limit(1);
      account = a;
    }
  }

  const refiner = VertexPromptRefiner.getInstance();

  return refiner.refinePrompt({
    promptType: "combined",
    basePrompt,
    context: {
      campaignId: context.campaignId,
      campaignType: campaign?.type ?? undefined,
      campaignObjective: campaign?.targetAudienceDescription ?? undefined,
      accountId: context.accountId ?? account?.id,
      accountName: account?.name ?? undefined,
      accountIndustry: account?.industryStandardized ?? account?.industryRaw ?? undefined,
      accountSize: account?.staffCount?.toString() ?? account?.employeesSizeRange ?? undefined,
      contactId: context.contactId,
      contactFirstName: contact?.firstName ?? undefined,
      contactLastName: contact?.lastName ?? undefined,
      contactTitle: contact?.jobTitle ?? undefined,
      agentPersona: context.agentPersona,
      valueProposition: context.valueProposition,
      targetPainPoints: context.targetPainPoints,
      callObjective: context.callObjective,
    },
    refinementOptions: options,
  });
}

/**
 * Batch refine multiple prompts
 */
export async function refinePromptBatch(
  prompts: Array<{ id: string; basePrompt: string; context: PromptContext }>
): Promise<Map<string, RefinedPrompt>> {
  const refiner = VertexPromptRefiner.getInstance();
  const results = new Map<string, RefinedPrompt>();

  // Process in parallel with concurrency limit
  const concurrency = 3;
  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (p) => {
        const refined = await refiner.refinePrompt({
          promptType: "combined",
          basePrompt: p.basePrompt,
          context: p.context,
        });
        return { id: p.id, refined };
      })
    );

    for (const { id, refined } of batchResults) {
      results.set(id, refined);
    }
  }

  return results;
}

// ==================== SINGLETON EXPORT ====================

export function getPromptRefiner(): VertexPromptRefiner {
  return VertexPromptRefiner.getInstance();
}

export default {
  VertexPromptRefiner,
  getPromptRefiner,
  refineCampaignPrompt,
  refineAccountPrompt,
  refineContactPrompt,
  refineCombinedPrompt,
  refinePromptBatch,
  GEMINI_VOICE_GUIDELINES,
  COMPLIANCE_RULES,
};
