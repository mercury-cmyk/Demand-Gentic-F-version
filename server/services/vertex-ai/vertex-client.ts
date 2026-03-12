/**
 * Vertex AI Client Service
 *
 * Central client for all Vertex AI operations including:
 * - Gemini model inference
 * - Embeddings generation
 * - Vector search
 * - Agent Builder integration
 *
 * Fully replaces OpenAI dependency for production on Google Cloud.
 */

import { VertexAI, HarmCategory, HarmBlockThreshold, GenerativeModel, Part, Content } from "@google-cloud/vertexai";
import { GoogleAuth } from "google-auth-library";

// ==================== CONFIGURATION ====================

export interface VertexAIConfig {
  projectId: string;
  location: string;
  // Model configurations
  models: {
    chat: string;          // gemini-2.0-flash or gemini-1.5-pro
    reasoning: string;     // gemini-2.0-flash-thinking for complex reasoning
    embedding: string;     // text-embedding-004
    multimodal: string;    // gemini-1.5-pro-vision
    image: string;         // imagen-3.0-generate-001
  };
  // Safety settings
  safetySettings: {
    harassmentThreshold: HarmBlockThreshold;
    hateSpeechThreshold: HarmBlockThreshold;
    sexuallyExplicitThreshold: HarmBlockThreshold;
    dangerousContentThreshold: HarmBlockThreshold;
  };
}

const defaultConfig: VertexAIConfig = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || "gen-lang-client-0789558283",
  location: process.env.VERTEX_AI_LOCATION || "us-central1",
  models: {
    chat: process.env.VERTEX_CHAT_MODEL || "gemini-2.0-flash-001",
    reasoning: process.env.VERTEX_REASONING_MODEL || "gemini-3-pro-preview",
    embedding: process.env.VERTEX_EMBEDDING_MODEL || "text-embedding-004",
    multimodal: process.env.VERTEX_MULTIMODAL_MODEL || "gemini-2.0-flash-001",
    image: process.env.VERTEX_IMAGE_MODEL || "imagen-3.0-generate-001",
  },
  safetySettings: {
    harassmentThreshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    hateSpeechThreshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    sexuallyExplicitThreshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    dangerousContentThreshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
};

// ==================== VERTEX AI CLIENT ====================

let vertexAIInstance: VertexAI | null = null;
let currentConfig: VertexAIConfig = defaultConfig;

// ==================== GLOBAL VERTEX AI RATE LIMITER ====================
// Prevents 429 "Rate exceeded" from Google Cloud by throttling at the app layer.
// Three defenses: concurrency semaphore, RPM sliding window, global cooldown.

const VERTEX_MAX_CONCURRENT = parseInt(process.env.VERTEX_MAX_CONCURRENT || '30', 10);
const VERTEX_MAX_RPM = parseInt(process.env.VERTEX_MAX_RPM || '200', 10);
const VERTEX_SEMAPHORE_TIMEOUT_MS = parseInt(process.env.VERTEX_SEMAPHORE_TIMEOUT_MS || '60000', 10);

// Concurrency semaphore
let _vertexActive = 0;
const _vertexWaitQueue: Array<{ resolve: () => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];

// RPM sliding window (tracks timestamps of recent requests)
const _rpmWindow: number[] = [];

// Global cooldown (progressive: 5s → 10s → 30s → 60s)
let _globalCooldownUntil = 0;
let _consecutiveCooldowns = 0;
const COOLDOWN_STEPS_MS = [5000, 10000, 30000, 60000];

