/**
 * AI Deep Research Service
 *
 * Provides deep research and analysis capabilities powered by Kimi (128k context)
 * with optional Vertex AI enrichment for Organization Intelligence context.
 *
 * Used by:
 * - AgentX for research-grade responses
 * - Agentic reports for deep market analysis
 * - Campaign planning for competitive intelligence
 */

import {
  kimiDeepResearch,
  kimiChat,
  kimiCodeAssist,
  isKimiConfigured,
  type KimiMessage,
  type DeepResearchResult,
} from "./kimi-client";
import { reason } from "./vertex-ai/vertex-client";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";

// ==================== TYPES ====================

export type ResearchDepth = "quick" | "standard" | "deep";

export type ResearchDomain =
  | "market_analysis"
  | "competitive_intelligence"
  | "account_research"
  | "campaign_strategy"
  | "lead_analysis"
  | "industry_trends"
  | "code_review"
  | "general";

export interface ResearchRequest {
  query: string;
  depth: ResearchDepth;
  domain: ResearchDomain;
  /** Organization ID for OI context enrichment */
  organizationId?: string;
  /** Additional context to include */
  additionalContext?: string;
  /** Conversation history for follow-up research */
  conversationHistory?: KimiMessage[];
  /** Max tokens for response */
  maxTokens?: number;
}

export interface ResearchResponse {
  answer: string;
  thinking?: string;
  sources: string[];
  confidence: number;
  model: string;
  provider: "kimi" | "vertex" | "hybrid";
  tokensUsed: { prompt: number; completion: number; total: number };
  researchDepth: ResearchDepth;
  domain: ResearchDomain;
  timestamp: string;
}

export interface CodeAssistRequest {
  task: string;
  codeContext?: string;
  language?: string;
  framework?: string;
}

export interface CodeAssistResponse {
  code: string;
  explanation: string;
  suggestions: string[];
  provider: "kimi";
  model: string;
  timestamp: string;
}

// ==================== DOMAIN SYSTEM PROMPTS ====================

const DOMAIN_PROMPTS: Record = {
  market_analysis: `You are a senior market research analyst. Provide actionable market analysis with data-driven insights, market sizing, growth trends, and strategic recommendations. Focus on B2B demand generation and enterprise sales contexts.`,

  competitive_intelligence: `You are a competitive intelligence specialist. Analyze competitive landscapes, identify differentiators, threats, and opportunities. Provide SWOT analysis, positioning recommendations, and battlecard-ready insights for sales teams.`,

  account_research: `You are an account-based marketing research specialist. Research target accounts deeply — identify buying signals, key stakeholders, organizational structure, recent news, technology stack, pain points, and recommended engagement approaches.`,

  campaign_strategy: `You are a demand generation strategist specializing in multi-channel B2B campaigns. Provide campaign strategy recommendations including channel selection, messaging frameworks, audience segmentation, timing, and expected performance benchmarks.`,

  lead_analysis: `You are a lead intelligence analyst. Analyze lead quality, engagement patterns, conversion likelihood, and recommended follow-up strategies. Focus on identifying high-intent signals and optimal timing for outreach.`,

  industry_trends: `You are an industry research analyst. Identify emerging trends, regulatory changes, technology shifts, and market dynamics that impact demand generation and B2B sales. Provide forward-looking insights with actionable takeaways.`,

  code_review: `You are a senior software engineer and code architect. Review code for correctness, performance, security, and maintainability. Provide specific improvements with examples. Focus on TypeScript, React, Node.js, and PostgreSQL patterns.`,

  general: `You are a versatile AI research assistant with expertise across business, technology, and strategy. Provide thorough, well-structured analysis tailored to the user's specific needs.`,
};

// ==================== CORE RESEARCH FUNCTIONS ====================

/**
 * Execute a deep research request.
 *
 * Routing logic:
 * - quick  → Kimi 8k (fast)
 * - standard → Kimi 32k
 * - deep → Kimi 128k + optional Vertex reasoning enrichment
 */
export async function executeResearch(req: ResearchRequest): Promise {
  const domainPrompt = DOMAIN_PROMPTS[req.domain] || DOMAIN_PROMPTS.general;

  // Build context with optional OI enrichment
  let fullContext = req.additionalContext || "";
  if (req.organizationId) {
    try {
      const oiPrompt = await buildAgentSystemPrompt(req.organizationId);
      if (oiPrompt) {
        fullContext = `ORGANIZATION INTELLIGENCE:\n${oiPrompt}\n\n${fullContext}`;
      }
    } catch {
      // OI enrichment is optional — continue without it
    }
  }

  // Route based on depth
  if (req.depth === "quick") {
    return executeQuickResearch(req.query, domainPrompt, fullContext, req);
  }

  if (req.depth === "standard") {
    return executeStandardResearch(req.query, domainPrompt, fullContext, req);
  }

  // Deep research — use Kimi 128k, optionally cross-reference with Vertex
  return executeDeepResearchHybrid(req.query, domainPrompt, fullContext, req);
}

