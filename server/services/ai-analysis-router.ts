/**
 * AI Analysis Router — Multi-Provider Load Distribution
 *
 * Routes deep analysis / JSON generation tasks across multiple AI providers
 * to prevent 429 rate limits from any single provider. Supports:
 *   - Vertex AI (Gemini Flash / Deep Think) — primary for complex reasoning
 *   - Claude (Anthropic) — strong reasoning & analysis
 *   - DeepSeek — cost-effective, high-capacity alternative for analysis tasks
 *   - OpenAI (GPT-4o-mini) — tertiary fallback
 *
 * Load-aware routing: checks Vertex AI throttle pressure and automatically
 * shifts overflow to Claude / DeepSeek. Maintains a simple round-robin counter
 * for steady-state distribution.
 *
 * Usage:
 *   import { analyzeJSON } from './ai-analysis-router';
 *   const result = await analyzeJSON<MyType>(prompt, { maxTokens: 4096 });
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getVertexThrottleStats, deepAnalyzeJSON, generateJSON } from "./vertex-ai/vertex-client";

// ==================== CONFIGURATION ====================

type AnalysisProvider = "vertex" | "claude" | "deepseek" | "openai";

interface AnalysisOptions {
  temperature?: number;
  maxTokens?: number;
  /** Force a specific provider (skips load balancing) */
  preferredProvider?: AnalysisProvider;
  /** Use deep analysis (Deep Think on Vertex, deepseek-reasoner on DeepSeek). Default: true */
  deep?: boolean;
  /** Label for logging */
  label?: string;
}

// Provider distribution: what percentage of traffic goes to each when all healthy
// Default: 40% Vertex, 25% Claude, 25% DeepSeek, 10% OpenAI
const VERTEX_WEIGHT = parseInt(process.env.AI_ROUTER_VERTEX_WEIGHT || "20", 10);
const CLAUDE_WEIGHT = parseInt(process.env.AI_ROUTER_CLAUDE_WEIGHT || "25", 10);
const DEEPSEEK_WEIGHT = parseInt(process.env.AI_ROUTER_DEEPSEEK_WEIGHT || "50", 10);
const OPENAI_WEIGHT = parseInt(process.env.AI_ROUTER_OPENAI_WEIGHT || "5", 10);

// Vertex pressure threshold: if RPM > this % of max, shift load away
const VERTEX_PRESSURE_THRESHOLD = 0.7;

// ==================== PROVIDER CLIENTS ====================

let _deepseekClient: OpenAI | null = null;
let _openaiClient: OpenAI | null = null;
let _claudeClient: Anthropic | null = null;

function getDeepSeekClient(): OpenAI | null {
  if (_deepseekClient) return _deepseekClient;
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  _deepseekClient = new OpenAI({
    apiKey: key,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
  return _deepseekClient;
}

function getOpenAIClient(): OpenAI | null {
  if (_openaiClient) return _openaiClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  _openaiClient = new OpenAI({ apiKey: key });
  return _openaiClient;
}

function getClaudeClient(): Anthropic | null {
  if (_claudeClient) return _claudeClient;
  const key = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _claudeClient = new Anthropic({ apiKey: key });
  return _claudeClient;
}

// ==================== PROVIDER IMPLEMENTATIONS ====================

async function callDeepSeek<T>(prompt: string, options: AnalysisOptions): Promise<T> {
  const client = getDeepSeekClient();
  if (!client) throw new Error("DeepSeek not configured");

  const model = options.deep ? (process.env.DEEPSEEK_REASONING_MODEL || "deepseek-chat") : "deepseek-chat";

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You are an expert AI analyst. Always respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.",
      },
      { role: "user", content: prompt },
    ],
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 4096,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "{}";
  return parseJSONResponse<T>(text, "DeepSeek");
}

