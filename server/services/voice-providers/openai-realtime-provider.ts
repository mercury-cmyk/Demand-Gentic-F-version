/**
 * OpenAI Realtime API Voice Provider
 *
 * Implements the IVoiceProvider interface for OpenAI's Realtime API.
 * Handles WebSocket connection, audio streaming, and function calling.
 */

import WebSocket from "ws";
import {
  BaseVoiceProvider,
  VoiceProviderConfig,
  AudioFormat,
  convertToolsToOpenAI,
  mapVoiceToProvider,
  RateLimitInfo,
} from "./voice-provider.interface";
import { AudioTranscoder } from "./audio-transcoder";

const LOG_PREFIX = "[OpenAI-Provider]";

// ==================== OPENAI MESSAGE TYPES ====================

interface OpenAISessionConfig {
  type: 'session.update';
  session: {
    modalities: string[];
    instructions: string;
    voice: string;
    input_audio_format: string;
    output_audio_format: string;
    input_audio_transcription?: {
      model: string;
      prompt?: string;
    };
    turn_detection: {
      type: string;
      threshold?: number;
      prefix_padding_ms?: number;
      silence_duration_ms?: number;
    };
    tools: any[];
    tool_choice: string;
    temperature: number;
    max_response_output_tokens: number;
  };
}

interface OpenAIAudioAppend {
  type: 'input_audio_buffer.append';
  audio: string;
}

interface OpenAIResponseCreate {
  type: 'response.create';
  response?: {
    modalities?: string[];
    instructions?: string;
  };
}

interface OpenAIFunctionOutput {
  type: 'conversation.item.create';
  item: {
    type: 'function_call_output';
    call_id: string;
    output: string;
  };
}

interface OpenAIResponseCancel {
  type: 'response.cancel';
}

interface OpenAIInputAudioBufferClear {
  type: 'input_audio_buffer.clear';
}

interface OpenAIConversationItemTruncate {
  type: 'conversation.item.truncate';
  item_id: string;
  content_index: number;
  audio_end_ms: number;
}

// ==================== OPENAI REALTIME PROVIDER ====================

export class OpenAIRealtimeProvider extends BaseVoiceProvider {
  readonly providerName = 'openai' as const;

  private ws: WebSocket | null = null;
  private transcoder: AudioTranscoder | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentResponseId: string | null = null;
  private currentItemId: string | null = null;
  private pendingConfig: VoiceProviderConfig | null = null;

  // Audio tracking
  private audioBytesSent: number = 0;
  private audioPlaybackMs: number = 0;

