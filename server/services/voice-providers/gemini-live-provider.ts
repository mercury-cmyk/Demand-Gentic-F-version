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
import { SpeechClient, protos } from "@google-cloud/speech";
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

  // Speech-to-Text streaming for user transcription
  private speechClient: SpeechClient | null = null;
  private recognizeStream: ReturnType<SpeechClient['streamingRecognize']> | null = null;
  private sttEnabled: boolean = false;
  private currentUserTranscript: string = '';
  private sttRestartTimeout: ReturnType<typeof setTimeout> | null = null;

  async connect(): Promise<void> {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-exp';

    // Check for API key (Google AI Studio) or use ADC (Vertex AI)
    // Accept multiple env var names for flexibility
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    const useVertexAI = !apiKey && !!projectId;

    console.log(`${LOG_PREFIX} Configuration:`, {
      model,
      useVertexAI,
      hasApiKey: !!apiKey,
      hasProjectId: !!projectId,
      projectId: projectId || 'N/A'
    });

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
        console.log(`${LOG_PREFIX} Mode: ${useVertexAI ? 'Vertex AI' : 'Google AI Studio'}, Model: ${model}`);
        console.log(`${LOG_PREFIX} WebSocket URL: ${wsUrl.replace(/key=[^&]+/, 'key=***')}`);

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

        this.ws.on("error", (error: any) => {
          console.error(`${LOG_PREFIX} ❌ WebSocket error:`, error);
          console.error(`${LOG_PREFIX} Error details: code=${error.code}, errno=${error.errno}, message=${error.message}`);
          if (error.message?.includes('401') || error.message?.includes('403')) {
            console.error(`${LOG_PREFIX} 🔑 Authentication failed - your GEMINI_API_KEY may not have access to Gemini Live API`);
            console.error(`${LOG_PREFIX} 💡 Try getting a new API key from https://aistudio.google.com/apikey`);
          }
          if (error.message?.includes('404')) {
            console.error(`${LOG_PREFIX} 🔍 Model not found - check GEMINI_LIVE_MODEL (current: ${process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-exp'})`);
          }
          this.emitError('connection_error', error.message, false);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    // Stop Speech-to-Text first
    this.stopSpeechToText();

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
      console.warn(`${LOG_PREFIX} sendSetupMessage failed: WS not open`);
      return;
    }

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-exp';
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    const useVertexAI = !!projectId && !apiKey;

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

    try {
        this.ws.send(JSON.stringify(message));
        this.audioBytesSent += audioBuffer.length;

        // Also stream to Speech-to-Text for user transcription
        // Note: The streaming recognize stream expects raw PCM audio bytes
        if (this.sttEnabled && this.recognizeStream) {
          try {
            this.recognizeStream.write(pcmBuffer);
          } catch (sttErr) {
            // Ignore write errors - stream may be restarting
          }
        }
    } catch (e) {
        console.error(`${LOG_PREFIX} Error sending audio to Gemini`, e);
    }
  }

  /**
   * Initialize Google Cloud Speech-to-Text for user speech transcription.
   * This runs in parallel with Gemini to transcribe user input.
   */
  private async initializeSpeechToText(): Promise<void> {
    // Skip if STT is explicitly disabled
    if (process.env.GEMINI_STT_ENABLED === 'false') {
      console.log(`${LOG_PREFIX} Speech-to-Text disabled via GEMINI_STT_ENABLED=false`);
      return;
    }

    try {
      this.speechClient = new SpeechClient();
      this.sttEnabled = true;
      await this.startRecognizeStream();
      console.log(`${LOG_PREFIX} Speech-to-Text initialized for user transcription`);
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Speech-to-Text initialization failed (user transcripts will be unavailable):`, error.message);
      this.sttEnabled = false;
    }
  }

  /**
   * Start or restart the streaming recognition stream.
   * Streams have a ~5 minute limit, so we need to restart periodically.
   */
  private async startRecognizeStream(): Promise<void> {
    if (!this.speechClient || !this.sttEnabled) return;

    // Close existing stream if any
    if (this.recognizeStream) {
      try {
        this.recognizeStream.end();
      } catch (e) {
        // Ignore close errors
      }
    }

    // Clear any pending restart timeout
    if (this.sttRestartTimeout) {
      clearTimeout(this.sttRestartTimeout);
    }

    const request: protos.google.cloud.speech.v1.IStreamingRecognitionConfig = {
      config: {
        encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        model: 'phone_call', // Optimized for phone calls
      },
      interimResults: true,
    };

    this.recognizeStream = this.speechClient.streamingRecognize(request);

    this.recognizeStream.on('data', (response: protos.google.cloud.speech.v1.IStreamingRecognizeResponse) => {
      const results = response.results || [];
      for (const result of results) {
        const alternatives = result.alternatives || [];
        if (alternatives.length > 0) {
          const transcript = alternatives[0].transcript || '';
          const isFinal = result.isFinal || false;

          if (isFinal && transcript.trim()) {
            // Emit final user transcript
            this.emit('transcript:user', {
              text: transcript,
              isFinal: true,
              timestamp: new Date(),
            });
            console.log(`${LOG_PREFIX} User said: ${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}`);
            this.currentUserTranscript = '';
          } else if (transcript.trim()) {
            // Update interim transcript
            this.currentUserTranscript = transcript;
          }
        }
      }
    });

    this.recognizeStream.on('error', (error: any) => {
      // DEADLINE_EXCEEDED is expected after ~5 minutes, restart the stream
      if (error.code === 4 || error.message?.includes('DEADLINE_EXCEEDED')) {
        console.log(`${LOG_PREFIX} STT stream deadline exceeded, restarting...`);
        this.startRecognizeStream().catch(() => {});
      } else {
        console.warn(`${LOG_PREFIX} STT stream error:`, error.message || error);
      }
    });

    this.recognizeStream.on('end', () => {
      // Stream ended, restart if still enabled
      if (this.sttEnabled) {
        this.sttRestartTimeout = setTimeout(() => {
          this.startRecognizeStream().catch(() => {});
        }, 100);
      }
    });

    // Set a timeout to restart the stream before Google's 5-minute limit
    this.sttRestartTimeout = setTimeout(() => {
      if (this.sttEnabled) {
        console.log(`${LOG_PREFIX} STT stream timeout, restarting...`);
        this.startRecognizeStream().catch(() => {});
      }
    }, 4 * 60 * 1000); // 4 minutes (before 5-minute limit)
  }

  /**
   * Stop Speech-to-Text streaming.
   */
  private stopSpeechToText(): void {
    this.sttEnabled = false;

    if (this.sttRestartTimeout) {
      clearTimeout(this.sttRestartTimeout);
      this.sttRestartTimeout = null;
    }

    if (this.recognizeStream) {
      try {
        this.recognizeStream.end();
      } catch (e) {
        // Ignore close errors
      }
      this.recognizeStream = null;
    }

    if (this.speechClient) {
      this.speechClient.close().catch(() => {});
      this.speechClient = null;
    }
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
   *
   * CRITICAL: The model must ONLY say the exact greeting and then STOP.
   * It must NOT predict, assume, or continue with any follow-up like "okay, great".
   * The model must wait for the actual human to respond before saying anything else.
   */
  sendOpeningMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      console.warn(`${LOG_PREFIX} Cannot send opening message - not ready`);
      return;
    }

    // In Gemini, we send a text prompt and let the model generate audio
    // CRITICAL: Strong instruction to prevent the model from continuing past the greeting
    const message = {
      client_content: {
        turns: [{
          role: 'user',
          parts: [{ text: `CRITICAL INSTRUCTION: Say ONLY this exact greeting, then STOP completely and wait in ABSOLUTE SILENCE.

Say exactly this and nothing more: "${text}"

CRITICAL RULES - VIOLATION IS UNACCEPTABLE:
1. Do NOT add any words before or after the message above.
2. Do NOT say "okay", "great", "perfect", "I understand" or ANY acknowledgement.
3. Do NOT assume, predict, or anticipate the person's response.
4. Do NOT assume the person confirmed their identity - you MUST hear them EXPLICITLY say "yes" or their name.
5. Do NOT proceed with any pitch or introduction until you HEAR explicit confirmation.
6. If you hear silence, continue waiting - do NOT fill the silence.

After saying this exact message, you MUST:
- STOP speaking immediately
- Wait in complete silence
- Listen for the person's ACTUAL spoken response
- The NEXT words must come from THEM, not from you` }],
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
      // Initialize Speech-to-Text for user transcription (async, don't block)
      this.initializeSpeechToText().catch(err => {
        console.warn(`${LOG_PREFIX} STT init failed:`, err.message);
      });
      return;
    }

    // Tool calls
    if (isToolCall(message)) {
      this.handleToolCall(message);
      return;
    }

    // Tool call cancellation
    if (isToolCallCancellation(message)) {
      const cancellation = message.tool_call_cancellation || (message as any).toolCallCancellation;
      if (cancellation && cancellation.ids) {
        for (const id of cancellation.ids) {
          this.pendingFunctionCalls.delete(id);
        }
      }
      return;
    }

    // Server content (model turn)
    if (isServerContent(message)) {
      this.handleServerContent(message);
      return;
    }
  }

  private handleServerContent(message: any): void {
    const content = message.server_content || message.serverContent;

    // Check for model turn with content
    if (content.model_turn?.parts || content.modelTurn?.parts) {
      const parts = content.model_turn?.parts || content.modelTurn?.parts;

      // Handle audio output
      if (hasAudioPart(parts)) {
        const audioData = extractAudioData(parts);
        if (audioData) {
          // DEBUG: Log first few audio chunks to verify Gemini is sending data
          if (this.audioPlaybackMs === 0) {
              console.log(`${LOG_PREFIX} 🔊 FIRST AUDIO RECEIVED from Gemini. Chunk size: ${audioData.length} chars (base64)`);
          }
          this.handleAudioOutput(audioData);
        } else {
             console.warn(`${LOG_PREFIX} ⚠️ Detected AudioPart but failed to extract data!`);
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
    if (content.turn_complete || content.turnComplete) {
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

  private handleToolCall(message: any): void {
    const toolCall = message.tool_call || message.toolCall;

    const functionCalls = toolCall.function_calls || toolCall.functionCalls;
    if (functionCalls) {
      for (const fc of functionCalls) {
        const callId = fc.id;
        this.pendingFunctionCalls.set(callId, { name: fc.name, args: fc.args });

        this.emit('function:call', {
          callId,
          name: fc.name,
          args: fc.args,
        });
      }
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

    // DEBUG: Log audio output from Gemini
    if (this.audioPlaybackMs === 0 || this.audioPlaybackMs % 1000 < 50) {
      console.log(`${LOG_PREFIX} Received audio from Gemini: ${pcmBuffer.length} bytes PCM -> ${g711Buffer.length} bytes G.711`);
    }

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