async function callOpenAI<T>(prompt: string, options: AnalysisOptions): Promise<T> {
  const client = getOpenAIClient();
  if (!client) throw new Error("OpenAI not configured");

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an expert AI analyst. Always respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.",
      },
      { role: "user", content: prompt },
    ],
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 4096,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "{}";
  return parseJSONResponse<T>(text, "OpenAI");
}

async function callClaude<T>(prompt: string, options: AnalysisOptions): Promise<T> {
  const client = getClaudeClient();
  if (!client) throw new Error("Claude not configured");

  const model = options.deep
    ? (process.env.AI_ROUTER_CLAUDE_DEEP_MODEL || "claude-sonnet-4-20250514")
    : (process.env.AI_ROUTER_CLAUDE_MODEL || "claude-haiku-4-20250514");

  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.2,
    system: "You are an expert AI analyst. Always respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.",
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseJSONResponse<T>(text || "{}", "Claude");
}

async function callVertex<T>(prompt: string, options: AnalysisOptions): Promise<T> {
  if (options.deep) {
    return deepAnalyzeJSON<T>(prompt, {
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 4096,
    });
  }
  return generateJSON<T>(prompt, {
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? 4096,
  });
}

function parseJSONResponse<T>(text: string, provider: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error(`[AI-Router] ${provider} response JSON parse failed:`, cleaned.substring(0, 300));
    throw new Error(`Failed to parse ${provider} JSON response: ${error}`);
  }
}

// ==================== LOAD-AWARE ROUTING ====================

let _routeCounter = 0;

// Track provider health: if a provider fails, mark it unhealthy briefly
const _providerHealth: Record<AnalysisProvider, { healthy: boolean; unhealthyUntil: number }> = {
  vertex: { healthy: true, unhealthyUntil: 0 },
  claude: { healthy: true, unhealthyUntil: 0 },
  deepseek: { healthy: true, unhealthyUntil: 0 },
  openai: { healthy: true, unhealthyUntil: 0 },
};

const UNHEALTHY_COOLDOWN_MS = 60000; // 1 minute cooldown after failure

function markUnhealthy(provider: AnalysisProvider): void {
  _providerHealth[provider] = { healthy: false, unhealthyUntil: Date.now() + UNHEALTHY_COOLDOWN_MS };
  console.warn(`[AI-Router] Marked ${provider} unhealthy for ${UNHEALTHY_COOLDOWN_MS / 1000}s`);
}

function isProviderHealthy(provider: AnalysisProvider): boolean {
  const h = _providerHealth[provider];
  if (h.healthy) return true;
  if (Date.now() >= h.unhealthyUntil) {
    h.healthy = true;
    return true;
  }
  return false;
}

function isProviderAvailable(provider: AnalysisProvider): boolean {
  if (!isProviderHealthy(provider)) return false;
  switch (provider) {
    case "vertex": return true; // Always available (uses ADC)
    case "claude": return !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
    case "deepseek": return !!process.env.DEEPSEEK_API_KEY;
    case "openai": return !!process.env.OPENAI_API_KEY;
  }
}

