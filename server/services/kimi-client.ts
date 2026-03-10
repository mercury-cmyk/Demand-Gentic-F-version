/**
 * Kimi Platform API Client
 *
 * Integrates Moonshot AI's Kimi models for:
 * - Deep research & analysis (128k context window)
 * - Intelligent chat with web search capabilities
 * - Code generation and review
 * - Document analysis and summarization
 *
 * Uses OpenAI-compatible API format.
 * Docs: https://platform.moonshot.cn/docs
 */

import OpenAI from "openai";
import { withAiConcurrency } from "../lib/ai-concurrency";

// ==================== CONFIGURATION ====================

const KIMI_API_KEY = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";

const KIMI_MODELS = {
  /** 8k context — fast, lightweight tasks */
  fast: process.env.KIMI_FAST_MODEL || "moonshot-v1-8k",
  /** 32k context — standard research and analysis */
  standard: process.env.KIMI_STANDARD_MODEL || "moonshot-v1-32k",
  /** 128k context — deep research, long documents, comprehensive analysis */
  deep: process.env.KIMI_DEEP_MODEL || "moonshot-v1-128k",
} as const;

export type KimiModel = keyof typeof KIMI_MODELS;

class KimiConfigError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string) {
    super(message);
    this.name = "KimiConfigError";
    this.statusCode = 503;
    this.code = "KIMI_API_KEY_MISSING";
  }
}

function assertKimiConfigured(): void {
  if (!KIMI_API_KEY) {
    throw new KimiConfigError(
      "Kimi Platform API is not configured. Set KIMI_API_KEY or MOONSHOT_API_KEY environment variable."
    );
  }
}

/** Lazy-init client — created on first use */
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  assertKimiConfigured();
  if (!_client) {
    _client = new OpenAI({
      apiKey: KIMI_API_KEY!,
      baseURL: KIMI_BASE_URL,
      timeout: 180_000, // 3 min for deep research
      maxRetries: 2,
    });
  }
  return _client;
}

// ==================== TYPES ====================

export interface KimiChatOptions {
  model?: KimiModel;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Enable Kimi's built-in web search for real-time info */
  webSearch?: boolean;
  /** Stop sequences */
  stop?: string[];
}

export interface KimiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface KimiStreamChunk {
  content: string;
  done: boolean;
}

export interface DeepResearchResult {
  answer: string;
  thinking: string;
  sources: string[];
  confidence: number;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
}

// ==================== CORE FUNCTIONS ====================

/**
 * Send a chat completion request to Kimi.
 */
export async function kimiChat(
  systemPrompt: string,
  messages: KimiMessage[],
  options: KimiChatOptions = {}
): Promise<string> {
  const client = getClient();
  const modelKey = options.model || "standard";
  const modelId = KIMI_MODELS[modelKey];

  const allMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    })),
  ];

  const result = await withAiConcurrency(async () => {
    const response = await client.chat.completions.create({
      model: modelId,
      messages: allMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stop: options.stop,
    });
    return response;
  });

  return result.choices[0]?.message?.content || "";
}

/**
 * Stream a chat completion from Kimi.
 */
export async function* kimiStreamChat(
  systemPrompt: string,
  messages: KimiMessage[],
  options: KimiChatOptions = {}
): AsyncGenerator<KimiStreamChunk> {
  const client = getClient();
  const modelKey = options.model || "standard";
  const modelId = KIMI_MODELS[modelKey];

  const allMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    })),
  ];

  const stream = await client.chat.completions.create({
    model: modelId,
    messages: allMessages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    top_p: options.topP,
    stop: options.stop,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    const done = chunk.choices[0]?.finish_reason === "stop";
    if (content || done) {
      yield { content, done };
    }
  }
}

/**
 * Generate a structured JSON response from Kimi.
 */
export async function kimiGenerateJSON<T>(
  prompt: string,
  options: KimiChatOptions = {}
): Promise<T> {
  const systemPrompt = `You are a precise AI assistant that ALWAYS responds with valid JSON only. No markdown, no code fences, no explanation — just the JSON object.`;

  const response = await kimiChat(systemPrompt, [{ role: "user", content: prompt }], {
    ...options,
    temperature: options.temperature ?? 0.3,
  });

  // Strip any markdown code fences
  const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as T;
}

