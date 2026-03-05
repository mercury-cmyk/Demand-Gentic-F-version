/**
 * DeepSeek Client
 *
 * Optional alternative AI provider for client portal agent.
 * Falls back gracefully if not configured.
 */

import OpenAI from "openai";

// DeepSeek uses OpenAI-compatible API
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

let deepSeekClient: OpenAI | null = null;

/**
 * Check if DeepSeek is configured
 */
export function isDeepSeekConfigured(): boolean {
  return !!DEEPSEEK_API_KEY;
}

/**
 * Get DeepSeek client (lazy initialization)
 */
function getClient(): OpenAI {
  if (!deepSeekClient) {
    if (!DEEPSEEK_API_KEY) {
      throw new Error("DeepSeek API key not configured");
    }
    deepSeekClient = new OpenAI({
      apiKey: DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
    });
  }
  return deepSeekClient;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface FunctionCall {
  name: string;
  args: Record<string, any>;
}

/**
 * Get the raw OpenAI-compatible client (for services that need direct SDK access)
 */
export function getDeepSeekClient(): OpenAI {
  return getClient();
}

/**
 * Generate structured JSON with DeepSeek
 */
export async function deepSeekJSON<T>(
  prompt: string,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }
): Promise<T> {
  if (!isDeepSeekConfigured()) {
    throw new Error("DeepSeek is not configured");
  }

  const client = getClient();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  messages.push({
    role: "system",
    content: options?.systemPrompt || "You are an expert AI assistant. Always respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.",
  });

  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model: options?.model || "deepseek-chat",
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4096,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "{}";
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  return JSON.parse(cleaned) as T;
}

/**
 * Generate plain text with DeepSeek
 */
export async function deepSeekText(
  prompt: string,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }
): Promise<string> {
  if (!isDeepSeekConfigured()) {
    throw new Error("DeepSeek is not configured");
  }

  const client = getClient();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model: options?.model || "deepseek-chat",
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
  });

  return response.choices[0]?.message?.content || "";
}

/**
 * Chat with DeepSeek
 */
export async function deepSeekChat(
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  if (!isDeepSeekConfigured()) {
    throw new Error("DeepSeek is not configured");
  }

  const client = getClient();
  const response = await client.chat.completions.create({
    model: options?.model || "deepseek-chat",
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2048,
  });

  return response.choices[0]?.message?.content || "";
}

/**
 * Generate with function calling support
 */
export async function deepSeekGenerateWithFunctions(
  prompt: string,
  functions: FunctionDeclaration[],
  options?: {
    model?: string;
    temperature?: number;
    systemPrompt?: string;
  }
): Promise<{
  text?: string;
  functionCalls?: FunctionCall[];
}> {
  if (!isDeepSeekConfigured()) {
    throw new Error("DeepSeek is not configured");
  }

  const client = getClient();

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (options?.systemPrompt) {
    messages.push({
      role: "system",
      content: options.systemPrompt,
    });
  }

  messages.push({
    role: "user",
    content: prompt,
  });

  // Convert function declarations to OpenAI tool format
  const tools: OpenAI.Chat.ChatCompletionTool[] = functions.map((fn) => ({
    type: "function",
    function: {
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
    },
  }));

  const response = await client.chat.completions.create({
    model: options?.model || "deepseek-chat",
    messages,
    tools: tools.length > 0 ? tools : undefined,
    temperature: options?.temperature ?? 0.7,
  });

  const message = response.choices[0]?.message;

  if (!message) {
    return { text: "" };
  }

  // Check for tool calls
  if (message.tool_calls && message.tool_calls.length > 0) {
    const functionCalls: FunctionCall[] = message.tool_calls.map((tc) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || "{}"),
    }));
    return { functionCalls };
  }

  return { text: message.content || "" };
}

export default {
  isDeepSeekConfigured,
  getDeepSeekClient,
  deepSeekChat,
  deepSeekJSON,
  deepSeekText,
  deepSeekGenerateWithFunctions,
};
