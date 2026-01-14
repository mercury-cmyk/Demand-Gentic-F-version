/**
 * Agent Prompt Visibility Service
 *
 * Provides runtime visibility into prompts used by different agent types:
 * - Email Agents (DeepSeek, OpenAI)
 * - Research Agents (OpenAI, Gemini, Claude)
 *
 * This service allows users to see the exact system prompts and user prompts
 * that will be sent to each AI provider at runtime.
 */

import { db } from "../db";
import { campaigns, accounts, contacts } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  buildAccountContextSection,
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
} from "./account-messaging-service";

// ==================== TYPES ====================

export type EmailAgentProvider = 'deepseek' | 'openai';
export type ResearchAgentProvider = 'openai' | 'gemini' | 'claude' | 'deepseek';
export type VoiceAgentProvider = 'openai' | 'gemini';

export interface AgentPromptPreview {
  provider: string;
  model: string;
  systemPrompt: string;
  userPromptTemplate: string;
  sampleUserPrompt?: string;
  parameters: {
    temperature: number;
    maxTokens: number;
    responseFormat?: string;
  };
  tokenEstimate: number;
  promptHash: string;
  assembledAt: string;
  context?: {
    accountId?: string;
    accountName?: string;
    campaignId?: string;
    campaignName?: string;
  };
}

export interface MultiProviderPromptPreview {
  agentType: 'email' | 'research';
  providers: Record<string, AgentPromptPreview>;
  assembledAt: string;
}

// ==================== HELPERS ====================

function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).length;
  const chars = text.length;
  return Math.ceil(words * 0.75 + chars / 16);
}

