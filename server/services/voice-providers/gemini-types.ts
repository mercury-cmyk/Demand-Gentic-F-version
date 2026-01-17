/**
 * Gemini 2.0 Live API Types
 *
 * Type definitions for the Gemini Live API WebSocket protocol.
 * Reference: https://ai.google.dev/gemini-api/docs/live
 *
 * The Live API uses a bidirectional streaming protocol over WebSocket.
 */

// ==================== SETUP MESSAGES (Client -> Server) ====================

/**
 * Initial setup message sent when connecting to Gemini Live API
 */
export interface BidiGenerateContentSetup {
  setup: {
    /**
     * Model to use (e.g., 'models/gemini-2.0-flash-exp')
     * For Vertex AI: 'projects/{project}/locations/{location}/publishers/google/models/{model}'
     */
    model: string;

    /**
     * Generation configuration
     */
    generation_config?: GeminiGenerationConfig;

    /**
     * System instruction (system prompt)
     */
    system_instruction?: {
      parts: Array<{ text: string }>;
    };

    /**
     * Tools available to the model
     */
    tools?: GeminiToolConfig[];
  };
}

export interface GeminiGenerationConfig {
  /**
   * Response modalities: ['TEXT'], ['AUDIO'], or ['TEXT', 'AUDIO']
   */
  response_modalities?: ('TEXT' | 'AUDIO')[];

  /**
   * Speech configuration for audio output
   */
  speech_config?: {
    voice_config?: {
      prebuilt_voice_config?: {
        /**
         * Voice name: 'Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck'
         */
        voice_name: string;
      };
    };
  };

  /**
   * Temperature (0.0 - 2.0)
   */
  temperature?: number;

  /**
   * Top-p sampling
   */
  top_p?: number;

  /**
   * Top-k sampling
   */
  top_k?: number;

  /**
   * Maximum output tokens
   */
  max_output_tokens?: number;

  /**
   * Stop sequences
   */
  stop_sequences?: string[];
}

export interface GeminiToolConfig {
  /**
   * Function declarations for tool use
   */
  function_declarations?: GeminiFunctionDeclaration[];

  /**
   * Code execution capability
   */
  code_execution?: {};

  /**
   * Google Search grounding
   */
  google_search?: {};
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: 'object';
    properties: Record<string, GeminiParameterSchema>;
    required?: string[];
  };
}

export interface GeminiParameterSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: GeminiParameterSchema;
  properties?: Record<string, GeminiParameterSchema>;
  minimum?: number;
  maximum?: number;
}

// ==================== CLIENT MESSAGES (Client -> Server) ====================

/**
 * Real-time audio/text input
 */
export interface BidiGenerateContentClientContent {
  client_content: {
    /**
     * Turn complete signal - indicates user finished speaking
     */
    turn_complete?: boolean;

    /**
     * Content parts (text or inline audio)
     */
    turns?: Array<{
      role: 'user';
      parts: GeminiContentPart[];
    }>;
  };
}

/**
 * Real-time audio input (streaming)
 */
export interface BidiGenerateContentRealtimeInput {
  realtime_input: {
    /**
     * Audio chunks for streaming input
     */
    media_chunks?: Array<{
      /**
       * MIME type: 'audio/pcm' for raw PCM
       */
      mime_type: 'audio/pcm';
      /**
       * Base64 encoded PCM data (16kHz, 16-bit, mono, little-endian)
       */
      data: string;
    }>;
  };
}

/**
 * Tool response message
 */
export interface BidiGenerateContentToolResponse {
  tool_response: {
    function_responses: Array<{
      /**
       * ID of the function call being responded to
       */
      id: string;
      /**
       * Name of the function
       */
      name: string;
      /**
       * Response content
       */
      response: {
        output?: any;
        error?: string;
      };
    }>;
  };
}

// ==================== SERVER MESSAGES (Server -> Client) ====================

/**
 * Setup complete acknowledgment
 */
export interface BidiGenerateContentSetupComplete {
  setup_complete: {};
}

/**
 * Server content (model turn)
 */
