/**
 * Gemini 2.0 Live API Voice Provider
 *
 * Implements the IVoiceProvider interface for Google's Gemini Live API.
 * Handles WebSocket connection, audio transcoding, and function calling.
 *
 * Key differences from OpenAI:
 * - Audio format: PCM 16kHz input, PCM 24kHz output (vs G.711)
 * - Authentication: OAuth2/ADC (vs API key)
 * - Message format: Different protocol structure
 */

import WebSocket from "ws";
import { GoogleAuth } from "google-auth-library";
import {
  BaseVoiceProvider,
  VoiceProviderConfig,
  mapVoiceToProvider,
  convertToolsToGemini,
} from "./voice-provider.interface";
import { AudioTranscoder } from "./audio-transcoder";
import {
  BidiGenerateContentSetup,
  BidiGenerateContentRealtimeInput,
  BidiGenerateContentToolResponse,
  GeminiServerMessage,
  GeminiGenerationConfig,
  GeminiToolConfig,
  isSetupComplete,
  isServerContent,
  isToolCall,
  isToolCallCancellation,
  extractAudioData,
  extractText,
  extractFunctionCalls,
  hasAudioPart,
  hasTextPart,
  isGeminiError,
  GEMINI_VOICES,
  getGeminiLiveEndpoint,
  getVertexModelName,
} from "./gemini-types";

const LOG_PREFIX = "[Gemini-Provider]";

// ==================== GEMINI LIVE PROVIDER ====================

export class GeminiLiveProvider extends BaseVoiceProvider {
  readonly providerName = 'google' as const;

  private ws: WebSocket | null = null;
  private transcoder: AudioTranscoder | null = null;
  private auth: GoogleAuth | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private setupComplete: boolean = false;
  private currentResponseId: string | null = null;
  private pendingFunctionCalls: Map<string, { name: string; args: any }> = new Map();

  // Audio tracking
  private audioBytesSent: number = 0;
  private audioPlaybackMs: number = 0;

  // Accumulated transcript for the current turn
  private currentTranscript: string = '';