/**
 * Deep research — uses 128k context for comprehensive analysis.
 * Includes thinking/reasoning extraction and source tracking.
 */
export async function kimiDeepResearch(
  query: string,
  context?: string,
  options: Omit<KimiChatOptions, "model"> = {}
): Promise<DeepResearchResult> {
  const client = getClient();
  const modelId = KIMI_MODELS.deep; // Always use 128k for deep research

  const systemPrompt = `You are a world-class research analyst with expertise across business, technology, markets, and strategy. You perform deep, comprehensive research and analysis.

RESPONSE FORMAT:
Start with a <thinking> section where you reason through the problem step by step, consider multiple angles, evaluate evidence, and form your analysis. Then provide your final answer after </thinking>.

In your final answer:
1. Be comprehensive but structured
2. Cite specific data points and reasoning
3. Rate your confidence (0-100) based on evidence quality
4. List key sources/references if applicable

${context ? `\nCONTEXT PROVIDED:\n${context}` : ""}`;

  const result = await withAiConcurrency(async () => {
    const response = await client.chat.completions.create({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 8192,
      top_p: options.topP ?? 0.95,
    });
    return response;
  });

  const fullResponse = result.choices[0]?.message?.content || "";
  const usage = result.usage;

  // Extract thinking and answer
  const thinkingMatch = fullResponse.match(/<thinking>([\s\S]*?)<\/thinking>/);
  const thinking = thinkingMatch ? thinkingMatch[1].trim() : "";
  const answer = thinkingMatch
    ? fullResponse.replace(/<thinking>[\s\S]*?<\/thinking>/, "").trim()
    : fullResponse;

  // Extract confidence
  const confidenceMatch = answer.match(/confidence[:\s]*(\d+)/i);
  const confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : 70;

  // Extract sources
  const sources: string[] = [];
  const sourceMatches = answer.matchAll(/(?:source|reference|citation)[:\s]*(.+)/gi);
  for (const m of sourceMatches) {
    sources.push(m[1].trim());
  }

  return {
    answer,
    thinking,
    sources,
    confidence: Math.min(100, Math.max(0, confidence)),
    model: modelId,
    tokensUsed: {
      prompt: usage?.prompt_tokens || 0,
      completion: usage?.completion_tokens || 0,
      total: usage?.total_tokens || 0,
    },
  };
}

/**
 * Code generation and review using Kimi.
 */
export async function kimiCodeAssist(
  task: string,
  codeContext?: string,
  options: KimiChatOptions = {}
): Promise<{ code: string; explanation: string; suggestions: string[] }> {
  const systemPrompt = `You are an expert software engineer and code reviewer. You write clean, efficient, production-ready code.

RESPONSE FORMAT (JSON):
{
  "code": "the complete code solution",
  "explanation": "brief explanation of the approach",
  "suggestions": ["improvement suggestion 1", "suggestion 2"]
}

Respond with valid JSON only.`;

  const userPrompt = codeContext
    ? `EXISTING CODE CONTEXT:\n\`\`\`\n${codeContext}\n\`\`\`\n\nTASK: ${task}`
    : `TASK: ${task}`;

  return kimiGenerateJSON<{ code: string; explanation: string; suggestions: string[] }>(
    `${systemPrompt}\n\n${userPrompt}`,
    { ...options, model: options.model || "standard" }
  );
}

/**
 * Check if Kimi is configured and available.
 */
export function isKimiConfigured(): boolean {
  return !!KIMI_API_KEY;
}

/**
 * Get current Kimi configuration status (safe for API response).
 */
export function getKimiStatus(): {
  configured: boolean;
  baseUrl: string;
  models: Record<string, string>;
} {
  return {
    configured: !!KIMI_API_KEY,
    baseUrl: KIMI_BASE_URL,
    models: { ...KIMI_MODELS },
  };
}