function selectProvider(options: AnalysisOptions): AnalysisProvider {
  // Honor explicit preference
  if (options.preferredProvider && isProviderAvailable(options.preferredProvider)) {
    return options.preferredProvider;
  }

  // Check Vertex AI pressure
  const vertexStats = getVertexThrottleStats();
  const vertexPressure = vertexStats.rpm / vertexStats.maxRpm;
  const vertexCooldownActive = vertexStats.globalCooldownRemainingMs > 0;
  const vertexUnderPressure = vertexPressure > VERTEX_PRESSURE_THRESHOLD || vertexCooldownActive;

  // If Vertex is under pressure, avoid it entirely
  if (vertexUnderPressure && isProviderAvailable("claude")) {
    return "claude";
  }
  if (vertexUnderPressure && isProviderAvailable("deepseek")) {
    return "deepseek";
  }
  if (vertexUnderPressure && isProviderAvailable("openai")) {
    return "openai";
  }

  // Weighted round-robin across healthy providers
  const totalWeight = (isProviderAvailable("vertex") ? VERTEX_WEIGHT : 0)
    + (isProviderAvailable("claude") ? CLAUDE_WEIGHT : 0)
    + (isProviderAvailable("deepseek") ? DEEPSEEK_WEIGHT : 0)
    + (isProviderAvailable("openai") ? OPENAI_WEIGHT : 0);

  if (totalWeight === 0) {
    // All unhealthy or unconfigured — try Vertex as last resort
    return "vertex";
  }

  const tick = _routeCounter++ % totalWeight;
  let cumulative = 0;

  if (isProviderAvailable("vertex")) {
    cumulative += VERTEX_WEIGHT;
    if (tick < cumulative) return "vertex";
  }
  if (isProviderAvailable("claude")) {
    cumulative += CLAUDE_WEIGHT;
    if (tick < cumulative) return "claude";
  }
  if (isProviderAvailable("deepseek")) {
    cumulative += DEEPSEEK_WEIGHT;
    if (tick < cumulative) return "deepseek";
  }
  if (isProviderAvailable("openai")) {
    return "openai";
  }

  return "vertex"; // Ultimate fallback
}

// ==================== PUBLIC API ====================

/**
 * Route a JSON analysis task to the best available AI provider.
 * Automatically load-balances across Vertex AI, DeepSeek, and OpenAI.
 * Falls back to next provider on failure.
 */
export async function analyzeJSON<T>(prompt: string, options: AnalysisOptions = {}): Promise<T> {
  const primary = selectProvider(options);
  const label = options.label || "analysis";
  const providers: AnalysisProvider[] = [primary];

  // Build fallback chain
  const allProviders: AnalysisProvider[] = ["vertex", "claude", "deepseek", "openai"];
  for (const p of allProviders) {
    if (p !== primary && isProviderAvailable(p)) {
      providers.push(p);
    }
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      const start = Date.now();
      let result: T;

      switch (provider) {
        case "vertex":
          result = await callVertex<T>(prompt, options);
          break;
        case "claude":
          result = await callClaude<T>(prompt, options);
          break;
        case "deepseek":
          result = await callDeepSeek<T>(prompt, options);
          break;
        case "openai":
          result = await callOpenAI<T>(prompt, options);
          break;
      }

      const elapsed = Date.now() - start;
      if (elapsed > 5000) {
        console.log(`[AI-Router] ${label} → ${provider} (${elapsed}ms)`);
      }

      return result!;
    } catch (error: any) {
      lastError = error;
      markUnhealthy(provider);
      console.warn(`[AI-Router] ${label} failed on ${provider}: ${error.message?.substring(0, 120)}. Trying next provider...`);
    }
  }

  throw lastError || new Error("[AI-Router] All providers failed");
}

/**
 * Deep analysis variant — prefers deep reasoning models.
 * Equivalent to analyzeJSON with { deep: true }.
 */
export async function deepAnalyze<T>(prompt: string, options: Omit<AnalysisOptions, "deep"> = {}): Promise<T> {
  return analyzeJSON<T>(prompt, { ...options, deep: true });
}

/**
 * Get router stats for monitoring
 */
export function getRouterStats() {
  return {
    routeCounter: _routeCounter,
    providerHealth: {
      vertex: isProviderHealthy("vertex"),
      claude: isProviderAvailable("claude") ? isProviderHealthy("claude") : "not_configured",
      deepseek: isProviderAvailable("deepseek") ? isProviderHealthy("deepseek") : "not_configured",
      openai: isProviderAvailable("openai") ? isProviderHealthy("openai") : "not_configured",
    },
    weights: { vertex: VERTEX_WEIGHT, claude: CLAUDE_WEIGHT, deepseek: DEEPSEEK_WEIGHT, openai: OPENAI_WEIGHT },
    vertexThrottle: getVertexThrottleStats(),
  };
}