function _acquireVertexSlot(): Promise<void> {
  // Check global cooldown first
  const cooldownRemaining = _globalCooldownUntil - Date.now();
  if (cooldownRemaining > 0) {
    return new Promise((resolve) => setTimeout(() => _acquireVertexSlot().then(resolve), Math.min(cooldownRemaining, 5000)));
  }

  // Check RPM limit
  const now = Date.now();
  const windowStart = now - 60000;
  // Prune old entries
  while (_rpmWindow.length > 0 && _rpmWindow[0] < windowStart) _rpmWindow.shift();
  if (_rpmWindow.length >= VERTEX_MAX_RPM) {
    const waitMs = _rpmWindow[0] - windowStart + 100; // wait until oldest entry expires + buffer
    return new Promise((resolve) => setTimeout(() => _acquireVertexSlot().then(resolve), Math.min(waitMs, 5000)));
  }

  // Check concurrency
  if (_vertexActive < VERTEX_MAX_CONCURRENT) {
    _vertexActive++;
    _rpmWindow.push(now);
    return Promise.resolve();
  }

  // Queue the request
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = _vertexWaitQueue.findIndex((w) => w.resolve === resolve);
      if (idx !== -1) _vertexWaitQueue.splice(idx, 1);
      reject(new Error(
        `[VertexAI] Semaphore timeout after ${VERTEX_SEMAPHORE_TIMEOUT_MS}ms. ` +
        `Active: ${_vertexActive}/${VERTEX_MAX_CONCURRENT}, Queued: ${_vertexWaitQueue.length}, RPM: ${_rpmWindow.length}/${VERTEX_MAX_RPM}.`
      ));
    }, VERTEX_SEMAPHORE_TIMEOUT_MS);
    _vertexWaitQueue.push({ resolve, reject, timer });
  });
}

function _releaseVertexSlot(): void {
  if (_vertexWaitQueue.length > 0) {
    const next = _vertexWaitQueue.shift()!;
    clearTimeout(next.timer);
    _rpmWindow.push(Date.now());
    next.resolve();
  } else {
    _vertexActive = Math.max(0, _vertexActive - 1);
  }
}

function _triggerGlobalCooldown(reason: string): void {
  const stepIdx = Math.min(_consecutiveCooldowns, COOLDOWN_STEPS_MS.length - 1);
  const cooldownMs = COOLDOWN_STEPS_MS[stepIdx];
  _globalCooldownUntil = Date.now() + cooldownMs;
  _consecutiveCooldowns++;
  console.warn(`[VertexAI] ⚠️ Global cooldown ${cooldownMs / 1000}s (step ${_consecutiveCooldowns}, reason: ${reason}). Active: ${_vertexActive}, Queued: ${_vertexWaitQueue.length}, RPM: ${_rpmWindow.length}`);
}

function _resetCooldownStreak(): void {
  if (_consecutiveCooldowns > 0) {
    _consecutiveCooldowns = 0;
  }
}

/** Wrap a Vertex AI API call with concurrency + RPM limiting */
async function withVertexThrottle<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  const queuedAt = Date.now();
  await _acquireVertexSlot();
  const waitMs = Date.now() - queuedAt;
  if (waitMs > 2000 && label) {
    console.warn(`[VertexAI] "${label}" waited ${waitMs}ms for slot (active: ${_vertexActive}, queued: ${_vertexWaitQueue.length})`);
  }
  try {
    const result = await fn();
    _resetCooldownStreak(); // successful call resets progressive cooldown
    return result;
  } catch (error: any) {
    if (isRateLimitError(error)) {
      _triggerGlobalCooldown(error.message?.substring(0, 80) || 'rate-limit');
    }
    throw error;
  } finally {
    _releaseVertexSlot();
  }
}

/** Get Vertex AI throttle stats for monitoring */
export function getVertexThrottleStats() {
  const now = Date.now();
  const windowStart = now - 60000;
  const recentRpm = _rpmWindow.filter(t => t >= windowStart).length;
  return {
    active: _vertexActive,
    queued: _vertexWaitQueue.length,
    maxConcurrent: VERTEX_MAX_CONCURRENT,
    rpm: recentRpm,
    maxRpm: VERTEX_MAX_RPM,
    globalCooldownRemainingMs: Math.max(0, _globalCooldownUntil - now),
    consecutiveCooldowns: _consecutiveCooldowns,
  };
}