function generatePromptHash(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

// ==================== EMAIL AGENT PROMPTS ====================

/**
 * Get DeepSeek email generation system prompt
 */
export function getDeepSeekEmailSystemPrompt(accountContext?: string): string {
  return `You are an expert B2B demand generation strategist and copywriter.
Your task is to generate email content that is:
- Problem-led: Start with a real, account-relevant challenge or friction point.
- Insight-driven: Offer a unique, non-obvious perspective or data point that demonstrates deep understanding of the account's reality.
- Grounded in real demand-gen challenges: Address pipeline gaps, conversion friction, market shifts, or operational realities—never generic or promotional.
- Account-aware and context-driven: Adapt tone, framing, and value to the specific account, referencing industry, recent events, or known pain points wherever possible.
- Never promotional or pitch-oriented: Do NOT mention product features, company superiority, or calls to buy. The goal is to provoke thoughtful consideration and deliver relevance that feels earned.
- Written as if by someone who deeply understands the account's world—clear, reasoned, and unexpectedly insightful.

You will generate content for a structured email template. Keep each section appropriately sized:
- Subject: 40-60 characters, problem/insight-led
- Preheader: 40-100 characters, complements subject with context
- Hero Title: 5-10 words, bold, challenge- or insight-focused
- Hero Subtitle: 15-25 words, expands on the challenge or insight
- Intro: 2-3 sentences, demonstrates understanding of the account's situation and frames the problem
- Value Bullets: 3 points, each a relevant, account-aware insight or consideration (not features or generic benefits)
- CTA Label: 2-4 words, action-oriented but NOT salesy (e.g., 'See Analysis', 'Explore Insight')
- Closing Line: 1 sentence, professional, thoughtful sign-off

${accountContext ? `${accountContext}\n` : ''}

Respond ONLY with valid JSON.`;
}

/**
 * Get DeepSeek email improvement system prompt
 */
export function getDeepSeekEmailImprovementSystemPrompt(accountContext?: string): string {
  return `You are an expert email marketing strategist and copywriter.
Your task is to improve email content while PRESERVING the original:
- HTML structure and layout
- Color scheme and branding
- Template format and sections

Only improve the TEXT CONTENT by making it:
- More compelling and action-oriented
- Better targeted to the audience
- More concise and scannable
- Higher converting with stronger CTAs

${accountContext ? `${accountContext}\n` : ''}

You will analyze the current content and provide improved versions.
Always respond with valid JSON.`;
}

/**
 * Get OpenAI email analysis system prompt
 */
export function getOpenAIEmailAnalysisSystemPrompt(): string {
  return `You are an expert email marketing analyst and copywriter. Analyze the provided email and return a JSON evaluation with these fields:
- overallScore: 0-100 rating of email effectiveness
- tone: Description of the email's tone (e.g., "professional", "friendly", "urgent")
- clarity: 0-100 rating of how clear and understandable the message is
- professionalism: 0-100 rating of professional quality
- sentiment: "positive", "neutral", or "negative"
- suggestions: Array of 3-5 specific, actionable improvements

Focus on business email best practices. Consider subject line effectiveness, call-to-action clarity, and overall messaging impact.

Respond ONLY with valid JSON.`;
}

/**
 * Get OpenAI email rewrite system prompt
 */
export function getOpenAIEmailRewriteSystemPrompt(): string {
  return `You are an expert business email writer. Your task is to rewrite the provided email applying the specified improvements while maintaining the original intent and professional tone.

Guidelines:
- Keep the same overall structure unless specified otherwise
- Improve clarity and readability
- Make the call-to-action more compelling
- Ensure professional tone throughout
- Maintain the sender's voice

Return the improved email as plain text (not JSON).`;
}

/**
 * Get DeepSeek subject variants system prompt
 */
export function getDeepSeekSubjectVariantsSystemPrompt(): string {
  return `You are an email subject line optimization expert.
Generate compelling subject lines that maximize open rates.
Consider different psychological triggers:
- Curiosity
- Urgency
- Value proposition
- Personalization
- Questions
- Numbers/Statistics

Each variant should have a different approach.
Respond only with valid JSON.`;
}

/**
 * Build email agent prompts for all providers
 */
export async function buildEmailAgentPrompts(
  options: {
    accountId?: string;
    campaignId?: string;
    prompt?: string;
    companyName?: string;
    industry?: string;
    targetAudience?: string;
  } = {}
): Promise<MultiProviderPromptPreview> {
  // Build account context if accountId provided
  let accountContext: string | null = null;
  let accountName: string | undefined;
  let campaignName: string | undefined;

  if (options.accountId) {
    try {
      const accountIntelligence = await getOrBuildAccountIntelligence(options.accountId);
      const accountMessagingBrief = await getOrBuildAccountMessagingBrief({
        accountId: options.accountId,
        campaignId: options.campaignId || null,
        intelligenceRecord: accountIntelligence,
      });

      accountContext = buildAccountContextSection(
        accountIntelligence.payloadJson as AccountIntelligencePayload,
        accountMessagingBrief.payloadJson as AccountMessagingBriefPayload
      );

      // Get account name
      const [account] = await db
        .select({ name: accounts.name })
        .from(accounts)
        .where(eq(accounts.id, options.accountId))
        .limit(1);
      accountName = account?.name;
    } catch (err) {
      console.error("[AgentPromptVisibility] Failed to build account context:", err);
    }
  }

  if (options.campaignId) {
    const [campaign] = await db
      .select({ name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, options.campaignId))
      .limit(1);
    campaignName = campaign?.name;
  }

  const now = new Date().toISOString();

  // Build sample user prompt
  const sampleUserPrompt = `Generate compelling email content for the following:

Campaign Request: ${options.prompt || 'B2B lead nurturing email'}
${options.companyName ? `Company: ${options.companyName}` : ''}
${options.industry ? `Industry: ${options.industry}` : ''}
${options.targetAudience ? `Target Audience: ${options.targetAudience}` : ''}
Tone: professional

Generate the email content in this exact JSON format:
{
  "subject": "Your compelling subject line here",
  "preheader": "Preview text that complements the subject",
  "heroTitle": "Bold Main Headline",
  "heroSubtitle": "Supporting message that expands on the headline",
  "intro": "Opening paragraph...",
  "valueBullets": ["First benefit", "Second benefit", "Third benefit"],
  "ctaLabel": "Action Button Text",
  "closingLine": "Professional closing statement."
}`;

  // DeepSeek Email Generation
  const deepseekSystemPrompt = getDeepSeekEmailSystemPrompt(accountContext || undefined);
  const deepseekFullPrompt = `${deepseekSystemPrompt}\n\n${sampleUserPrompt}`;

  // OpenAI Email Analysis
  const openaiAnalysisSystemPrompt = getOpenAIEmailAnalysisSystemPrompt();
  const openaiAnalysisUserPrompt = `Analyze this email:

Subject: [Sample Subject]

Body:
[Sample email content to be analyzed]

Return JSON analysis.`;
  const openaiFullPrompt = `${openaiAnalysisSystemPrompt}\n\n${openaiAnalysisUserPrompt}`;

  const providers: Record<string, AgentPromptPreview> = {
    deepseek: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      systemPrompt: deepseekSystemPrompt,
      userPromptTemplate: `Generate compelling email content for the following:

Campaign Request: {{prompt}}
Company: {{companyName}}
Industry: {{industry}}
Target Audience: {{targetAudience}}
Tone: {{tone}}

Generate the email content in JSON format.`,
      sampleUserPrompt: sampleUserPrompt,
      parameters: {
        temperature: 0.7,
        maxTokens: 1500,
        responseFormat: 'json_object',
      },
      tokenEstimate: estimateTokens(deepseekFullPrompt),
      promptHash: generatePromptHash(deepseekFullPrompt),
      assembledAt: now,
      context: {
        accountId: options.accountId,
        accountName,
        campaignId: options.campaignId,
        campaignName,
      },
    },
    openai: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: openaiAnalysisSystemPrompt,
      userPromptTemplate: `Analyze this email:

Subject: {{subject}}

Body:
{{emailBody}}

Return JSON analysis with scores and suggestions.`,
      sampleUserPrompt: openaiAnalysisUserPrompt,
      parameters: {
        temperature: 0.3,
        maxTokens: 1000,
        responseFormat: 'json_object',
      },
      tokenEstimate: estimateTokens(openaiFullPrompt),
      promptHash: generatePromptHash(openaiFullPrompt),
      assembledAt: now,
      context: {
        accountId: options.accountId,
        accountName,
        campaignId: options.campaignId,
        campaignName,
      },
    },
  };

  return {
    agentType: 'email',
    providers,
    assembledAt: now,
  };
}

