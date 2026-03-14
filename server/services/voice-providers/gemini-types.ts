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
     * Model to use (e.g., 'models/gemini-2.5-flash-native-audio-latest')
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

    /**
     * Enable transcription of AI audio output (agent speech → text).
     * Pass empty object {} to enable with defaults.
     * Required for native-audio models that only allow a single response modality.
     */
    output_audio_transcription?: Record<string, never>;

    /**
     * Enable transcription of user audio input (caller speech → text).
     * Pass empty object {} to enable with defaults.
     */
    input_audio_transcription?: Record<string, never>;

    /**
     * Safety settings to control content filtering thresholds.
     * Each entry specifies a harm category and the blocking threshold.
     */
    safety_settings?: GeminiSafetySetting[];

    /**
     * Enable affective dialog for natural emotional adaptation.
     * When true, the model adapts its tone/emotion to match conversational context.
     */
    enable_affective_dialog?: boolean;
  };
}

/**
 * Safety setting for a single harm category.
 * See: https://ai.google.dev/gemini-api/docs/safety-settings
 */
export interface GeminiSafetySetting {
  category: GeminiHarmCategory;
  threshold: GeminiHarmBlockThreshold;
}

export type GeminiHarmCategory =
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  | 'HARM_CATEGORY_CIVIC_INTEGRITY';

export type GeminiHarmBlockThreshold =
  | 'BLOCK_NONE'
  | 'BLOCK_ONLY_HIGH'
  | 'BLOCK_MEDIUM_AND_ABOVE'
  | 'BLOCK_LOW_AND_ABOVE';

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

  /**
   * Thinking configuration for enhanced reasoning.
   * thinking_budget controls how many tokens the model can use for internal reasoning.
   * Higher budgets allow deeper analysis of complex objections/scenarios.
   */
  thinking_config?: {
    thinking_budget?: number;
  };
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
   * Model name (e.g., 'gemini-2.5-flash-native-audio-latest')
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
 * Official Gemini TTS Voices (30 total)
 * From Google's documentation: https://ai.google.dev/gemini-api/docs/speech-generation
 * These are the REAL voices supported by Gemini Live API
 */
export const GEMINI_VOICES = {
  // Primary B2B Sales voices
  KORE: 'Kore',           // Firm - Confident and direct
  FENRIR: 'Fenrir',       // Excitable - Enthusiastic and persuasive
  CHARON: 'Charon',       // Informative - Trustworthy and knowledgeable
  AOEDE: 'Aoede',         // Breezy - Light and approachable
  PUCK: 'Puck',           // Upbeat - Energetic and engaging
  
  // Professional voices
  ZEPHYR: 'Zephyr',       // Bright - Articulate and professional
  LEDA: 'Leda',           // Youthful - Modern and relatable
  ORUS: 'Orus',           // Firm - Reliable and trustworthy
  SULAFAT: 'Sulafat',     // Warm - Empathetic and personable
  GACRUX: 'Gacrux',       // Mature - Seasoned and credible
  SCHEDAR: 'Schedar',     // Even - Calm and composed
  ACHIRD: 'Achird',       // Friendly - Welcoming and warm
  
  // Specialized voices
  SADALTAGER: 'Sadaltager',     // Knowledgeable - Authoritative consultant
  PULCHERRIMA: 'Pulcherrima',   // Forward - Bold and assertive
  IAPETUS: 'Iapetus',           // Clear - Technical and accurate
  ERINOME: 'Erinome',           // Clear - Professional presenter
  VINDEMIATRIX: 'Vindemiatrix', // Gentle - Calming presence
  ACHERNAR: 'Achernar',         // Soft - Comforting and kind
  
  // Dynamic voices
  SADACHBIA: 'Sadachbia',       // Lively - High-energy and exciting
  LAOMEDEIA: 'Laomedeia',       // Upbeat - Optimistic and motivating
  
  // Character voices
  ENCELADUS: 'Enceladus',       // Breathy - Thoughtful whisper
  ALGENIB: 'Algenib',           // Gravelly - Distinctive and memorable
  RASALGETHI: 'Rasalgethi',     // Informative - Teacher-like clarity
  ALNILAM: 'Alnilam',           // Firm - Strong and commanding
} as const;