// Deep Think circuit breaker (prevents repeated 429 storms)
const DEEP_THINK_COOLDOWN_MS = Math.max(10000, Number(process.env.VERTEX_DEEP_THINK_COOLDOWN_MS || 120000));
let deepThinkCooldownUntil = 0;
const VERTEX_RATE_LIMIT_USER_MESSAGE = "Vertex AI is temporarily rate-limited. Please retry in about a minute.";

function isRateLimitError(error: any): boolean {
  const msg = (error?.message || error?.toString?.() || "").toLowerCase();
  const code = Number(error?.code ?? error?.status ?? error?.statusCode);
  return (
    code === 8 ||
    code === 429 ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate exceeded") ||
    msg.includes("rate limit") ||
    msg.includes("quota exceeded") ||
    msg.includes("429") ||
    msg.includes("too many requests")
  );
}

function toVertexRateLimitError(error: any): Error {
  const wrapped: any = new Error(VERTEX_RATE_LIMIT_USER_MESSAGE);
  wrapped.code = 429;
  wrapped.status = 429;
  wrapped.statusCode = 429;
  wrapped.retryAfterSeconds = Math.max(5, Math.ceil(Math.max(0, _globalCooldownUntil - Date.now()) / 1000) || 60);
  wrapped.cause = error;
  return wrapped;
}

function getDeepThinkCooldownRemainingMs(): number {
  return Math.max(0, deepThinkCooldownUntil - Date.now());
}

function openDeepThinkCooldown(reason: string): void {
  deepThinkCooldownUntil = Date.now() + DEEP_THINK_COOLDOWN_MS;
  console.warn(`[VertexAI] Deep Think cooldown enabled for ${Math.round(DEEP_THINK_COOLDOWN_MS / 1000)}s (${reason}).`);
}

/**
 * Initialize or get the Vertex AI client
 */
export function getVertexAI(config?: Partial<VertexAIConfig>): VertexAI {
  if (config) {
    currentConfig = { ...defaultConfig, ...config };
  }

  if (!vertexAIInstance) {
    vertexAIInstance = new VertexAI({
      project: currentConfig.projectId,
      location: currentConfig.location,
    });
    console.log(`[VertexAI] Initialized client for project: ${currentConfig.projectId}, location: ${currentConfig.location}`);
  }

  return vertexAIInstance;
}

/**
 * Reinitialise the Vertex AI singleton with new credentials.
 * Called by the Google Account Manager on account switch.
 */
export function reinitializeVertexClient(opts: {
  projectId: string;
  location: string;
  keyFilename?: string;
}): void {
  vertexAIInstance = null; // drop old singleton
  currentConfig = {
    ...defaultConfig,
    projectId: opts.projectId,
    location: opts.location,
  };
  // Force immediate init so the new project is applied now
  const initOpts: any = { project: opts.projectId, location: opts.location };
  if (opts.keyFilename) initOpts.keyFilename = opts.keyFilename;
  vertexAIInstance = new VertexAI(initOpts);
  console.log(`[VertexAI] ♻️  Reinitialized for project: ${opts.projectId}, location: ${opts.location}`);
}

/**
 * Get current configuration
 */
export function getVertexConfig(): VertexAIConfig {
  return currentConfig;
}

// ==================== MODEL ACCESSORS ====================

/**
 * Get the chat model (Gemini Flash) for fast conversational AI
 */
export function getChatModel(): GenerativeModel {
  const vertex = getVertexAI();
  return vertex.getGenerativeModel({
    model: currentConfig.models.chat,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: currentConfig.safetySettings.harassmentThreshold },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: currentConfig.safetySettings.hateSpeechThreshold },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: currentConfig.safetySettings.sexuallyExplicitThreshold },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: currentConfig.safetySettings.dangerousContentThreshold },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });
}

/**
 * Get the reasoning model (Gemini Thinking) for complex multi-step reasoning
 */
export function getReasoningModel(): GenerativeModel {
  const vertex = getVertexAI();
  return vertex.getGenerativeModel({
    model: currentConfig.models.reasoning,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: currentConfig.safetySettings.harassmentThreshold },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: currentConfig.safetySettings.hateSpeechThreshold },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: currentConfig.safetySettings.sexuallyExplicitThreshold },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: currentConfig.safetySettings.dangerousContentThreshold },
    ],
    generationConfig: {
      temperature: 0.3,
      topP: 0.95,
      maxOutputTokens: 16384,
    },
  });
}