// ==================== RESEARCH AGENT PROMPTS ====================

/**
 * Get OpenAI organization research system prompt
 */
export function getOpenAIOrganizationResearchSystemPrompt(): string {
  return `You are an expert B2B intelligence analyst. Analyze the provided website content and extract structured organization intelligence.

Return a JSON object with this exact structure:
{
  "identity": {
    "legalName": {"value": "Company Name Inc.", "confidence": 0.9},
    "description": {"value": "One paragraph description", "confidence": 0.8},
    "industry": {"value": "Industry sector", "confidence": 0.8},
    "foundedYear": {"value": "YYYY", "confidence": 0.7},
    "headquarters": {"value": "City, Country", "confidence": 0.6}
  },
  "offerings": {
    "coreProducts": {"value": "Main products/services", "confidence": 0.8},
    "useCases": {"value": "Key use cases", "confidence": 0.7},
    "problemsSolved": {"value": "Problems they solve", "confidence": 0.7},
    "differentiators": {"value": "What makes them unique", "confidence": 0.6}
  },
  "icp": {
    "targetIndustries": {"value": "Industries they serve", "confidence": 0.7},
    "targetPersonas": {"value": "Job titles/roles they target", "confidence": 0.6},
    "companySize": {"value": "SMB/Mid-Market/Enterprise", "confidence": 0.5},
    "buyingSignals": {"value": "Signs a company might buy", "confidence": 0.5}
  },
  "positioning": {
    "oneLiner": {"value": "One sentence positioning statement", "confidence": 0.8},
    "valueProposition": {"value": "Core value proposition", "confidence": 0.7},
    "competitors": {"value": "Known or implied competitors", "confidence": 0.4},
    "whyChooseUs": {"value": "Reasons to choose them", "confidence": 0.6}
  },
  "outreach": {
    "emailAngles": {"value": "3 email angles that would resonate", "confidence": 0.6},
    "callOpeners": {"value": "2-3 effective call opening lines", "confidence": 0.6},
    "objectionHandlers": {"value": "Common objections and responses", "confidence": 0.5}
  }
}

Use confidence scores 0.0-1.0 based on how clearly the information was stated.
If information is unclear, provide your best inference with lower confidence.
Never leave values empty - provide educated guesses when needed.`;
}