export interface BidiGenerateContentServerContent {
  server_content: {
    /**
     * Whether the model is currently generating
     */
    model_turn?: {
      parts: GeminiContentPart[];
    };

    /**
     * Indicates end of turn
     */
    turn_complete?: boolean;

    /**
     * Indicates the response was interrupted
     */
    interrupted?: boolean;

    /**
     * Grounding metadata (if using Google Search)
     */
    grounding_metadata?: any;
  };
}

/**
 * Tool call from the model
 */
export interface BidiGenerateContentToolCall {
  tool_call: {
    function_calls: Array<{
      /**
       * Unique ID for this function call
       */
      id: string;
      /**
       * Function name
       */
      name: string;
      /**
       * Function arguments as JSON object
       */
      args: Record<string, any>;
    }>;
  };
}

/**
 * Tool call cancellation
 */
export interface BidiGenerateContentToolCallCancellation {
  tool_call_cancellation: {
    /**
     * IDs of cancelled function calls
     */
    ids: string[];
  };
}

// ==================== CONTENT PARTS ====================

export type GeminiContentPart =
  | { text: string }
  | { inline_data: GeminiInlineData }
  | { function_call: GeminiFunctionCall }
  | { function_response: GeminiFunctionResponse }
  | { executable_code: { language: string; code: string } }
  | { code_execution_result: { outcome: string; output: string } };

export interface GeminiInlineData {
  /**
   * MIME type of the data
   * For audio: 'audio/pcm' (output is 24kHz, 16-bit, mono, little-endian)
   */
  mime_type: string;
  /**
   * Base64 encoded data
   */
  data: string;
}

export interface GeminiFunctionCall {
  /**
   * Unique ID for this call
   */
  id?: string;
  /**
   * Function name
   */
  name: string;
  /**
   * Arguments as JSON object
   */
  args: Record<string, any>;
}

export interface GeminiFunctionResponse {
  name: string;
  response: any;
}

// ==================== UNION TYPES ====================

/**
 * All possible client messages
 */
export type GeminiClientMessage =
  | BidiGenerateContentSetup
  | BidiGenerateContentClientContent
  | BidiGenerateContentRealtimeInput
  | BidiGenerateContentToolResponse;

/**
 * All possible server messages
 */
export type GeminiServerMessage =
  | BidiGenerateContentSetupComplete
  | BidiGenerateContentServerContent
  | BidiGenerateContentToolCall
  | BidiGenerateContentToolCallCancellation;

// ==================== CONNECTION CONFIGURATION ====================

/**
 * Gemini Live API endpoint configuration
 */
export interface GeminiLiveConfig {
  /**
   * Google Cloud Project ID
   */
  projectId: string;

  /**
   * Vertex AI location (e.g., 'us-central1')
   */
  location: string;

  /**
   * Model name (e.g., 'gemini-2.0-flash-exp')
   */
  model: string;

  /**
   * API key (for Google AI Studio) or use ADC for Vertex AI
   */
  apiKey?: string;

  /**
   * Use Vertex AI endpoint (enterprise) vs Google AI (consumer)
   */
  useVertexAI: boolean;
}

/**
 * Get WebSocket URL for Gemini Live API
 */
export function getGeminiLiveEndpoint(config: GeminiLiveConfig): string {
  if (config.useVertexAI) {
    // Vertex AI endpoint (enterprise)
    return `wss://${config.location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
  } else {
    // Google AI endpoint (consumer) - requires API key
    // Use v1beta as per https://ai.google.dev/api/live
    return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${config.apiKey}`;
  }
}

/**
 * Get model resource name for Vertex AI
 */
export function getVertexModelName(config: GeminiLiveConfig): string {
  return `projects/${config.projectId}/locations/${config.location}/publishers/google/models/${config.model}`;
}

// ==================== VOICE CONSTANTS ====================

/**
 * Available Gemini voices for audio output
 * These are native audio voices with natural prosody and emotion
 */