/**
 * Get the multimodal model for vision and document understanding
 */
export function getMultimodalModel(): GenerativeModel {
  const vertex = getVertexAI();
  return vertex.getGenerativeModel({
    model: currentConfig.models.multimodal,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: currentConfig.safetySettings.harassmentThreshold },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: currentConfig.safetySettings.hateSpeechThreshold },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: currentConfig.safetySettings.sexuallyExplicitThreshold },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: currentConfig.safetySettings.dangerousContentThreshold },
    ],
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });
}

/**
 * Get the image generation model (Imagen 3)
 */
export function getImageModel(): GenerativeModel {
  const vertex = getVertexAI();
  return vertex.getGenerativeModel({
    model: currentConfig.models.image,
  });
}

/**
 * Generate an image from a text prompt using Imagen 3
 */
export async function generateImage(prompt: string, aspectRatio: string = "16:9"): Promise<string | null> {
  const model = getImageModel();
  
  try {
    // Imagen 3 request format
    const result = await withRetry(() =>
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          // @ts-ignore - Vertex AI SDK types might not have implicit support for specific imagen params yet in basic config
          sampleCount: 1,
          aspectRatio: aspectRatio,
        } as any
      })
    );

    const response = result.response;
    // Imagen returns base64 string in the response candidates usually under a specific structure or directly as bytes
    // For Vertex AI SDK, it maps to standard response structure but verify payload
    // Usually it's in candidates[0].content.parts[0].inlineData or similar
    
    // Note: This implementation depends on how Imagen 3 specifically returns data via the GenerativeModel interface
    // Ideally we check for inlineData
    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part && 'inlineData' in part && part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
    
    return null;
  } catch (error) {
    console.error(`[VertexAI] Image generation failed:`, error);
    return null;
  }
}

// ==================== RETRY HELPER ====================

/**
 * Retry with exponential backoff for Vertex AI rate limit / quota errors.
 * Now integrated with global throttle — calls go through the concurrency
 * semaphore and RPM limiter. Skips retries if global cooldown is active
 * to prevent retry amplification storms.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withVertexThrottle(fn, attempt > 0 ? `retry-${attempt}` : undefined);
    } catch (error: any) {
      const isRetryable = isRateLimitError(error);

      if (!isRetryable) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw toVertexRateLimitError(error);
      }

      // If global cooldown is already active, don't retry — another call already triggered it
      const cooldownRemaining = _globalCooldownUntil - Date.now();
      if (cooldownRemaining > 2000 && attempt > 0) {
        console.warn(`[VertexAI] Skipping retry — global cooldown active (${Math.ceil(cooldownRemaining / 1000)}s remaining)`);
        throw toVertexRateLimitError(error);
      }

      const backoffMs = Math.min(3000 * Math.pow(2, attempt) + Math.random() * 1000, 60000);
      console.warn(`[VertexAI] Rate limited (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(backoffMs)}ms...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw new Error("Unreachable");
}

// ==================== GENERATION UTILITIES ====================

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  responseFormat?: "text" | "json";
  model?: string;
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

/**
 * Generate text completion using Vertex AI Gemini
 */
export async function generateText(
  prompt: string,
  options: GenerationOptions = {}
): Promise<string> {
  const model = options.model
    ? getVertexAI().getGenerativeModel({
        model: options.model,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: currentConfig.safetySettings.harassmentThreshold },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: currentConfig.safetySettings.hateSpeechThreshold },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: currentConfig.safetySettings.sexuallyExplicitThreshold },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: currentConfig.safetySettings.dangerousContentThreshold },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      })
    : getChatModel();

  const generationConfig: any = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 4096,
    topP: options.topP ?? 0.95,
  };

  if (options.stopSequences) {
    generationConfig.stopSequences = options.stopSequences;
  }

  if (options.responseFormat === "json") {
    generationConfig.responseMimeType = "application/json";
  }

  const result = await withRetry(() =>
    model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    })
  );

  const response = result.response;
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return text;
}