  async connect(): Promise<void> {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Use the latest GA gpt-realtime model for most natural, human-like speech
    // gpt-realtime has better natural speech, instruction following, and tool calling
    const url = process.env.OPENAI_REALTIME_MODEL_URL ||
      "wss://api.openai.com/v1/realtime?model=gpt-realtime";

    return new Promise((resolve, reject) => {
      console.log(`${LOG_PREFIX} Connecting to OpenAI Realtime API...`);

      this.ws = new WebSocket(url, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      // Connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          console.error(`${LOG_PREFIX} Connection timeout`);
          this.ws.close();
          reject(new Error("OpenAI connection timeout"));
        }
      }, 10000);

      this.ws.on("open", () => {
        clearTimeout(this.connectionTimeout!);
        console.log(`${LOG_PREFIX} Connected to OpenAI Realtime API`);
        this.setConnected(true);

        // If we have pending config, send it now
        if (this.pendingConfig) {
          this.sendSessionConfig(this.pendingConfig);
          this.pendingConfig = null;
        }

        resolve();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("close", (code, reason) => {
        console.log(`${LOG_PREFIX} WebSocket closed: ${code} - ${reason}`);
        this.setConnected(false);
        this.ws = null;
      });

      this.ws.on("error", (error) => {
        console.error(`${LOG_PREFIX} WebSocket error:`, error);
        this.emitError('connection_error', error.message, false);
        reject(error);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setConnected(false);
  }

  async configure(config: VoiceProviderConfig): Promise<void> {
    this.config = config;

    // Initialize transcoder based on audio format
    const format = config.inputAudioFormat === 'g711_alaw' ? 'g711_alaw' : 'g711_ulaw';
    this.transcoder = new AudioTranscoder(format);

    // If already connected, send config immediately
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSessionConfig(config);
    } else {
      // Store config to send when connected
      this.pendingConfig = config;
    }
  }

  private sendSessionConfig(config: VoiceProviderConfig): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`${LOG_PREFIX} Cannot send config - WebSocket not open`);
      return;
    }

    // Map voice to OpenAI format
    const voice = mapVoiceToProvider(config.voice, 'openai');

    // Map audio format
    const audioFormat = config.inputAudioFormat === 'g711_alaw' ? 'g711_alaw' : 'g711_ulaw';

    // Build transcription config
    const transcriptionConfig = config.transcriptionEnabled ? {
      model: config.transcriptionModel || 'whisper-1',
      prompt: config.transcriptionPrompt,
    } : undefined;

    // Build turn detection config
    // Use 2500ms silence duration for proper B2B conversation turn-taking
    const turnDetection = {
      type: config.turnDetection.type === 'none' ? 'server_vad' : config.turnDetection.type,
      threshold: config.turnDetection.threshold ?? 0.5,
      prefix_padding_ms: config.turnDetection.prefixPaddingMs ?? 300,
      silence_duration_ms: config.turnDetection.silenceDurationMs ?? 2500,
    };

    const message: OpenAISessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: config.systemPrompt,
        voice,
        input_audio_format: audioFormat,
        output_audio_format: audioFormat,
        input_audio_transcription: transcriptionConfig,
        turn_detection: turnDetection,
        tools: convertToolsToOpenAI(config.tools),
        tool_choice: config.toolChoice || 'auto',
        temperature: config.temperature ?? 0.7,
        max_response_output_tokens: config.maxResponseTokens ?? 512,
      },
    };

    this.ws.send(JSON.stringify(message));
    console.log(`${LOG_PREFIX} Session configured with voice: ${voice}`);
  }

  sendAudio(audioBuffer: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // OpenAI Realtime accepts G.711 directly (no transcoding needed)
    const base64Audio = audioBuffer.toString('base64');

    const message: OpenAIAudioAppend = {
      type: 'input_audio_buffer.append',
      audio: base64Audio,
    };

    this.ws.send(JSON.stringify(message));
    this.audioBytesSent += audioBuffer.length;
  }

  sendTextMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Create a conversation item with text
    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    };

    this.ws.send(JSON.stringify(message));

    // Trigger response
    this.triggerResponse();
  }

  cancelResponse(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: OpenAIResponseCancel = {
      type: 'response.cancel',
    };

    this.ws.send(JSON.stringify(message));
    console.log(`${LOG_PREFIX} Response cancelled`);

    if (this.currentResponseId) {
      this.emit('response:cancelled', { responseId: this.currentResponseId });
    }
  }

  truncateAudio(itemId: string, audioEndMs: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: OpenAIConversationItemTruncate = {
      type: 'conversation.item.truncate',
      item_id: itemId,
      content_index: 0,
      audio_end_ms: audioEndMs,
    };

    this.ws.send(JSON.stringify(message));
  }

  respondToFunctionCall(callId: string, result: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const output = typeof result === 'string' ? result : JSON.stringify(result);

    const message: OpenAIFunctionOutput = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output,
      },
    };

    this.ws.send(JSON.stringify(message));

    // Trigger response after function output
    this.triggerResponse();
  }

  triggerResponse(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: OpenAIResponseCreate = {
      type: 'response.create',
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send opening message to start the conversation
   */
  sendOpeningMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Create message item
    const createMessage = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
      },
    };

    this.ws.send(JSON.stringify(createMessage));

    // Trigger response to generate audio
    const responseMessage: OpenAIResponseCreate = {
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
      },
    };

    this.ws.send(JSON.stringify(responseMessage));
    console.log(`${LOG_PREFIX} Opening message sent: "${text.substring(0, 50)}..."`);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      this.dispatchMessage(message);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error parsing message:`, error);
    }
  }

  private dispatchMessage(message: any): void {
    const type = message.type;

    switch (type) {
      // Session events
      case 'session.created':
      case 'session.updated':
        console.log(`${LOG_PREFIX} Session ${type.split('.')[1]}`);
        break;

      // Response lifecycle
      case 'response.created':
        this.currentResponseId = message.response?.id;
        this.setResponding(true, this.currentResponseId || undefined);
        break;

      case 'response.done':
        this.setResponding(false, this.currentResponseId || undefined);
        this.currentResponseId = null;
        break;

      // Audio output
      case 'response.audio.delta':
        this.handleAudioDelta(message);
        break;

      case 'response.audio.done':
        this.emit('audio:done');
        break;

      // Transcription
      case 'response.audio_transcript.delta':
        this.emit('transcript:agent', {
          text: message.delta,
          isFinal: false,
          timestamp: new Date(),
        });
        break;

      case 'response.audio_transcript.done':
        if (message.transcript) {
          this.emit('transcript:agent', {
            text: message.transcript,
            isFinal: true,
            timestamp: new Date(),
          });
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        this.emit('transcript:user', {
          text: message.transcript,
          isFinal: true,
          timestamp: new Date(),
        });
        break;

      // Speech detection
      case 'input_audio_buffer.speech_started':
        this.emit('speech:started');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.emit('speech:stopped');
        break;

      // Function calling
      case 'response.function_call_arguments.done':
        this.handleFunctionCall(message);
        break;

      // Rate limiting
      case 'rate_limits.updated':
        this.handleRateLimits(message);
        break;

      // Errors
      case 'error':
        console.error(`${LOG_PREFIX} API error:`, message.error);
        this.emitError(
          message.error?.code || 'api_error',
          message.error?.message || 'Unknown error',
          message.error?.code !== 'authentication_error'
        );
        break;

      // Other events
      case 'response.output_item.added':
        this.currentItemId = message.item?.id;
        break;

      case 'response.text.delta':
      case 'response.text.done':
        // Text response (alongside audio)
        break;

      default:
        // Log unknown events at debug level
        if (process.env.DEBUG_OPENAI_EVENTS === 'true') {
          console.log(`${LOG_PREFIX} Unhandled event: ${type}`);
        }
    }
  }

  private handleAudioDelta(message: any): void {
    if (!message.delta) return;

    const audioBuffer = Buffer.from(message.delta, 'base64');
    const durationMs = audioBuffer.length / 8; // G.711: 8 bytes per ms

    this.audioPlaybackMs += durationMs;

    this.emit('audio:delta', {
      audioBuffer,
      format: this.config?.outputAudioFormat || 'g711_ulaw',
      durationMs,
    });
  }

  private handleFunctionCall(message: any): void {
    const callId = message.call_id;
    const name = message.name;

    let args: Record<string, any> = {};
    try {
      args = JSON.parse(message.arguments || '{}');
    } catch {
      console.warn(`${LOG_PREFIX} Failed to parse function arguments`);
    }

    this.emit('function:call', { callId, name, args });
  }

  private handleRateLimits(message: any): void {
    const limits = message.rate_limits;
    if (!Array.isArray(limits)) return;

    const requestLimit = limits.find((l: any) => l.name === 'requests');
    const tokenLimit = limits.find((l: any) => l.name === 'tokens');

    this.rateLimits = {
      requestsRemaining: requestLimit?.remaining ?? 0,
      requestsLimit: requestLimit?.limit ?? 0,
      tokensRemaining: tokenLimit?.remaining ?? 0,
      tokensLimit: tokenLimit?.limit ?? 0,
      resetAt: requestLimit?.reset_seconds
        ? new Date(Date.now() + requestLimit.reset_seconds * 1000)
        : null,
    };

    this.emit('ratelimit:updated', this.rateLimits);
  }

  /**
   * Get audio statistics
   */
  getAudioStats(): { bytesSent: number; playbackMs: number } {
    return {
      bytesSent: this.audioBytesSent,
      playbackMs: this.audioPlaybackMs,
    };
  }

  /**
   * Get current response item ID (for interruption handling)
   */
  getCurrentItemId(): string | null {
    return this.currentItemId;
  }
}

export default OpenAIRealtimeProvider;