/**
 * Get Gemini reasoning system prompt
 */
export function getGeminiReasoningSystemPrompt(): string {
  return `You are an advanced reasoning agent for B2B demand generation intelligence.

Your task is to perform deep analysis with chain-of-thought reasoning on organization data.

REASONING PROTOCOL:
1. First, wrap your thinking process in <thinking> tags
2. Analyze multiple angles: business model, market position, competitive dynamics
3. Consider confidence levels for each insight
4. Then provide your final answer in <answer> tags

OUTPUT STRUCTURE:
<thinking>
[Your detailed reasoning process here]
</thinking>

<answer>
[Your structured JSON response here]
</answer>

ANALYSIS DIMENSIONS:
- Business model and revenue streams
- Market positioning and differentiation
- Competitive landscape and moat
- Growth vectors and expansion opportunities
- Risk factors and challenges
- Recommended engagement approach`;
}

/**
 * Get Claude multi-model synthesis system prompt
 */
export function getClaudeSynthesisSystemPrompt(): string {
  return `You are a master synthesizer for multi-model B2B intelligence analysis.

Your role is to:
1. Review outputs from multiple AI models (OpenAI, Gemini, DeepSeek)
2. Identify areas of consensus and conflict
3. Resolve conflicts with reasoned judgment
4. Produce a final, authoritative intelligence profile

SYNTHESIS PROTOCOL:
- Weight more specific, evidence-backed claims higher
- Prefer consensus views when models agree
- For conflicts, explain your reasoning for resolution
- Assign final confidence scores (0.0-1.0) to each field
- Include a "reasoning_trace" for transparency

OUTPUT FORMAT:
{
  "synthesis": {
    // Final synthesized intelligence
  },
  "consensus_points": ["Point 1", "Point 2"],
  "conflicts_resolved": [
    {"field": "...", "resolution": "...", "reasoning": "..."}
  ],
  "confidence_by_field": {
    "fieldName": 0.85
  },
  "reasoning_trace": "..."
}`;
}

/**
 * Get DeepSeek market research system prompt
 */
export function getDeepSeekMarketResearchSystemPrompt(): string {
  return `You are a market research specialist focused on B2B competitive intelligence.

Your task is to analyze competitive landscape, pricing intelligence, and market trends.

ANALYSIS AREAS:
1. Industry Landscape: Market size, growth rate, key trends
2. Competitor Profiling: Direct and indirect competitors, their positioning
3. Market Sizing: TAM, SAM, SOM estimates where possible
4. Buyer Journey: How target buyers research and purchase
5. Pricing Intelligence: Pricing models, typical price points (if available)

OUTPUT REQUIREMENTS:
- Use available data to support claims
- Clearly mark estimates vs. confirmed data
- Include confidence scores (0.0-1.0)
- Highlight information gaps

Respond with structured JSON.`;
}