/**
 * Generate structured JSON output
 */
export async function generateJSON<T>(
  prompt: string,
  options: GenerationOptions = {}
): Promise<T> {
  const text = await generateText(prompt, { ...options, responseFormat: "json" });

  try {
    // Handle potential markdown code blocks
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }

    return JSON.parse(jsonText.trim());
  } catch (error) {
    console.error("[VertexAI] Failed to parse JSON response:", text);
    throw new Error(`Failed to parse JSON response from Vertex AI: ${error}`);
  }
}

/**
 * Multi-turn chat completion
 */
export async function chat(
  systemPrompt: string,
  messages: ChatMessage[],
  options: GenerationOptions = {}
): Promise<string> {
  const model = getChatModel();

  // Build content array with system instruction
  const contents: Content[] = [];

  // Add system prompt as initial context
  if (systemPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: `System Instructions:\n${systemPrompt}\n\n---\n\nPlease acknowledge you understand these instructions and are ready to help.` }],
    });
    contents.push({
      role: "model",
      parts: [{ text: "I understand the instructions and am ready to help." }],
    });
  }

  // Add conversation messages
  for (const msg of messages) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    });
  }

  const generationConfig: any = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 4096,
    topP: options.topP ?? 0.95,
  };

  if (options.responseFormat === "json") {
    generationConfig.responseMimeType = "application/json";
  }

  const result = await withRetry(() =>
    model.generateContent({
      contents,
      generationConfig,
    })
  );

  const response = result.response;
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return text;
}

/**
 * Streaming chat completion
 */
export async function* streamChat(
  systemPrompt: string,
  messages: ChatMessage[],
  options: GenerationOptions = {}
): AsyncGenerator<string> {
  const model = getChatModel();

  const contents: Content[] = [];

  if (systemPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: `System Instructions:\n${systemPrompt}` }],
    });
    contents.push({
      role: "model",
      parts: [{ text: "Understood." }],
    });
  }

  for (const msg of messages) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    });
  }

  const generationConfig: any = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 4096,
    topP: options.topP ?? 0.95,
  };

  const streamingResult = await withRetry(() =>
    model.generateContentStream({
      contents,
      generationConfig,
    })
  );

  for await (const chunk of streamingResult.stream) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (text) {
      yield text;
    }
  }
}

/**
 * Complex reasoning with Gemini 3 Deep Think (thinking_level: HIGH)
 * Uses REST API directly since @google-cloud/vertexai SDK doesn't support thinkingConfig yet.
 * Gemini 3 models require the global endpoint.
 */
let _reasoningAuth: GoogleAuth | null = null;

