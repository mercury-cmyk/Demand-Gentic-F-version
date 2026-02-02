/**
 * Gemini 3 Flash Live API Voice Provider
 *
 * Implements the IVoiceProvider interface for Google's Gemini Live API.
 * Uses Gemini 3 Flash Native Audio for high-quality real-time voice (Dec 2025).
 * Handles WebSocket connection, audio transcoding, and function calling.
 *
 * Key features:
 * - Native audio output with natural prosody
 * - 15+ voice options (Kore, Vega, Pegasus, etc.)
 * - Low latency, high quality speech
 * - Function calling support
 *
 * Key differences from OpenAI:
 * - Audio format: PCM 16kHz input, PCM 24kHz output (vs G.711)
 * - Authentication: OAuth2/ADC or API key
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
  private sttActive: boolean = false; // Track if STT should be actively running
  private currentUserTranscript: string = '';
  private sttRestartTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastAudioReceivedTime: number = 0; // Track when we last received audio
  private sttIdleTimeout: ReturnType<typeof setTimeout> | null = null;
  // Anti-loop protection
  private sttRestartCount: number = 0;
  private sttLastRestartTime: number = 0;

  async connect(): Promise<void> {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
    // Use Gemini 2.5 Flash Native Audio for the Live API
    // IMPORTANT: gemini-live-2.5-flash-native-audio ONLY works with Vertex AI (not Google AI Studio)
    // For Google AI Studio, use gemini-2.0-flash-live-001
    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';

    // ALWAYS use Vertex AI when project ID is available (required for gemini-live-2.5-flash-native-audio)
    // API keys (Google AI Studio) don't support the native audio models
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

    // Prefer Vertex AI when project ID is available (better model support + required for native audio)
    const useVertexAI = !!projectId;

    console.log(`${LOG_PREFIX} Configuration:`, {
      model,
      useVertexAI,
      hasApiKey: !!apiKey,
      hasProjectId: !!projectId,
      projectId: projectId || 'N/A',
      reason: useVertexAI ? 'Using Vertex AI (project ID available)' : 'Using Google AI Studio (no project ID)'
    });

    if (!useVertexAI && !apiKey) {
      throw new Error("Google Cloud Project ID (for Vertex AI) or API key (for Google AI Studio) required");
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
            console.error(`${LOG_PREFIX} 🔍 Model not found - check GEMINI_LIVE_MODEL (current: ${process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'})`);
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

    // Send setup message and WAIT for setup to complete
    // This ensures the 'connected' event fires AFTER configure() returns
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Gemini setup timeout - no response within 10 seconds"));
      }, 10000);

      // Listen for connected event (fires when setupComplete is received)
      const onConnected = () => {
        clearTimeout(timeout);
        console.log(`${LOG_PREFIX} Setup complete, configure() resolving`);
        resolve();
      };

      // Already connected (shouldn't happen but handle it)
      if (this.setupComplete) {
        clearTimeout(timeout);
        resolve();
        return;
      }

      this.once('connected', onConnected);

      // Send setup message
      this.sendSetupMessage(config);
      console.log(`${LOG_PREFIX} Setup message sent, waiting for setupComplete...`);
    });
  }

  private sendSetupMessage(config: VoiceProviderConfig): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`${LOG_PREFIX} sendSetupMessage failed: WS not open`);
      return;
    }

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
    // Use Gemini 2.5 Flash Native Audio for the Live API
    // Note: Model name format differs between Google AI and Vertex AI
    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio';
    // Prefer Vertex AI when project ID is available (required for native audio models)
    const useVertexAI = !!projectId;

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

    // Check for backpressure before sending
    const bufferSize = this.ws.bufferedAmount;
    const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
    if (bufferSize > MAX_BUFFER_SIZE) {
      console.warn(`${LOG_PREFIX} ⚠️ Audio backpressure detected (${bufferSize} bytes). Dropping frame to prevent buffer overflow.`);
      return; // Drop frame to prevent audio quality degradation
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

        // Track when audio was received for STT idle detection
        this.lastAudioReceivedTime = Date.now();

        // Also stream to Speech-to-Text for user transcription
        // Note: The streaming recognize stream expects raw PCM audio bytes
        if (this.sttEnabled) {
          // Activate STT on demand when audio arrives
          if (!this.sttActive) {
            this.sttActive = true;
            this.startRecognizeStream().catch(() => {});
          }

          if (this.recognizeStream) {
            try {
              this.recognizeStream.write(pcmBuffer);
            } catch (sttErr) {
              // Ignore write errors - stream may be restarting
            }
          }
        }
    } catch (e) {
        console.error(`${LOG_PREFIX} Error sending audio to Gemini`, e);
    }
  }

  /**
   * Initialize Google Cloud Speech-to-Text for user speech transcription.
   * This only initializes the client - actual streaming starts on demand when audio arrives.
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
      // Don't start stream yet - it will start on demand when audio arrives
      console.log(`${LOG_PREFIX} Speech-to-Text client initialized (stream starts on audio)`);
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Speech-to-Text initialization failed (user transcripts will be unavailable):`, error.message);
      this.sttEnabled = false;
    }
  }

  /**
   * Start or restart the streaming recognition stream.
   * Streams have a ~5 minute limit, so we need to restart periodically.
   * Only starts if STT is active (audio is being received).
   */
  private async startRecognizeStream(): Promise<void> {
    if (!this.speechClient || !this.sttEnabled || !this.sttActive) return;

    // Anti-loop protection: Check restart frequency
    const now = Date.now();
    if (now - this.sttLastRestartTime < 5000) { // Restarted within last 5 seconds
        this.sttRestartCount++;
    } else {
        this.sttRestartCount = 1;
    }
    this.sttLastRestartTime = now;

    // If we're looping rapidly (> 5 restarts in short succession), force a cooldown
    if (this.sttRestartCount > 5) {
        console.warn(`${LOG_PREFIX} STT detected rapid restart loop (${this.sttRestartCount}). Pausing for 5 seconds.`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Reset counter after pause
        this.sttRestartCount = 0;
        
        // Re-check state after pause
        if (!this.sttEnabled || !this.sttActive) return;
    }

    // Close existing stream if any
    if (this.recognizeStream) {
      try {
        this.recognizeStream.end();
      } catch (e) {
        // Ignore close errors
      }
      this.recognizeStream = null;
    }

    // Clear any pending restart timeout
    if (this.sttRestartTimeout) {
      clearTimeout(this.sttRestartTimeout);
      this.sttRestartTimeout = null;
    }

    // Clear idle timeout if exists
    if (this.sttIdleTimeout) {
      clearTimeout(this.sttIdleTimeout);
      this.sttIdleTimeout = null;
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
      // Update last audio time on any data received
      this.lastAudioReceivedTime = Date.now();

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
      const errorMsg = error.message || error.toString() || '';
      const errorCode = error.code;

      // DEADLINE_EXCEEDED is expected after ~5 minutes, restart if still active
      if (errorCode === 4 || errorMsg.includes('DEADLINE_EXCEEDED')) {
        if (this.sttActive) {
          console.log(`${LOG_PREFIX} STT stream deadline exceeded, restarting...`);
          setTimeout(() => this.startRecognizeStream().catch(() => {}), 100);
        }
      } else if (errorCode === 8 || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('Quota exceeded')) {
         console.error(`${LOG_PREFIX} ❌ STT Quota/Resource Exhausted. Disabling STT for this session to prevent crash loop. Error: ${errorMsg}`);
         this.sttActive = false;
         this.sttEnabled = false; // Hard stop
         
         // Ensure we don't restart in on('end')
         if (this.recognizeStream) {
             this.recognizeStream.removeAllListeners('end');
             this.recognizeStream.on('end', () => {}); // No-op
         }
      } else {
        console.warn(`${LOG_PREFIX} STT stream error:`, errorMsg);
        // Prevent rapid restart loop on other errors too
        if (this.sttRestartCount > 3) {
            console.error(`${LOG_PREFIX} Too many STT errors (${this.sttRestartCount}). Disabling STT temporarily.`);
            this.sttActive = false;
            // Don't disable sttEnabled permanently for generic errors, but let backoff handle it
        }
      }
    });

    this.recognizeStream.on('end', () => {
      // Stream ended - only restart if still active and recently received audio
      const timeSinceLastAudio = Date.now() - this.lastAudioReceivedTime;
      // Added !this.speechClient check
      if (this.sttEnabled && this.sttActive && this.speechClient && timeSinceLastAudio < 30000) {
        // Clear safety timeout if exists to prevent leaks
        if (this.sttRestartTimeout) {
            clearTimeout(this.sttRestartTimeout);
            this.sttRestartTimeout = null;
        }

        // Only restart if audio was received within the last 30 seconds
        // Increase backoff based on restart count
        const backoffMs = Math.min(1000 * Math.pow(2, this.sttRestartCount), 30000); 
        
        this.sttRestartTimeout = setTimeout(() => {
          if (this.sttActive) {
            this.startRecognizeStream().catch(() => {});
          }
        }, backoffMs); 
      } else {
        // No recent audio - deactivate STT to prevent restart loop
        this.sttActive = false;
        this.recognizeStream = null;
      }
    });

    // Set a timeout to restart the stream before Google's 5-minute limit
    this.sttRestartTimeout = setTimeout(() => {
      if (this.sttEnabled && this.sttActive) {
        console.log(`${LOG_PREFIX} STT stream approaching limit, restarting...`);
        this.startRecognizeStream().catch(() => {});
      }
    }, 4 * 60 * 1000); // 4 minutes (before 5-minute limit)
  }

  /**
   * Stop Speech-to-Text streaming.
   */
  private stopSpeechToText(): void {
    this.sttEnabled = false;
    this.sttActive = false;

    if (this.sttRestartTimeout) {
      clearTimeout(this.sttRestartTimeout);
      this.sttRestartTimeout = null;
    }

    if (this.sttIdleTimeout) {
      clearTimeout(this.sttIdleTimeout);
      this.sttIdleTimeout = null;
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

    // In Gemini Live, we send a text prompt and the model generates audio
    // Include essential instructions for proper conversation flow
    const message = {
      client_content: {
        turns: [{
          role: 'user',
          parts: [{ text: `Say ONLY this exact message now: "${text}"

CRITICAL RULES:
- Do NOT add anything before or after this message
- After speaking, STOP and WAIT in silence for their response
- Do NOT assume they confirmed identity - wait for explicit "yes" or name confirmation
- Do NOT proceed to pitch until you HEAR explicit confirmation
- Listen carefully - the next words must come from THEM` }],
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

      // Log incoming message type
      if (message.setup_complete || message.setupComplete) {
        console.log(`${LOG_PREFIX} 📬 Message received: SETUP_COMPLETE`);
      } else if (message.server_content || message.serverContent) {
        console.log(`${LOG_PREFIX} 📬 Message received: SERVER_CONTENT`);
      } else if (message.tool_call || message.toolCall) {
        console.log(`${LOG_PREFIX} 📬 Message received: TOOL_CALL`);
      } else {
        console.log(`${LOG_PREFIX} 📬 Message received: ${JSON.stringify(message).substring(0, 100)}`);
      }

      // Check for errors
      if (isGeminiError(message)) {
        console.error(`${LOG_PREFIX} 🚨 API error:`, message.error);
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

    console.log(`${LOG_PREFIX} 📨 handleServerContent - processing server message`);

    // Check for model turn with content
    if (content.model_turn?.parts || content.modelTurn?.parts) {
      const parts = content.model_turn?.parts || content.modelTurn?.parts;
      console.log(`${LOG_PREFIX} 📦 Model turn received with ${parts.length} parts`);

      // Handle audio output
      if (hasAudioPart(parts)) {
        console.log(`${LOG_PREFIX} 🎵 AUDIO PART DETECTED! Processing...`);
        const audioData = extractAudioData(parts);
        if (audioData) {
          console.log(`${LOG_PREFIX} ✅ Audio data extracted: ${audioData.length} chars (base64)`);
          // DEBUG: Log first few audio chunks to verify Gemini is sending data
          if (this.audioPlaybackMs === 0) {
              console.log(`${LOG_PREFIX} 🔊 FIRST AUDIO RECEIVED from Gemini. Chunk size: ${audioData.length} chars (base64)`);
          }
          this.handleAudioOutput(audioData);
        } else {
             console.warn(`${LOG_PREFIX} ⚠️ Detected AudioPart but failed to extract data!`);
        }
      } else {
        console.log(`${LOG_PREFIX} ⚠️ No audio part detected in model turn. Parts: ${parts.map((p: any) => Object.keys(p)[0]).join(', ')}`);
      }

      // Handle text output (for transcription)
      if (hasTextPart(parts)) {
        const text = extractText(parts);
        if (text) {
          console.log(`${LOG_PREFIX} 📝 Text output: ${text.substring(0, 100)}`);
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
      if (functionCalls.length > 0) {
        console.log(`${LOG_PREFIX} 🔧 Function calls: ${functionCalls.map(f => f.name).join(', ')}`);
      }
      for (const fc of functionCalls) {
        const callId = fc.id || `fc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.pendingFunctionCalls.set(callId, { name: fc.name, args: fc.args });
        this.emit('function:call', {
          callId,
          name: fc.name,
          args: fc.args,
        });
      }
    } else {
      console.log(`${LOG_PREFIX} ⚠️ Server content has no model_turn`);
    }

    // Turn complete
    if (content.turn_complete || content.turnComplete) {
      console.log(`${LOG_PREFIX} ✋ Turn complete signal received`);
      if (this.currentTranscript) {
        console.log(`${LOG_PREFIX} 📝 Final transcript: ${this.currentTranscript}`);
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
      console.log(`${LOG_PREFIX} 🛑 Response interrupted`);
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
        // Generate fallback ID if fc.id is undefined (Gemini sometimes omits it)
        const callId = fc.id || `fc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

    console.log(`${LOG_PREFIX} 🎵 handleAudioOutput called with ${base64Audio.length} chars of base64 audio`);

    // Start response if not already
    if (!this._isResponding) {
      this.currentResponseId = `resp-${Date.now()}`;
      this.setResponding(true, this.currentResponseId);
      console.log(`${LOG_PREFIX} 🎬 Starting new response: ${this.currentResponseId}`);
    }

    // Decode PCM audio from Gemini (24kHz)
    const pcmBuffer = Buffer.from(base64Audio, 'base64');
    console.log(`${LOG_PREFIX} 📦 Decoded PCM buffer: ${pcmBuffer.length} bytes (24kHz)`);

    // Transcode to G.711 for Telnyx
    const g711Buffer = this.transcoder.geminiToTelnyx(pcmBuffer, 24000);
    console.log(`${LOG_PREFIX} 🔄 Transcoded to G.711: ${g711Buffer.length} bytes`);

    // DEBUG: Log audio output from Gemini with quality metrics
    if (this.audioPlaybackMs === 0 || this.audioPlaybackMs % 1000 < 50) {
      const compressionRatio = ((pcmBuffer.length / g711Buffer.length) * 100).toFixed(1);
      const avgChunkSize = g711Buffer.length;
      console.log(`${LOG_PREFIX} 📊 Audio: ${pcmBuffer.length}B PCM→${g711Buffer.length}B G.711 (${compressionRatio}% compression, avg chunk ${avgChunkSize}B)`);
    }

    // Calculate duration (G.711: 8 bytes per ms at 8kHz)
    const durationMs = g711Buffer.length / 8;
    this.audioPlaybackMs += durationMs;
    console.log(`${LOG_PREFIX} ⏱️  Audio duration: ${durationMs.toFixed(0)}ms, total: ${this.audioPlaybackMs.toFixed(0)}ms`);

    console.log(`${LOG_PREFIX} 📤 Emitting audio:delta event with ${g711Buffer.length} bytes`);
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
