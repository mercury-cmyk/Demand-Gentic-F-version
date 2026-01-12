/**
 * Voice Providers Module
 *
 * Unified exports for the voice provider abstraction layer.
 * Supports OpenAI Realtime and Google Gemini Live APIs with automatic fallback.
 */

// Import types needed for helper functions
import type {
  VoiceProviderType as _VoiceProviderType,
  VoiceProviderConfig as _VoiceProviderConfig,
  IVoiceProvider as _IVoiceProvider,
} from "./voice-provider.interface";

import { VoiceProviderFactory as _VoiceProviderFactory } from "./voice-provider-factory";

// ==================== INTERFACES & TYPES ====================

export {
  // Core interface
  IVoiceProvider,
  BaseVoiceProvider,
  VoiceProviderType,

  // Configuration types
  VoiceProviderConfig,
  AudioFormat,
  TurnDetectionConfig,
  ProviderTool,

  // Event types
  AudioDeltaEvent,
  TranscriptEvent,
  FunctionCallEvent,
  ResponseEvent,
  ErrorEvent,
  RateLimitInfo,
  VoiceProviderEvents,

  // Voice mapping
  OPENAI_TO_GEMINI_VOICE_MAP,
  GEMINI_TO_OPENAI_VOICE_MAP,
  mapVoiceToProvider,

  // Tool conversion
  OpenAITool,
  GeminiTool,
  convertToolsToOpenAI,
  convertToolsToGemini,
} from "./voice-provider.interface";

// ==================== PROVIDERS ====================

export { OpenAIRealtimeProvider } from "./openai-realtime-provider";
export { GeminiLiveProvider } from "./gemini-live-provider";

// ==================== AUDIO TRANSCODING ====================

export {
  AudioTranscoder,
  G711Format,
  AudioFormatType,
  g711ToPcm8k,
  pcm8kToG711,
  g711ToPcm16k,
  pcm24kToG711,
  pcm16kToG711,
  resamplePcm,
} from "./audio-transcoder";

// ==================== GEMINI TYPES ====================

export {
  // Setup types
  BidiGenerateContentSetup,
  GeminiGenerationConfig,
  GeminiToolConfig,
  GeminiFunctionDeclaration,

  // Message types
  BidiGenerateContentClientContent,
  BidiGenerateContentRealtimeInput,
  BidiGenerateContentToolResponse,
  BidiGenerateContentSetupComplete,
  BidiGenerateContentServerContent,
  BidiGenerateContentToolCall,
  GeminiClientMessage,
  GeminiServerMessage,

  // Content types
  GeminiContentPart,
  GeminiInlineData,
  GeminiFunctionCall,

  // Configuration
  GeminiLiveConfig,
  getGeminiLiveEndpoint,
  getVertexModelName,

  // Constants
  GEMINI_VOICES,
  GeminiVoice,
  DEFAULT_VOICE_GENERATION_CONFIG,

  // Type guards
  isSetupComplete,
  isServerContent,
  isToolCall,
  isToolCallCancellation,
  isGeminiError,
  hasAudioPart,
  hasTextPart,
  hasFunctionCall,
  extractAudioData,
  extractText,
  extractFunctionCalls,
} from "./gemini-types";

// ==================== PROVIDER RESOLUTION ====================

export {
  resolveVoiceProvider,
  resolveVoiceProviderSync,
  getOppositeProvider,
  isValidProvider,
  ProviderResolution,
  ProviderSource,
  ResolverParams,
} from "./provider-resolver";

// ==================== FACTORY ====================

export {
  VoiceProviderFactory,
  createProvider,
  createProviderFromConfig,
  createProviderSync,
  createProviderDirect,
  checkProviderHealth,
  checkAllProvidersHealth,
  FactoryOptions,
  CreateResult,
} from "./voice-provider-factory";

// ==================== FALLBACK ====================

export {
  FallbackHandler,
  FallbackOptions,
} from "./fallback-handler";

// ==================== CONVENIENCE ====================

/**
 * Quick helper to create a configured provider
 */
export async function createConfiguredProvider(
  providerType: _VoiceProviderType,
  config: _VoiceProviderConfig
): Promise<_IVoiceProvider> {
  const { createProvider } = await import("./voice-provider-factory");
  const provider = createProvider(providerType);
  await provider.connect();
  await provider.configure(config);
  return provider;
}

/**
 * Default export for easy importing
 */
export default {
  // Factory (main entry point)
  VoiceProviderFactory: _VoiceProviderFactory,

  // Providers
  OpenAIRealtimeProvider: () => import("./openai-realtime-provider").then(m => m.OpenAIRealtimeProvider),
  GeminiLiveProvider: () => import("./gemini-live-provider").then(m => m.GeminiLiveProvider),

  // Utilities
  AudioTranscoder: () => import("./audio-transcoder").then(m => m.AudioTranscoder),
  FallbackHandler: () => import("./fallback-handler").then(m => m.FallbackHandler),

  // Resolution
  resolveProvider: () => import("./provider-resolver").then(m => m.resolveVoiceProvider),
};