  async connect(): Promise<void> {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-exp';

    // Check for API key (Google AI Studio) or use ADC (Vertex AI)
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    const useVertexAI = !apiKey && !!projectId;

    if (!apiKey && !projectId) {
      throw new Error("Google AI API key or Cloud Project ID required");
    }

    return new Promise(async (resolve, reject) => {
      try {
        let wsUrl: string;
        let headers: Record<string, string> = {};

        if (useVertexAI) {
          // Vertex AI endpoint - use OAuth2
          console.log(`${LOG_PREFIX} Using Vertex AI endpoint for project: ${projectId}`);

          this.auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          });

          const accessToken = await this.auth.getAccessToken();
          if (!accessToken) {
            throw new Error("Failed to get Google Cloud access token");
          }

          wsUrl = getGeminiLiveEndpoint({
            projectId: projectId!,
            location,
            model,
            useVertexAI: true,
          });

          headers = {
            "Authorization": `Bearer ${accessToken}`,
          };
        } else {
          // Google AI endpoint - use API key
          console.log(`${LOG_PREFIX} Using Google AI endpoint`);

          wsUrl = getGeminiLiveEndpoint({
            projectId: '',
            location: '',
            model,
            apiKey,
            useVertexAI: false,
          });
          // API key is in the URL query param
        }

        console.log(`${LOG_PREFIX} Connecting to Gemini Live API...`);

        this.ws = new WebSocket(wsUrl, { headers });

        // Connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            console.error(`${LOG_PREFIX} Connection timeout`);
            this.ws.close();
            reject(new Error("Gemini connection timeout"));
          }
        }, 15000); // Longer timeout for Gemini

        this.ws.on("open", () => {
          clearTimeout(this.connectionTimeout!);
          console.log(`${LOG_PREFIX} Connected to Gemini Live API`);
          // Don't emit connected yet - wait for setup_complete
          resolve();
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on("close", (code, reason) => {
          console.log(`${LOG_PREFIX} WebSocket closed: ${code} - ${reason}`);
          this.setConnected(false);
          this.setupComplete = false;
          this.ws = null;
        });

        this.ws.on("error", (error) => {
          console.error(`${LOG_PREFIX} WebSocket error:`, error);
          this.emitError('connection_error', error.message, false);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
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

    this.setupComplete = false;
    this.setConnected(false);
  }

  async configure(config: VoiceProviderConfig): Promise<void> {
    this.config = config;

    // Initialize transcoder for G.711 <-> PCM conversion
    const format = config.inputAudioFormat === 'g711_alaw' ? 'g711_alaw' : 'g711_ulaw';
    this.transcoder = new AudioTranscoder(format);

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    // Send setup message
    this.sendSetupMessage(config);
  }

  private sendSetupMessage(config: VoiceProviderConfig): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-exp';
    const useVertexAI = !!projectId && !process.env.GOOGLE_AI_API_KEY;

    // Map voice to Gemini format
    const voice = mapVoiceToProvider(config.voice, 'google');

    // Build generation config for audio output
    const generationConfig: GeminiGenerationConfig = {
      response_modalities: ['AUDIO'],
      speech_config: {
        voice_config: {
          prebuilt_voice_config: {
            voice_name: voice,
          },
        },
      },
      temperature: config.temperature ?? 0.7,
      max_output_tokens: config.maxResponseTokens ?? 4096,
    };

    // Build tools config - convert to Gemini format
    const tools = config.tools.length > 0
      ? [convertToolsToGemini(config.tools) as unknown as GeminiToolConfig]
      : [] as GeminiToolConfig[];

    // Build setup message
    const setupMessage: BidiGenerateContentSetup = {
      setup: {
        model: useVertexAI
          ? getVertexModelName({ projectId: projectId!, location, model, useVertexAI: true })
          : `models/${model}`,
        generation_config: generationConfig,
        system_instruction: {
          parts: [{ text: config.systemPrompt }],
        },
        tools,
      },
    };

    this.ws.send(JSON.stringify(setupMessage));
    console.log(`${LOG_PREFIX} Setup message sent with voice: ${voice}`);
  }

  sendAudio(audioBuffer: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      return;
    }

    if (!this.transcoder) {
      console.warn(`${LOG_PREFIX} Transcoder not initialized`);
      return;
    }

    // Transcode G.711 to PCM 16kHz for Gemini
    const pcmBuffer = this.transcoder.telnyxToGemini(audioBuffer);
    const base64Audio = pcmBuffer.toString('base64');

    const message: BidiGenerateContentRealtimeInput = {
      realtime_input: {
        media_chunks: [{
          mime_type: 'audio/pcm',
          data: base64Audio,
        }],
      },
    };

    this.ws.send(JSON.stringify(message));
    this.audioBytesSent += audioBuffer.length;
  }

  sendTextMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      return;
    }

    // Send text as client content
    const message = {
      client_content: {
        turns: [{
          role: 'user',
          parts: [{ text }],
        }],
        turn_complete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  cancelResponse(): void {
    // Gemini Live doesn't have explicit cancel - we can signal turn complete
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Signal that we're interrupting
    const message = {
      client_content: {
        turn_complete: true,
      },
    };

    this.ws.send(JSON.stringify(message));

    if (this.currentResponseId) {
      this.emit('response:cancelled', { responseId: this.currentResponseId });
    }
  }

  truncateAudio(itemId: string, audioEndMs: number): void {
    // Gemini doesn't support truncate the same way OpenAI does
    // Just cancel the current response
    this.cancelResponse();
  }

  respondToFunctionCall(callId: string, result: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const pendingCall = this.pendingFunctionCalls.get(callId);
    if (!pendingCall) {
      console.warn(`${LOG_PREFIX} Unknown function call ID: ${callId}`);
      return;
    }

    const message: BidiGenerateContentToolResponse = {
      tool_response: {
        function_responses: [{
          id: callId,
          name: pendingCall.name,
          response: {
            output: result,
          },
        }],
      },
    };

    this.ws.send(JSON.stringify(message));
    this.pendingFunctionCalls.delete(callId);
  }

  triggerResponse(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      return;
    }

    // Signal that the user turn is complete to trigger model response
    const message = {
      client_content: {
        turn_complete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send opening message to start the conversation
   */
  sendOpeningMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      console.warn(`${LOG_PREFIX} Cannot send opening message - not ready`);
      return;
    }

    // In Gemini, we send a text prompt and let the model generate audio
    const message = {
      client_content: {
        turns: [{
          role: 'user',
          parts: [{ text: `Please say this greeting to start the conversation: "${text}"` }],
        }],
        turn_complete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
    console.log(`${LOG_PREFIX} Opening message sent: "${text.substring(0, 50)}..."`);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Check for errors
      if (isGeminiError(message)) {
        console.error(`${LOG_PREFIX} API error:`, message.error);
        this.emitError(
          message.error.status || 'api_error',
          message.error.message,
          message.error.status !== 'UNAUTHENTICATED'
        );
        return;
      }

      this.dispatchMessage(message);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error parsing message:`, error);
    }
  }

  private dispatchMessage(message: GeminiServerMessage): void {
    // Setup complete
    if (isSetupComplete(message)) {
      console.log(`${LOG_PREFIX} Setup complete - ready to receive audio`);
      this.setupComplete = true;
      this.setConnected(true);
      return;
    }

    // Tool calls
    if (isToolCall(message)) {
      this.handleToolCall(message);
      return;
    }

    // Tool call cancellation
    if (isToolCallCancellation(message)) {
      for (const id of message.tool_call_cancellation.ids) {
        this.pendingFunctionCalls.delete(id);
      }
      return;
    }

    // Server content (model turn)
    if (isServerContent(message)) {
      this.handleServerContent(message);
      return;
    }
  }

  private handleServerContent(message: { server_content: any }): void {
    const content = message.server_content;

    // Check for model turn with content
    if (content.model_turn?.parts) {
      const parts = content.model_turn.parts;

      // Handle audio output
      if (hasAudioPart(parts)) {
        const audioData = extractAudioData(parts);
        if (audioData) {
          this.handleAudioOutput(audioData);
        }
      }

      // Handle text output (for transcription)
      if (hasTextPart(parts)) {
        const text = extractText(parts);
        if (text) {
          this.currentTranscript += text;
          this.emit('transcript:agent', {
            text,
            isFinal: false,
            timestamp: new Date(),
          });
        }
      }

      // Handle function calls in content
      const functionCalls = extractFunctionCalls(parts);
      for (const fc of functionCalls) {
        const callId = fc.id || `fc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.pendingFunctionCalls.set(callId, { name: fc.name, args: fc.args });
        this.emit('function:call', {
          callId,
          name: fc.name,
          args: fc.args,
        });
      }
    }

    // Turn complete
    if (content.turn_complete) {
      if (this.currentTranscript) {
        this.emit('transcript:agent', {
          text: this.currentTranscript,
          isFinal: true,
          timestamp: new Date(),
        });
        this.currentTranscript = '';
      }
      this.emit('audio:done');
      this.setResponding(false, this.currentResponseId || undefined);
      this.currentResponseId = null;
    }

    // Interrupted
    if (content.interrupted) {
      console.log(`${LOG_PREFIX} Response interrupted`);
      this.currentTranscript = '';
      if (this.currentResponseId) {
        this.emit('response:cancelled', { responseId: this.currentResponseId });
      }
      this.setResponding(false);
    }
  }

  private handleToolCall(message: { tool_call: any }): void {
    const toolCall = message.tool_call;

    for (const fc of toolCall.function_calls) {
      const callId = fc.id;
      this.pendingFunctionCalls.set(callId, { name: fc.name, args: fc.args });

      this.emit('function:call', {
        callId,
        name: fc.name,
        args: fc.args,
      });
    }
  }

  private handleAudioOutput(base64Audio: string): void {
    if (!this.transcoder) {
      console.warn(`${LOG_PREFIX} Transcoder not initialized`);
      return;
    }

    // Start response if not already
    if (!this._isResponding) {
      this.currentResponseId = `resp-${Date.now()}`;
      this.setResponding(true, this.currentResponseId);
    }

    // Decode PCM audio from Gemini (24kHz)
    const pcmBuffer = Buffer.from(base64Audio, 'base64');

    // Transcode to G.711 for Telnyx
    const g711Buffer = this.transcoder.geminiToTelnyx(pcmBuffer, 24000);

    // Calculate duration (G.711: 8 bytes per ms)
    const durationMs = g711Buffer.length / 8;
    this.audioPlaybackMs += durationMs;

    this.emit('audio:delta', {
      audioBuffer: g711Buffer,
      format: this.config?.outputAudioFormat || 'g711_ulaw',
      durationMs,
    });
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
   * Check if the provider is ready to receive audio
   */
  isReady(): boolean {
    return this._isConnected && this.setupComplete;
  }
}

export default GeminiLiveProvider;