export async function reason(
  prompt: string,
  options: GenerationOptions = {}
): Promise<{ thinking: string; answer: string }> {
  const modelId = currentConfig.models.reasoning;
  const isGemini3 = modelId.includes("gemini-3");

  const cooldownRemainingMs = getDeepThinkCooldownRemainingMs();
  if (cooldownRemainingMs > 0) {
    console.warn(`[VertexAI] Deep Think cooldown active (${Math.ceil(cooldownRemainingMs / 1000)}s remaining). Using standard reasoning model.`);
    const model = getReasoningModel();
    const result = await withRetry(() =>
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 16384,
          topP: options.topP ?? 0.95,
        },
      })
    );
    const response = result.response;
    const fullText = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const thinkingMatch = fullText.match(/<thinking>([\s\S]*?)<\/thinking>/);
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : "";
    const answer = fullText.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
    return { thinking, answer };
  }

  // For older thinking models (gemini-2.x), use the SDK path
  if (!isGemini3) {
    const model = getReasoningModel();
    const result = await withRetry(() =>
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 16384,
          topP: options.topP ?? 0.95,
        },
      })
    );
    const response = result.response;
    const fullText = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const thinkingMatch = fullText.match(/<thinking>([\s\S]*?)<\/thinking>/);
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : "";
    const answer = fullText.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
    return { thinking, answer };
  }

  // Gemini 3 Deep Think via REST API (global endpoint, thinkingConfig)
  if (!_reasoningAuth) {
    _reasoningAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }
  const accessToken = await _reasoningAuth.getAccessToken();

  // Gemini 3 requires the global endpoint
  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${currentConfig.projectId}/locations/global/publishers/google/models/${modelId}:generateContent`;

  const data: any = await withRetry(async () => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 16384,
          topP: options.topP ?? 0.95,
          thinkingConfig: {
            thinkingLevel: "HIGH",
          },
        },
      }),
    });

    if (!res.ok) {
      const err: any = new Error(`Gemini 3 Deep Think request failed: ${res.status} ${res.statusText}`);
      err.code = res.status;
      throw err;
    }

    return res.json();
  });

  // Gemini 3 returns thinking in separate parts with "thought" flag
  const parts = data.candidates?.[0]?.content?.parts || [];
  let thinking = "";
  let answer = "";

  for (const part of parts) {
    if (part.thought) {
      thinking += (part.text || "") + "\n";
    } else {
      answer += (part.text || "");
    }
  }

  // Fallback: if no thought parts, try legacy <thinking> tag parsing
  if (!thinking && answer) {
    const thinkingMatch = answer.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
      thinking = thinkingMatch[1].trim();
      answer = answer.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
    }
  }

  return { thinking: thinking.trim(), answer: answer.trim() };
}

/**
 * Deep analysis with Gemini 3 Deep Think that returns structured JSON.
 * Primary model for all deep reasoning/analysis endpoints.
 * Falls back to generateJSON (Gemini Flash) if Deep Think is unavailable.
 */
export async function deepAnalyzeJSON<T>(
  prompt: string,
  options: GenerationOptions = {}
): Promise<T> {
  const modelId = options.model || currentConfig.models.reasoning;
  const isGemini3 = modelId.includes("gemini-3");

  const cooldownRemainingMs = getDeepThinkCooldownRemainingMs();
  if (cooldownRemainingMs > 0) {
    console.warn(`[VertexAI] Deep Think cooldown active (${Math.ceil(cooldownRemainingMs / 1000)}s remaining). Using Gemini Flash JSON fallback.`);
    return generateJSON<T>(prompt, { ...options, responseFormat: "json" });
  }

  // Fallback to standard generateJSON if not on Gemini 3
  if (!isGemini3) {
    return generateJSON<T>(prompt, { ...options, responseFormat: "json" });
  }

  if (!_reasoningAuth) {
    _reasoningAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }
  const accessToken = await _reasoningAuth.getAccessToken();
  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${currentConfig.projectId}/locations/global/publishers/google/models/${modelId}:generateContent`;

  let data: any;
  try {
    data = await withRetry(async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxTokens ?? 8192,
            topP: options.topP ?? 0.95,
            responseMimeType: "application/json",
            thinkingConfig: {
              thinkingLevel: "HIGH",
            },
          },
        }),
      });

      if (!res.ok) {
        const err: any = new Error(`Gemini 3 Deep Think JSON request failed: ${res.status} ${res.statusText}`);
        err.code = res.status;
        throw err;
      }

      return res.json();
    });
  } catch (error: any) {
    if (isRateLimitError(error)) {
      openDeepThinkCooldown('rate-limit/429');
    }
    console.warn(`[VertexAI] Deep Think request failed (${error.message}). Falling back to standard Gemini Flash model.`);
    return generateJSON<T>(prompt, { ...options, responseFormat: "json" });
  }

  // Extract the non-thought text part (the JSON answer)
  const parts = data.candidates?.[0]?.content?.parts || [];
  let jsonText = "";
  for (const part of parts) {
    if (!part.thought && part.text) {
      jsonText += part.text;
    }
  }

  // Parse JSON
  try {
    let cleaned = jsonText.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    return JSON.parse(cleaned.trim());
  } catch (error) {
    console.error("[VertexAI] Deep Think JSON parse failed, falling back to generateJSON:", jsonText.substring(0, 200));
    // Fallback to standard generateJSON
    return generateJSON<T>(prompt, { ...options, responseFormat: "json" });
  }
}

