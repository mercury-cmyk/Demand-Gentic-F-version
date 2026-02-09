/**
 * Voice Provider Abstraction Layer
 *
 * Common interface for all voice AI providers (OpenAI Realtime, Gemini Live, etc.)
 * Enables easy switching between providers while maintaining consistent behavior.
 */

import { EventEmitter } from "events";

// ==================== CONFIGURATION TYPES ====================

export type VoiceProviderType = 'openai' | 'google';
export type AudioFormat = 'g711_ulaw' | 'g711_alaw' | 'pcm_16k' | 'pcm_24k';

export interface TurnDetectionConfig {
  type: 'server_vad' | 'semantic_vad' | 'none';
  threshold?: number;
  prefixPaddingMs?: number;
  silenceDurationMs?: number;
}

export interface ProviderTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      minimum?: number;
      maximum?: number;
    }>;
    required?: string[];
  };
}

export interface VoiceProviderConfig {
  // System configuration
  systemPrompt: string;
  voice: string;

  // Audio settings
  inputAudioFormat: AudioFormat;
  outputAudioFormat: AudioFormat;

  // Function calling
  tools: ProviderTool[];
  toolChoice?: 'auto' | 'none' | 'required';

  // Turn detection / VAD
  turnDetection: TurnDetectionConfig;

  // Generation settings
  maxResponseTokens?: number;
  temperature?: number;

  // Transcription settings
  transcriptionEnabled?: boolean;
  transcriptionModel?: string;
  transcriptionPrompt?: string;
}

// ==================== EVENT TYPES ====================

export interface AudioDeltaEvent {
  audioBuffer: Buffer;
  format: AudioFormat;
  durationMs: number;
}

export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
  timestamp: Date;
}

export interface FunctionCallEvent {
  callId: string;
  name: string;
  args: Record<string, any>;
}

export interface ResponseEvent {
  responseId: string;
  itemId?: string;
}

export interface ErrorEvent {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface RateLimitInfo {
  requestsRemaining: number;
  requestsLimit: number;
  tokensRemaining: number;
  tokensLimit: number;
  resetAt: Date | null;
}

// ==================== PROVIDER EVENTS ====================

export interface VoiceProviderEvents {
  // Audio events
  'audio:delta': (event: AudioDeltaEvent) => void;
  'audio:done': () => void;

  // Transcript events
  'transcript:user': (event: TranscriptEvent) => void;
  'transcript:agent': (event: TranscriptEvent) => void;

  // Function calling
  'function:call': (event: FunctionCallEvent) => void;

  // Speech detection
  'speech:started': () => void;
  'speech:stopped': () => void;

  // Response lifecycle
  'response:started': (event: ResponseEvent) => void;
  'response:done': (event: ResponseEvent) => void;
  'response:cancelled': (event: ResponseEvent) => void;

  // Connection lifecycle
  'connected': () => void;
  'disconnected': (reason?: string) => void;
  'reconnecting': (attempt: number) => void;

  // Rate limiting
  'ratelimit:updated': (info: RateLimitInfo) => void;

  // Errors
  'error': (event: ErrorEvent) => void;
}

// ==================== PROVIDER INTERFACE ====================

export interface IVoiceProvider extends EventEmitter {
  /**
   * Provider identifier
   */
  readonly providerName: VoiceProviderType;

  /**
   * Current connection state
   */
  readonly isConnected: boolean;

  /**
   * Whether provider is currently processing a response
   */
  readonly isResponding: boolean;

  /**
   * Connect to the provider's API
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the provider
   */
  disconnect(): Promise<void>;

  /**
   * Configure the session with system prompt, voice, tools, etc.
   * Must be called after connect()
   */
  configure(config: VoiceProviderConfig): Promise<void>;

  /**
   * Send audio data to the provider
   * Audio should be in the format specified during configuration
   */
  sendAudio(audioBuffer: Buffer): void;

  /**
   * Send a text message (for text-based interaction)
   */
  sendTextMessage(text: string): void;

  /**
   * Cancel the current response generation
   */
  cancelResponse(): void;

  /**
   * Truncate audio playback at a specific point (for interruption handling)
   */
  truncateAudio(itemId: string, audioEndMs: number): void;

  /**
   * Respond to a function call from the model
   */
  respondToFunctionCall(callId: string, result: any): void;

  /**
   * Get current rate limit information
   */
  getRateLimits(): RateLimitInfo | null;

  /**
   * Trigger a response from the model
   */
  triggerResponse(): void;
}

// ==================== ABSTRACT BASE CLASS ====================

export abstract class BaseVoiceProvider extends EventEmitter implements IVoiceProvider {
  abstract readonly providerName: VoiceProviderType;