export const GEMINI_VOICES = {
  // Original voices (Gemini 2.0)
  AOEDE: 'Aoede',     // Bright and warm
  CHARON: 'Charon',   // Deep and authoritative
  FENRIR: 'Fenrir',   // Calm and measured
  KORE: 'Kore',       // Soft and friendly (default)
  PUCK: 'Puck',       // Light and expressive

  // Newer voices (Gemini 2.5+ Native Audio)
  ORION: 'Orion',     // Professional, confident male voice
  VEGA: 'Vega',       // Warm, engaging voice (best for sales)
  PEGASUS: 'Pegasus', // Calm, professional (ideal for B2B)
  URSA: 'Ursa',       // Deep, trustworthy voice
  NOVA: 'Nova',       // Energetic, friendly voice
  DIPPER: 'Dipper',   // Clear, articulate voice
  CAPELLA: 'Capella', // Melodic, pleasant voice
  ORBIT: 'Orbit',     // Neutral, versatile voice
  LYRA: 'Lyra',       // Soft, soothing voice
  ECLIPSE: 'Eclipse', // Bold, authoritative voice
} as const;

export type GeminiVoice = typeof GEMINI_VOICES[keyof typeof GEMINI_VOICES];

/**
 * Detailed voice descriptions for UI and agent configuration
 */
export const GEMINI_VOICE_DETAILS: Record<GeminiVoice, {
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
  style: string[];
  bestFor: string[];
}> = {
  'Aoede': {
    name: 'Aoede',
    description: 'Bright and warm voice with natural enthusiasm',
    gender: 'female',
    style: ['friendly', 'warm', 'engaging'],
    bestFor: ['customer support', 'outreach', 'general conversation'],
  },
  'Charon': {
    name: 'Charon',
    description: 'Deep and authoritative voice that commands attention',
    gender: 'male',
    style: ['authoritative', 'deep', 'professional'],
    bestFor: ['executive calls', 'serious topics', 'B2B sales'],
  },
  'Fenrir': {
    name: 'Fenrir',
    description: 'Calm and measured voice for thoughtful conversations',
    gender: 'male',
    style: ['calm', 'measured', 'thoughtful'],
    bestFor: ['consulting', 'technical discussions', 'complex topics'],
  },
  'Kore': {
    name: 'Kore',
    description: 'Soft and friendly voice - great default for most use cases',
    gender: 'female',
    style: ['soft', 'friendly', 'approachable'],
    bestFor: ['general purpose', 'warm outreach', 'customer service'],
  },
  'Puck': {
    name: 'Puck',
    description: 'Light and expressive voice with natural energy',
    gender: 'neutral',
    style: ['expressive', 'light', 'dynamic'],
    bestFor: ['creative content', 'entertainment', 'casual calls'],
  },
  'Orion': {
    name: 'Orion',
    description: 'Professional and confident male voice',
    gender: 'male',
    style: ['professional', 'confident', 'clear'],
    bestFor: ['B2B sales', 'professional services', 'enterprise'],
  },
  'Vega': {
    name: 'Vega',
    description: 'Warm and engaging voice - excellent for building rapport',
    gender: 'female',
    style: ['warm', 'engaging', 'personable'],
    bestFor: ['sales calls', 'relationship building', 'lead qualification'],
  },
  'Pegasus': {
    name: 'Pegasus',
    description: 'Calm and professional voice - ideal for business contexts',
    gender: 'neutral',
    style: ['calm', 'professional', 'trustworthy'],
    bestFor: ['B2B outreach', 'financial services', 'consulting'],
  },
  'Ursa': {
    name: 'Ursa',
    description: 'Deep and trustworthy voice with gravitas',
    gender: 'male',
    style: ['deep', 'trustworthy', 'authoritative'],
    bestFor: ['executive conversations', 'legal', 'insurance'],
  },
  'Nova': {
    name: 'Nova',
    description: 'Energetic and friendly voice with natural enthusiasm',
    gender: 'female',
    style: ['energetic', 'friendly', 'upbeat'],
    bestFor: ['outbound sales', 'marketing', 'events'],
  },
  'Dipper': {
    name: 'Dipper',
    description: 'Clear and articulate voice with excellent diction',
    gender: 'male',
    style: ['clear', 'articulate', 'precise'],
    bestFor: ['technical sales', 'product demos', 'training'],
  },
  'Capella': {
    name: 'Capella',
    description: 'Melodic and pleasant voice with natural flow',
    gender: 'female',
    style: ['melodic', 'pleasant', 'smooth'],
    bestFor: ['customer experience', 'hospitality', 'healthcare'],
  },
  'Orbit': {
    name: 'Orbit',
    description: 'Neutral and versatile voice suitable for any context',
    gender: 'neutral',
    style: ['neutral', 'versatile', 'balanced'],
    bestFor: ['general purpose', 'diverse audiences', 'surveys'],
  },
  'Lyra': {
    name: 'Lyra',
    description: 'Soft and soothing voice for gentle conversations',
    gender: 'female',
    style: ['soft', 'soothing', 'gentle'],
    bestFor: ['support calls', 'sensitive topics', 'healthcare'],
  },
  'Eclipse': {
    name: 'Eclipse',
    description: 'Bold and authoritative voice that drives action',
    gender: 'male',
    style: ['bold', 'authoritative', 'commanding'],
    bestFor: ['urgent calls', 'closing deals', 'executive outreach'],
  },
};