/**
 * Build research agent prompts for all providers
 */
export async function buildResearchAgentPrompts(
  options: {
    organizationName?: string;
    websiteUrl?: string;
    industry?: string;
    accountId?: string;
  } = {}
): Promise<MultiProviderPromptPreview> {
  const now = new Date().toISOString();
  let accountName: string | undefined;

  if (options.accountId) {
    const [account] = await db
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, options.accountId))
      .limit(1);
    accountName = account?.name;
  }

  // Sample user prompts
  const openaiUserPrompt = `Organization: ${options.organizationName || 'Sample Company'}
Website: ${options.websiteUrl || 'https://example.com'}
${options.industry ? `Industry Hint: ${options.industry}` : ''}

Website Content:
[Scraped website content would appear here]`;

  const geminiUserPrompt = `Analyze the following organization for B2B engagement:

Organization: ${options.organizationName || 'Sample Company'}
Industry: ${options.industry || 'Technology'}

Available Data:
- Website content (scraped)
- Public company information
- Market context

Provide deep reasoning analysis.`;

  const claudeUserPrompt = `Review and synthesize these multi-model analysis outputs:

OpenAI Analysis:
[OpenAI structured output]

Gemini Analysis:
[Gemini reasoning output]

DeepSeek Analysis:
[DeepSeek market research output]

Produce the final synthesized intelligence profile.`;

  const deepseekUserPrompt = `Research competitive landscape for:

Company: ${options.organizationName || 'Sample Company'}
Industry: ${options.industry || 'Technology'}

Focus areas:
- Direct competitors
- Market positioning
- Pricing intelligence (if available)
- Market trends`;

  // Build all provider prompts
  const openaiSystemPrompt = getOpenAIOrganizationResearchSystemPrompt();
  const geminiSystemPrompt = getGeminiReasoningSystemPrompt();
  const claudeSystemPrompt = getClaudeSynthesisSystemPrompt();
  const deepseekSystemPrompt = getDeepSeekMarketResearchSystemPrompt();

  const providers: Record<string, AgentPromptPreview> = {
    openai: {
      provider: 'openai',
      model: process.env.ORG_RESEARCH_MODEL || 'gpt-4o',
      systemPrompt: openaiSystemPrompt,
      userPromptTemplate: `Organization: {{organizationName}}
Website: {{websiteUrl}}
Industry Hint: {{industry}}

Website Content:
{{websiteContent}}`,
      sampleUserPrompt: openaiUserPrompt,
      parameters: {
        temperature: 0.3,
        maxTokens: 4096,
        responseFormat: 'json_object',
      },
      tokenEstimate: estimateTokens(openaiSystemPrompt + openaiUserPrompt),
      promptHash: generatePromptHash(openaiSystemPrompt),
      assembledAt: now,
      context: {
        accountId: options.accountId,
        accountName,
      },
    },
    gemini: {
      provider: 'gemini',
      model: process.env.VERTEX_REASONING_MODEL || 'gemini-2.0-flash-thinking-exp-01-21',
      systemPrompt: geminiSystemPrompt,
      userPromptTemplate: `Analyze the following organization for B2B engagement:

Organization: {{organizationName}}
Industry: {{industry}}

Available Data:
{{availableData}}

Provide deep reasoning analysis.`,
      sampleUserPrompt: geminiUserPrompt,
      parameters: {
        temperature: 0.3,
        maxTokens: 16384,
      },
      tokenEstimate: estimateTokens(geminiSystemPrompt + geminiUserPrompt),
      promptHash: generatePromptHash(geminiSystemPrompt),
      assembledAt: now,
      context: {
        accountId: options.accountId,
        accountName,
      },
    },
    claude: {
      provider: 'claude',
      model: process.env.ORG_INTELLIGENCE_CLAUDE_MODEL || 'claude-3-sonnet-20240229',
      systemPrompt: claudeSystemPrompt,
      userPromptTemplate: `Review and synthesize these multi-model analysis outputs:

OpenAI Analysis:
{{openaiOutput}}

Gemini Analysis:
{{geminiOutput}}

DeepSeek Analysis:
{{deepseekOutput}}

Produce the final synthesized intelligence profile.`,
      sampleUserPrompt: claudeUserPrompt,
      parameters: {
        temperature: 0.2,
        maxTokens: parseInt(process.env.ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS || '4096'),
      },
      tokenEstimate: estimateTokens(claudeSystemPrompt + claudeUserPrompt),
      promptHash: generatePromptHash(claudeSystemPrompt),
      assembledAt: now,
      context: {
        accountId: options.accountId,
        accountName,
      },
    },
    deepseek: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      systemPrompt: deepseekSystemPrompt,
      userPromptTemplate: `Research competitive landscape for:

Company: {{organizationName}}
Industry: {{industry}}

Focus areas:
- Direct competitors
- Market positioning
- Pricing intelligence (if available)
- Market trends`,
      sampleUserPrompt: deepseekUserPrompt,
      parameters: {
        temperature: 0.4,
        maxTokens: 2000,
        responseFormat: 'json_object',
      },
      tokenEstimate: estimateTokens(deepseekSystemPrompt + deepseekUserPrompt),
      promptHash: generatePromptHash(deepseekSystemPrompt),
      assembledAt: now,
      context: {
        accountId: options.accountId,
        accountName,
      },
    },
  };

  return {
    agentType: 'research',
    providers,
    assembledAt: now,
  };
}