export type GeminiVoice = typeof GEMINI_VOICES[keyof typeof GEMINI_VOICES];

/**
 * Detailed voice descriptions for UI and agent configuration
 * Based on official Google Gemini TTS documentation
 */
export const GEMINI_VOICE_DETAILS: Record<GeminiVoice, {
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
  style: string[];
  bestFor: string[];
}> = {
  'Kore': {
    name: 'Kore',
    description: 'Firm and professional voice - confident and direct',
    gender: 'female',
    style: ['firm', 'professional', 'confident'],
    bestFor: ['executive outreach', 'B2B sales', 'leadership'],
  },
  'Fenrir': {
    name: 'Fenrir',
    description: 'Excitable and energetic voice - enthusiastic and persuasive',
    gender: 'male',
    style: ['excitable', 'energetic', 'persuasive'],
    bestFor: ['enterprise sales', 'product launches', 'excitement'],
  },
  'Charon': {
    name: 'Charon',
    description: 'Informative and authoritative voice - trustworthy and knowledgeable',
    gender: 'male',
    style: ['informative', 'authoritative', 'knowledgeable'],
    bestFor: ['technical decision makers', 'consulting', 'expertise'],
  },
  'Aoede': {
    name: 'Aoede',
    description: 'Breezy and friendly voice - light and approachable',
    gender: 'female',
    style: ['breezy', 'friendly', 'light'],
    bestFor: ['mid-market outreach', 'warm introductions', 'relationship building'],
  },
  'Puck': {
    name: 'Puck',
    description: 'Upbeat and lively voice - energetic and engaging',
    gender: 'male',
    style: ['upbeat', 'lively', 'engaging'],
    bestFor: ['startups', 'SMB', 'creative pitches'],
  },
  'Zephyr': {
    name: 'Zephyr',
    description: 'Bright and clear voice - articulate and professional',
    gender: 'male',
    style: ['bright', 'clear', 'articulate'],
    bestFor: ['financial services', 'professional services', 'clarity'],
  },
  'Leda': {
    name: 'Leda',
    description: 'Youthful and fresh voice - modern and relatable',
    gender: 'female',
    style: ['youthful', 'fresh', 'modern'],
    bestFor: ['tech companies', 'startups', 'innovation'],
  },
  'Orus': {
    name: 'Orus',
    description: 'Firm and steady voice - reliable and trustworthy',
    gender: 'male',
    style: ['firm', 'steady', 'reliable'],
    bestFor: ['healthcare', 'education', 'trust-building'],
  },
  'Sulafat': {
    name: 'Sulafat',
    description: 'Warm and caring voice - empathetic and personable',
    gender: 'female',
    style: ['warm', 'caring', 'empathetic'],
    bestFor: ['customer success', 'support', 'relationship management'],
  },
  'Gacrux': {
    name: 'Gacrux',
    description: 'Mature and experienced voice - seasoned and credible',
    gender: 'male',
    style: ['mature', 'experienced', 'credible'],
    bestFor: ['C-suite conversations', 'strategic discussions', 'authority'],
  },
  'Schedar': {
    name: 'Schedar',
    description: 'Even and balanced voice - calm and composed',
    gender: 'male',
    style: ['even', 'balanced', 'composed'],
    bestFor: ['complex negotiations', 'sensitive topics', 'stability'],
  },
  'Achird': {
    name: 'Achird',
    description: 'Friendly and welcoming voice - warm and approachable',
    gender: 'female',
    style: ['friendly', 'welcoming', 'warm'],
    bestFor: ['first contact calls', 'introductions', 'rapport building'],
  },
  'Sadaltager': {
    name: 'Sadaltager',
    description: 'Knowledgeable and expert voice - authoritative consultant',
    gender: 'male',
    style: ['knowledgeable', 'expert', 'authoritative'],
    bestFor: ['advisory calls', 'consulting', 'thought leadership'],
  },
  'Pulcherrima': {
    name: 'Pulcherrima',
    description: 'Forward and confident voice - bold and assertive',
    gender: 'female',
    style: ['forward', 'confident', 'assertive'],
    bestFor: ['closing calls', 'urgency', 'decision-making'],
  },
  'Iapetus': {
    name: 'Iapetus',
    description: 'Clear and precise voice - technical and accurate',
    gender: 'male',
    style: ['clear', 'precise', 'technical'],
    bestFor: ['product demos', 'technical sales', 'accuracy'],
  },
  'Erinome': {
    name: 'Erinome',
    description: 'Clear and articulate voice - professional presenter',
    gender: 'female',
    style: ['clear', 'articulate', 'professional'],
    bestFor: ['presentations', 'webinars', 'formal settings'],
  },
  'Vindemiatrix': {
    name: 'Vindemiatrix',
    description: 'Gentle and soft voice - calming presence',
    gender: 'female',
    style: ['gentle', 'soft', 'calming'],
    bestFor: ['sensitive topics', 'healthcare', 'support'],
  },
  'Achernar': {
    name: 'Achernar',
    description: 'Soft and reassuring voice - comforting and kind',
    gender: 'female',
    style: ['soft', 'reassuring', 'kind'],
    bestFor: ['support calls', 'customer care', 'empathy'],
  },
  'Sadachbia': {
    name: 'Sadachbia',
    description: 'Lively and dynamic voice - high-energy and exciting',
    gender: 'female',
    style: ['lively', 'dynamic', 'exciting'],
    bestFor: ['product launches', 'events', 'excitement'],
  },
  'Laomedeia': {
    name: 'Laomedeia',
    description: 'Upbeat and positive voice - optimistic and motivating',
    gender: 'female',
    style: ['upbeat', 'positive', 'motivating'],
    bestFor: ['follow-up calls', 'encouragement', 'positivity'],
  },
  'Enceladus': {
    name: 'Enceladus',
    description: 'Breathy and intimate voice - thoughtful whisper',
    gender: 'male',
    style: ['breathy', 'intimate', 'thoughtful'],
    bestFor: ['confidential discussions', 'private matters', 'intimacy'],
  },
  'Algenib': {
    name: 'Algenib',
    description: 'Gravelly and deep voice - distinctive and memorable',
    gender: 'male',
    style: ['gravelly', 'deep', 'distinctive'],
    bestFor: ['brand differentiation', 'unique presence', 'memorability'],
  },
  'Rasalgethi': {
    name: 'Rasalgethi',
    description: 'Informative and educational voice - teacher-like clarity',
    gender: 'male',
    style: ['informative', 'educational', 'clear'],
    bestFor: ['training calls', 'education', 'explanation'],
  },
  'Alnilam': {
    name: 'Alnilam',
    description: 'Firm and decisive voice - strong and commanding',
    gender: 'male',
    style: ['firm', 'decisive', 'commanding'],
    bestFor: ['leadership messaging', 'authority', 'decisiveness'],
  },
};

/**
 * Get recommended voice for a use case
 */
export function getRecommendedVoice(useCase: string): GeminiVoice {
  const useCaseMap: Record<string, GeminiVoice> = {
    'sales': 'Fenrir',        // Excitable, persuasive
    'b2b': 'Kore',            // Firm, professional
    'support': 'Sulafat',     // Warm, caring
    'executive': 'Charon',    // Informative, authoritative
    'technical': 'Iapetus',   // Clear, precise
    'outreach': 'Aoede',      // Breezy, friendly
    'closing': 'Pulcherrima', // Forward, assertive
    'consulting': 'Sadaltager', // Knowledgeable, expert
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