/**
 * Get recommended voice for a use case
 */
export function getRecommendedVoice(useCase: string): GeminiVoice {
  const useCaseMap: Record<string, GeminiVoice> = {
    'sales': 'Vega',
    'b2b': 'Pegasus',
    'support': 'Kore',
    'executive': 'Charon',
    'technical': 'Fenrir',
    'outreach': 'Nova',
    'default': 'Kore',
  };
  return useCaseMap[useCase.toLowerCase()] || useCaseMap['default'];
}

/**
 * Default generation config for voice calls
 */
export const DEFAULT_VOICE_GENERATION_CONFIG: GeminiGenerationConfig = {
  response_modalities: ['AUDIO'],
  speech_config: {
    voice_config: {
      prebuilt_voice_config: {
        voice_name: GEMINI_VOICES.KORE,
      },
    },
  },
  temperature: 0.7,
  max_output_tokens: 4096,
};

// ==================== ERROR TYPES ====================

export interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
    details?: any[];
  };
}

export function isGeminiError(message: any): message is GeminiError {
  return message && typeof message === 'object' && 'error' in message;
}

// ==================== MESSAGE TYPE GUARDS ====================

export function isSetupComplete(msg: any): msg is BidiGenerateContentSetupComplete {
  return 'setup_complete' in msg || 'setupComplete' in msg;
}

export function isServerContent(msg: any): msg is BidiGenerateContentServerContent {
  return 'server_content' in msg || 'serverContent' in msg;
}

export function isToolCall(msg: any): msg is BidiGenerateContentToolCall {
  return 'tool_call' in msg || 'toolCall' in msg;
}

export function isToolCallCancellation(msg: any): msg is BidiGenerateContentToolCallCancellation {
  // Check for both snake_case and camelCase
  return 'tool_call_cancellation' in msg || 'toolCallCancellation' in msg;
}

export function hasAudioPart(parts: any[]): boolean {
  return parts.some(part => 
    ('inline_data' in part && part.inline_data.mime_type.startsWith('audio/')) ||
    ('inlineData' in part && part.inlineData.mimeType.startsWith('audio/'))
  );
}

export function hasTextPart(parts: any[]): boolean {
  return parts.some(part => 'text' in part);
}

export function hasFunctionCall(parts: any[]): boolean {
  return parts.some(part => 'function_call' in part || 'functionCall' in part);
}

export function extractAudioData(parts: any[]): string | null {
  for (const part of parts) {
    if ('inline_data' in part && part.inline_data.mime_type.startsWith('audio/')) {
      return part.inline_data.data;
    }
    if ('inlineData' in part && part.inlineData.mimeType.startsWith('audio/')) {
      return part.inlineData.data;
    }
  }
  return null;
}

export function extractText(parts: GeminiContentPart[]): string {
  return parts
    .filter((part): part is { text: string } => 'text' in part)
    .map(part => part.text)
    .join('');
}

export function extractFunctionCalls(parts: any[]): GeminiFunctionCall[] {
  return parts
    .filter((part): boolean => 'function_call' in part || 'functionCall' in part)
    .map(part => part.function_call || part.functionCall);
}