/**
 * Get single provider prompt for email agent
 */
export async function getEmailAgentPrompt(
  provider: EmailAgentProvider,
  options: {
    accountId?: string;
    campaignId?: string;
    prompt?: string;
  } = {}
): Promise<AgentPromptPreview> {
  const allPrompts = await buildEmailAgentPrompts(options);
  const providerPrompt = allPrompts.providers[provider];

  if (!providerPrompt) {
    throw new Error(`Unknown email agent provider: ${provider}`);
  }

  return providerPrompt;
}

/**
 * Get single provider prompt for research agent
 */
export async function getResearchAgentPrompt(
  provider: ResearchAgentProvider,
  options: {
    organizationName?: string;
    websiteUrl?: string;
    industry?: string;
    accountId?: string;
  } = {}
): Promise<AgentPromptPreview> {
  const allPrompts = await buildResearchAgentPrompts(options);
  const providerPrompt = allPrompts.providers[provider];

  if (!providerPrompt) {
    throw new Error(`Unknown research agent provider: ${provider}`);
  }

  return providerPrompt;
}

// ==================== VOICE AGENT PROMPTS ====================

import {
  CONDENSED_VOICE_AGENT_CONTROL,
  DEFAULT_VOICE_AGENT_CONTROL_INTELLIGENCE,
  CANONICAL_DEFAULT_OPENING_MESSAGE,
} from "./voice-agent-control-defaults";

/**
 * Get OpenAI Realtime voice agent system prompt
 */
export function getOpenAIVoiceAgentSystemPrompt(useCondensed: boolean = true): string {
  const basePrompt = useCondensed ? CONDENSED_VOICE_AGENT_CONTROL : DEFAULT_VOICE_AGENT_CONTROL_INTELLIGENCE;

  return `${basePrompt}

## Provider-Specific Instructions (OpenAI Realtime)

- This is a real-time voice conversation - respond naturally and conversationally
- Use natural speech patterns with appropriate pauses
- Listen carefully and respond to what was actually said
- Avoid robotic or overly formal language
- Match the prospect's energy level and speaking pace`;
}

/**
 * Get Gemini Live voice agent system prompt
 */