  protected _isConnected: boolean = false;
  protected _isResponding: boolean = false;
  protected config: VoiceProviderConfig | null = null;
  protected rateLimits: RateLimitInfo | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  get isResponding(): boolean {
    return this._isResponding;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract configure(config: VoiceProviderConfig): Promise<void>;
  abstract sendAudio(audioBuffer: Buffer): void;
  abstract sendTextMessage(text: string): void;
  abstract cancelResponse(): void;
  abstract truncateAudio(itemId: string, audioEndMs: number): void;
  abstract respondToFunctionCall(callId: string, result: any): void;
  abstract triggerResponse(): void;

  getRateLimits(): RateLimitInfo | null {
    return this.rateLimits;
  }

  protected emitError(code: string, message: string, recoverable: boolean = true): void {
    this.emit('error', { code, message, recoverable });
  }

  protected setConnected(connected: boolean): void {
    this._isConnected = connected;
    if (connected) {
      this.emit('connected');
    } else {
      this.emit('disconnected');
    }
  }

  protected setResponding(responding: boolean, responseId?: string): void {
    const wasResponding = this._isResponding;
    this._isResponding = responding;

    if (responding && !wasResponding && responseId) {
      this.emit('response:started', { responseId });
    } else if (!responding && wasResponding && responseId) {
      this.emit('response:done', { responseId });
    }
  }
}

// ==================== VOICE MAPPING ====================

// OpenAI voices: alloy, echo, fable, nova, shimmer, onyx (legacy), plus cedar & marin (new, most natural)
// Cedar: warm, confident, engaging | Marin: calm, professional, soothing
export const OPENAI_TO_GEMINI_VOICE_MAP: Record<string, string> = {
  'alloy': 'Aoede',
  'echo': 'Charon',
  'fable': 'Fenrir',
  'nova': 'Kore',
  'shimmer': 'Puck',
  'onyx': 'Gacrux',
  // New OpenAI voices with most natural speech (gpt-realtime exclusive)
  'cedar': 'Sulafat',   // Cedar: warm, confident - maps to Sulafat (warm)
  'marin': 'Schedar',   // Marin: calm, professional - maps to Schedar (even)
};

// Official Gemini TTS voices (30 total) - all real Google voices
export const VALID_GEMINI_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'
];

export const GEMINI_TO_OPENAI_VOICE_MAP: Record<string, string> = {
  // Primary mappings
  'Aoede': 'alloy',
  'Charon': 'echo',
  'Fenrir': 'fable',
  'Kore': 'nova',
  'Puck': 'shimmer',
  'Gacrux': 'onyx',
  'Sulafat': 'cedar',
  'Schedar': 'marin',
  // Secondary mappings for all other Gemini voices
  'Zephyr': 'alloy',
  'Leda': 'nova',
  'Orus': 'echo',
  'Callirrhoe': 'alloy',
  'Autonoe': 'nova',
  'Enceladus': 'echo',
  'Iapetus': 'marin',
  'Umbriel': 'alloy',
  'Algieba': 'cedar',
  'Despina': 'nova',
  'Erinome': 'nova',
  'Algenib': 'onyx',
  'Rasalgethi': 'echo',
  'Laomedeia': 'shimmer',
  'Achernar': 'nova',
  'Alnilam': 'fable',
  'Pulcherrima': 'fable',
  'Achird': 'alloy',
  'Zubenelgenubi': 'alloy',
  'Vindemiatrix': 'nova',
  'Sadachbia': 'shimmer',
  'Sadaltager': 'echo',
};

export function mapVoiceToProvider(voice: string, targetProvider: VoiceProviderType): string {
  if (targetProvider === 'google') {
    // If already a valid Gemini voice, return as-is (case-insensitive)
    const matchedVoice = VALID_GEMINI_VOICES.find(v => v.toLowerCase() === voice.toLowerCase());
    if (matchedVoice) {
      return matchedVoice;
    }
    // Map from OpenAI voice
    const mapped = OPENAI_TO_GEMINI_VOICE_MAP[voice.toLowerCase()];
    if (mapped) return mapped;
    // Default to Kore (firm, professional)
    console.warn(`[VoiceMapper] Unknown voice "${voice}" - defaulting to Kore`);
    return 'Kore';
  } else {
    // If already an OpenAI voice, return as-is
    if (Object.keys(OPENAI_TO_GEMINI_VOICE_MAP).includes(voice.toLowerCase())) {
      return voice.toLowerCase();
    }
    // Map from Gemini voice
    return GEMINI_TO_OPENAI_VOICE_MAP[voice] || 'nova';
  }
}

// ==================== TOOL CONVERSION ====================

export interface OpenAITool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface GeminiTool {
  function_declarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
}

export function convertToolsToOpenAI(tools: ProviderTool[]): OpenAITool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export function convertToolsToGemini(tools: ProviderTool[]): GeminiTool {
  return {
    function_declarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  };
}
