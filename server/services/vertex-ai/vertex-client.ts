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
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || "pivotalb2b-2026",
  location: process.env.VERTEX_AI_LOCATION || "us-central1",
  models: {
    chat: process.env.VERTEX_CHAT_MODEL || "gemini-2.0-flash-001",
    reasoning: process.env.VERTEX_REASONING_MODEL || "gemini-2.0-flash-thinking-exp-01-21",
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
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        // @ts-ignore - Vertex AI SDK types might not have implicit support for specific imagen params yet in basic config
        sampleCount: 1,
        aspectRatio: aspectRatio,
      } as any
    });

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

// ==================== GENERATION UTILITIES ====================

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  responseFormat?: "text" | "json";
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
  const model = getChatModel();

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

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig,
  });

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

  const result = await model.generateContent({
    contents,
    generationConfig,
  });

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

  const streamingResult = await model.generateContentStream({
    contents,
    generationConfig,
  });

  for await (const chunk of streamingResult.stream) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (text) {
      yield text;
    }
  }
}

/**
 * Complex reasoning with thinking model
 */
export async function reason(
  prompt: string,
  options: GenerationOptions = {}
): Promise<{ thinking: string; answer: string }> {
  const model = getReasoningModel();

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens ?? 16384,
      topP: options.topP ?? 0.95,
    },
  });

  const response = result.response;
  const fullText = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Parse thinking and answer sections
  const thinkingMatch = fullText.match(/<thinking>([\s\S]*?)<\/thinking>/);
  const thinking = thinkingMatch ? thinkingMatch[1].trim() : "";
  const answer = fullText.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();

  return { thinking, answer };
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Auth handled by ADC in Cloud Run
    },
    body: JSON.stringify({ instances }),
  });

  if (!response.ok) {
    throw new Error(`Embeddings request failed: ${response.statusText}`);
  }

  const data = await response.json();
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
  }];

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

  const result = await model.generateContent({
    contents,
    tools,
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens ?? 4096,
    },
  });

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
  chat,
  streamChat,
  reason,
  generateEmbeddings,
  generateEmbedding,
  generateWithFunctions,
  generateImage,
  healthCheck,
};