/**
 * Quick research — Kimi 8k, fast turnaround.
 */
async function executeQuickResearch(
  query: string,
  domainPrompt: string,
  context: string,
  req: ResearchRequest
): Promise {
  const messages: KimiMessage[] = [
    ...(req.conversationHistory || []),
    {
      role: "user",
      content: context ? `Context:\n${context}\n\nQuestion: ${query}` : query,
    },
  ];

  const answer = await kimiChat(domainPrompt, messages, {
    model: "fast",
    temperature: 0.5,
    maxTokens: req.maxTokens || 2048,
  });

  return {
    answer,
    sources: [],
    confidence: 60,
    model: "moonshot-v1-8k",
    provider: "kimi",
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
    researchDepth: "quick",
    domain: req.domain,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Standard research — Kimi 32k with structured output.
 */
async function executeStandardResearch(
  query: string,
  domainPrompt: string,
  context: string,
  req: ResearchRequest
): Promise {
  const messages: KimiMessage[] = [
    ...(req.conversationHistory || []),
    {
      role: "user",
      content: context ? `Context:\n${context}\n\nResearch Question: ${query}` : query,
    },
  ];

  const answer = await kimiChat(domainPrompt, messages, {
    model: "standard",
    temperature: 0.4,
    maxTokens: req.maxTokens || 4096,
  });

  return {
    answer,
    sources: [],
    confidence: 70,
    model: "moonshot-v1-32k",
    provider: "kimi",
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
    researchDepth: "standard",
    domain: req.domain,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Deep research — Kimi 128k for primary analysis, Vertex for cross-validation.
 */
async function executeDeepResearchHybrid(
  query: string,
  domainPrompt: string,
  context: string,
  req: ResearchRequest
): Promise {
  // Primary: Kimi deep research (128k context)
  const kimiResult = await kimiDeepResearch(query, context, {
    temperature: 0.3,
    maxTokens: req.maxTokens || 8192,
  });

  // For deep research, optionally cross-validate with Vertex reasoning
  let provider: "kimi" | "hybrid" = "kimi";
  let enrichedAnswer = kimiResult.answer;

  try {
    // Cross-reference key findings with Vertex reasoning model
    const vertexCrossRef = await reason(
      `You are reviewing a research analysis for accuracy and completeness.

ORIGINAL RESEARCH QUERY: ${query}

RESEARCH FINDINGS:
${kimiResult.answer.substring(0, 6000)}

TASK: Briefly evaluate this analysis. If you have important corrections or additions, state them. If the analysis is solid, confirm it with "Analysis confirmed" and add any minor enhancements. Keep your response concise (under 500 words).`,
      { temperature: 0.3 }
    );

    if (vertexCrossRef?.answer && !vertexCrossRef.answer.includes("Analysis confirmed")) {
      enrichedAnswer += `\n\n---\n**Cross-Validation Notes:**\n${vertexCrossRef.answer}`;
      provider = "hybrid";
    }
  } catch {
    // Vertex cross-validation is optional enhancement
  }

  return {
    answer: enrichedAnswer,
    thinking: kimiResult.thinking,
    sources: kimiResult.sources,
    confidence: kimiResult.confidence,
    model: kimiResult.model,
    provider,
    tokensUsed: kimiResult.tokensUsed,
    researchDepth: "deep",
    domain: req.domain,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Code assistance via Kimi.
 */
export async function executeCodeAssist(req: CodeAssistRequest): Promise {
  const languageHint = req.language ? ` (Language: ${req.language})` : "";
  const frameworkHint = req.framework ? ` (Framework: ${req.framework})` : "";
  const task = `${req.task}${languageHint}${frameworkHint}`;

  const result = await kimiCodeAssist(task, req.codeContext, {
    model: "standard",
    temperature: 0.2,
  });

  return {
    ...result,
    provider: "kimi",
    model: "moonshot-v1-32k",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Conversational research — maintains context across turns.
 */
export async function researchConversation(
  systemContext: string,
  messages: KimiMessage[],
  depth: ResearchDepth = "standard"
): Promise {
  const model = depth === "deep" ? "deep" : depth === "quick" ? "fast" : "standard";

  return kimiChat(systemContext, messages, {
    model,
    temperature: 0.5,
    maxTokens: depth === "deep" ? 8192 : 4096,
  });
}

/**
 * Check if deep research capabilities are available.
 */
export function isDeepResearchAvailable(): boolean {
  return isKimiConfigured();
}