export function getGeminiVoiceAgentSystemPrompt(useCondensed: boolean = true): string {
  const basePrompt = useCondensed ? CONDENSED_VOICE_AGENT_CONTROL : DEFAULT_VOICE_AGENT_CONTROL_INTELLIGENCE;

  return `${basePrompt}

## Provider-Specific Instructions (Gemini Live)

- This is a real-time voice conversation using Google's Gemini Live API
- Use natural, conversational tone with appropriate emotional resonance
- Listen actively and acknowledge what the prospect says before responding
- Adapt your speaking style to match the conversation flow
- Use clear pronunciation and appropriate pacing for professional calls`;
}

/**
 * Build voice agent prompts for all providers
 */
export async function buildVoiceAgentPrompts(
  options: {
    agentId?: string;
    useCondensed?: boolean;
  } = {}
): Promise<MultiProviderPromptPreview & { agentType: 'voice' }> {
  const now = new Date().toISOString();
  const useCondensed = options.useCondensed !== false; // Default to condensed

  const openaiSystemPrompt = getOpenAIVoiceAgentSystemPrompt(useCondensed);
  const geminiSystemPrompt = getGeminiVoiceAgentSystemPrompt(useCondensed);

  const userPromptTemplate = `You are making a call to:
Contact: {{contact.full_name}}
Job Title: {{contact.job_title}}
Company: {{account.name}}

Opening Message: "${CANONICAL_DEFAULT_OPENING_MESSAGE}"

Campaign Script:
{{campaign.callScript}}

Organization Context:
{{organization.intelligence}}`;

  const sampleUserPrompt = `You are making a call to:
Contact: John Smith
Job Title: VP of Sales
Company: Acme Corporation

Opening Message: "Hello, may I please speak with John Smith, the VP of Sales at Acme Corporation?"

Campaign Script:
This is a discovery call to understand their current lead generation challenges and explore how our platform might help accelerate their pipeline.

Organization Context:
We are DemandGentic, a B2B demand generation platform that helps companies improve outbound efficiency through AI-powered voice and email agents.`;

  const openaiFullPrompt = openaiSystemPrompt + userPromptTemplate;
  const geminiFullPrompt = geminiSystemPrompt + userPromptTemplate;

  const providers: Record<string, AgentPromptPreview> = {
    openai: {
      provider: 'openai',
      model: 'gpt-4o-realtime-preview',
      systemPrompt: openaiSystemPrompt,
      userPromptTemplate: userPromptTemplate,
      sampleUserPrompt: sampleUserPrompt,
      parameters: {
        temperature: 0.8,
        maxTokens: 4096,
      },
      tokenEstimate: estimateTokens(openaiFullPrompt),
      promptHash: generatePromptHash(openaiSystemPrompt),
      assembledAt: now,
      context: {
        accountId: options.agentId,
      },
    },
    gemini: {
      provider: 'gemini',
      model: 'gemini-2.0-flash-live-001',
      systemPrompt: geminiSystemPrompt,
      userPromptTemplate: userPromptTemplate,
      sampleUserPrompt: sampleUserPrompt,
      parameters: {
        temperature: 0.8,
        maxTokens: 4096,
      },
      tokenEstimate: estimateTokens(geminiFullPrompt),
      promptHash: generatePromptHash(geminiSystemPrompt),
      assembledAt: now,
      context: {
        accountId: options.agentId,
      },
    },
  };

  return {
    agentType: 'voice',
    providers,
    assembledAt: now,
  };
}

/**
 * Get single provider prompt for voice agent
 */
export async function getVoiceAgentPrompt(
  provider: VoiceAgentProvider,
  options: {
    agentId?: string;
    useCondensed?: boolean;
  } = {}
): Promise<AgentPromptPreview> {
  const allPrompts = await buildVoiceAgentPrompts(options);
  const providerPrompt = allPrompts.providers[provider];

  if (!providerPrompt) {
    throw new Error(`Unknown voice agent provider: ${provider}`);
  }

  return providerPrompt;
}