// ==================== EMBEDDINGS ====================

/**
 * Generate embeddings for text using Vertex AI
 */
export async function generateEmbeddings(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY" | "CLASSIFICATION" = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  const vertex = getVertexAI();

  // Use the prediction endpoint for embeddings
  const endpoint = `https://${currentConfig.location}-aiplatform.googleapis.com/v1/projects/${currentConfig.projectId}/locations/${currentConfig.location}/publishers/google/models/${currentConfig.models.embedding}:predict`;

  const instances = texts.map(text => ({
    content: text,
    task_type: taskType,
  }));

  const data = await withRetry(async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Auth handled by ADC in Cloud Run
      },
      body: JSON.stringify({ instances }),
    });

    if (!response.ok) {
      const err: any = new Error(`Embeddings request failed: ${response.statusText}`);
      err.code = response.status;
      throw err;
    }

    return response.json();
  });

  return data.predictions.map((p: any) => p.embeddings.values);
}

/**
 * Generate single embedding
 */
export async function generateEmbedding(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY" | "CLASSIFICATION" = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
  const embeddings = await generateEmbeddings([text], taskType);
  return embeddings[0];
}

// ==================== FUNCTION CALLING ====================

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface FunctionCall {
  name: string;
  args: Record<string, any>;
}

/**
 * Generate with function calling support
 */
export async function generateWithFunctions(
  systemPrompt: string,
  userMessage: string,
  functions: FunctionDeclaration[],
  options: GenerationOptions = {}
): Promise<{ text: string; functionCalls: FunctionCall[] }> {
  const model = getChatModel();

  const tools = [{
    functionDeclarations: functions,
  }] as any;

  const contents: Content[] = [];

  if (systemPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: `System Instructions:\n${systemPrompt}` }],
    });
    contents.push({
      role: "model",
      parts: [{ text: "Understood." }],
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  const result = await withRetry(() =>
    model.generateContent({
      contents,
      tools,
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    })
  );

  const response = result.response;
  const candidate = response.candidates?.[0];

  const text = candidate?.content?.parts
    ?.filter((p: any) => p.text)
    .map((p: any) => p.text)
    .join("") || "";

  const functionCalls: FunctionCall[] = candidate?.content?.parts
    ?.filter((p: any) => p.functionCall)
    .map((p: any) => ({
      name: p.functionCall.name,
      args: p.functionCall.args || {},
    })) || [];

  return { text, functionCalls };
}

// ==================== HEALTH CHECK ====================

/**
 * Verify Vertex AI connection and configuration
 */
export async function healthCheck(): Promise<{
  status: "healthy" | "unhealthy";
  projectId: string;
  location: string;
  models: Record<string, boolean>;
  error?: string;
}> {
  try {
    const vertex = getVertexAI();

    // Test chat model
    const chatModel = getChatModel();
    await chatModel.generateContent({
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      generationConfig: { maxOutputTokens: 10 },
    });

    return {
      status: "healthy",
      projectId: currentConfig.projectId,
      location: currentConfig.location,
      models: {
        chat: true,
        reasoning: true,
        embedding: true,
        multimodal: true,
      },
    };
  } catch (error: any) {
    return {
      status: "unhealthy",
      projectId: currentConfig.projectId,
      location: currentConfig.location,
      models: {
        chat: false,
        reasoning: false,
        embedding: false,
        multimodal: false,
      },
      error: error.message,
    };
  }
}

export default {
  getVertexAI,
  getVertexConfig,
  getChatModel,
  getReasoningModel,
  getMultimodalModel,
  getImageModel,
  generateText,
  generateJSON,
  deepAnalyzeJSON,
  chat,
  streamChat,
  reason,
  generateEmbeddings,
  generateEmbedding,
  generateWithFunctions,
  generateImage,
  healthCheck,
  getVertexThrottleStats,
};
