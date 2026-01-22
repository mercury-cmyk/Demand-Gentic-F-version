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
  deepSeekChat,
  deepSeekGenerateWithFunctions,
};
