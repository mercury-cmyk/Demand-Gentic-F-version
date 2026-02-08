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

  // Anti-repetition: Track recent phrases to prevent loops
  private recentPhrases: string[] = [];
  private readonly MAX_RECENT_PHRASES = 10;

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
  private sttErrorLoggedAt: number = 0; // Rate-limit error logging

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

    // Build generation config for audio output.
    // CRITICAL: Native audio models (gemini-live-2.5-flash-native-audio) only allow
    // a SINGLE response modality. Use ['AUDIO'] only, and enable transcription via
    // output_audio_transcription / input_audio_transcription at the setup level.
    const generationConfig: Record<string, unknown> = {
      response_modalities: ['AUDIO'],
      speech_config: {
        voice_config: {
          prebuilt_voice_config: {
            voice_name: voice,
            speaking_rate: 0.9, // Set to 90% of normal speed for more natural pacing
          },
        },
      },
      // Google recommends temperature 1.0 for Gemini 2.5 models.
      // Sub-1.0 values can cause looping and degraded performance.
      // UPDATE FEB 2026: High temperature is causing script deviation.
      // Lowering to 0.5 to improve focus and script adherence.
      temperature: config.temperature ?? 0.5,
      // NOTE: max_output_tokens and thinking_config are NOT supported by native audio
      // models in the Live API. Including them causes "The request is not supported
      // by this model" endpoint selection failure. Omit them entirely.
    };

    // Build tools config - convert to Gemini format
    // IMPORTANT: The Live API expects tools as a SINGLE OBJECT { function_declarations: [...] },
    // NOT an array. This matches Google's official demo (geminilive.js).
    const functionDeclarations = config.tools.length > 0
      ? convertToolsToGemini(config.tools).function_declarations
      : [];

    const modelResourceName = useVertexAI
      ? getVertexModelName({ projectId: projectId!, location, model, useVertexAI: true })
      : `models/${model}`;

    // Build setup message - match Google's official WebSocket demo format exactly
    const setup: Record<string, unknown> = {
      model: modelResourceName,
      generation_config: generationConfig,
      system_instruction: {
        parts: [{ text: config.systemPrompt }],
      },
      // Tools as single object (NOT array) per Google demo format
      tools: { function_declarations: functionDeclarations },
      // VAD / realtime input configuration
      realtime_input_config: {
        automatic_activity_detection: {
          disabled: false,
          ...(config.turnDetection?.silenceDurationMs ? {
            silence_duration_ms: config.turnDetection.silenceDurationMs,
          } : {}),
        },
      },
    };

    // Enable transcription at setup level (supported by native-audio models)
    if (config.transcriptionEnabled !== false) {
      setup.output_audio_transcription = {};
      setup.input_audio_transcription = {};
    }

    const setupMessage = { setup };

    // Log the exact message for debugging
    const debugSetup = { ...setup, system_instruction: { parts: [{ text: `[${(config.systemPrompt || '').length} chars]` }] } };
    console.log(`${LOG_PREFIX} Setup message (debug):`, JSON.stringify(debugSetup, null, 2));

    this.ws.send(JSON.stringify(setupMessage));
    console.log(`${LOG_PREFIX} Setup message sent with voice: ${voice}`);
  }

  // Track inbound audio frames for periodic logging
  private audioInboundChunks: number = 0;
  private lastBackpressureWarnAt: number = 0;

  sendAudio(audioBuffer: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      return;
    }

    if (!this.transcoder) {
      console.warn(`${LOG_PREFIX} Transcoder not initialized`);
      return;
    }

    // Check for backpressure before sending (rate-limit the warning)
    const bufferSize = this.ws.bufferedAmount;
    const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
    if (bufferSize > MAX_BUFFER_SIZE) {
      const now = Date.now();
      if (now - this.lastBackpressureWarnAt > 2000) {
        console.warn(`${LOG_PREFIX} ⚠️ Gemini WS backpressure: ${bufferSize}B buffered, dropping frame`);
        this.lastBackpressureWarnAt = now;
      }
      return;
    }

    // Transcode G.711 to PCM 16kHz for Gemini
    const pcmBuffer = this.transcoder.telnyxToGemini(audioBuffer);
    const base64Audio = pcmBuffer.toString('base64');

    // Build message with fast string concatenation instead of JSON.stringify
    const msg = `{"realtime_input":{"media_chunks":[{"mime_type":"audio/pcm","data":"${base64Audio}"}]}}`;

    try {
        this.ws.send(msg);
        this.audioBytesSent += audioBuffer.length;
        this.audioInboundChunks++;

        // Track when audio was received for STT idle detection
        this.lastAudioReceivedTime = Date.now();

        // Also stream to Speech-to-Text for user transcription
        if (this.sttEnabled) {
          if (!this.sttActive) {
            this.sttActive = true;
            this.startRecognizeStream().catch(() => {});
          }

          if (this.recognizeStream && !this.recognizeStream.destroyed && this.recognizeStream.writable) {
            try {
              this.recognizeStream.write(pcmBuffer);
            } catch (sttErr) {
              // Stream may be closing - ignore silently
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
        // Rate-limit STT error logs to prevent flooding
        if (!this.sttErrorLoggedAt || Date.now() - this.sttErrorLoggedAt > 5000) {
          console.warn(`${LOG_PREFIX} STT stream error:`, errorMsg);
          this.sttErrorLoggedAt = Date.now();
        }
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
   *
   * FIX (Feb 2026): Using turn_complete: false to prevent Gemini from treating this
   * as a complete conversation turn. The greeting is just a prompt to speak, and
   * then Gemini should listen for actual audio input from the caller.
   *
   * CRITICAL FIX (Feb 2026): The issue was that sending turn_complete: true after
   * the greeting instruction caused Gemini to think the "user" was done talking,
   * and then Gemini would respond AND assume what the caller said. By NOT marking
   * turn_complete, we tell Gemini "the caller is still talking" so it will listen
   * to the actual audio stream for their real response.
   */
  sendOpeningMessage(text: string): void {
    console.log(`${LOG_PREFIX} 🎙️ sendOpeningMessage called: ws=${!!this.ws}, wsState=${this.ws?.readyState}, setupComplete=${this.setupComplete}`);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      console.warn(`${LOG_PREFIX} ❌ Cannot send opening message - not ready (ws=${!!this.ws}, state=${this.ws?.readyState}, setup=${this.setupComplete})`);
      return;
    }

    // MINIMAL TRIGGER APPROACH:
    // The system prompt already contains the greeting instructions and conversation rules.
    // We send a short trigger as a completed user turn so Gemini knows to start speaking.
    //
    // Key: turn_complete MUST be true here. This tells Gemini:
    //   "The user's turn is done — now it's YOUR turn to speak."
    // After Gemini speaks and its turn completes, it enters listening mode.
    // The VAD (automatic_activity_detection) then handles detecting caller speech.
    //
    // IMPORTANT: The trigger text must be minimal. Long instructions in client_content
    // confuse the turn state and cause Gemini to monologue (generate multiple
    // consecutive responses without waiting for audio input).
    const message = {
      client_content: {
        turns: [{
          role: 'user',
          parts: [{ text: `[CALL CONNECTED] The phone line is now live. Say your greeting: "${text}" — then STOP and LISTEN.` }],
        }],
        turn_complete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
    console.log(`${LOG_PREFIX} Opening message sent (turn_complete=true, minimal trigger): "${text.substring(0, 50)}..."`);
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

    // Check for model turn with content
    if (content.model_turn?.parts || content.modelTurn?.parts) {
      const parts = content.model_turn?.parts || content.modelTurn?.parts;

      // Handle audio output
      if (hasAudioPart(parts)) {
        const audioData = extractAudioData(parts);
        if (audioData) {
          this.handleAudioOutput(audioData);
        } else {
             console.warn(`${LOG_PREFIX} ⚠️ Detected AudioPart but failed to extract data!`);
        }
      } else {
        console.log(`${LOG_PREFIX} ⚠️ No audio part in model turn. Parts: ${parts.map((p: any) => Object.keys(p)[0]).join(', ')}`);
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
      // Log what this server_content actually contains (for debugging)
      const contentKeys = Object.keys(content).filter(k => k !== 'model_turn' && k !== 'modelTurn');
      if (contentKeys.length > 0) {
        console.log(`${LOG_PREFIX} 📋 Server content (no model_turn), keys: ${contentKeys.join(', ')}`);
      }
    }

    // Handle INPUT transcription - what Gemini heard from the caller
    // This is critical for detecting prospect speech via Gemini's own ASR
    if (content.input_transcription || content.inputTranscription) {
      const inputTranscription = content.input_transcription || content.inputTranscription;
      const text = inputTranscription.text || inputTranscription.transcript || '';
      if (text.trim()) {
        console.log(`${LOG_PREFIX} 👂 INPUT TRANSCRIPTION (caller): "${text}"`);
        // Emit as user transcript so voice-dialer can detect human speech
        this.emit('transcript:user', {
          text: text.trim(),
          isFinal: true,
          timestamp: new Date(),
        });
      }
    }

    // Handle OUTPUT transcription - what Gemini said (text version of its audio)
    if (content.output_transcription || content.outputTranscription) {
      const outputTranscription = content.output_transcription || content.outputTranscription;
      const text = outputTranscription.text || outputTranscription.transcript || '';
      if (text.trim()) {
        // ANTI-REPETITION CHECK: Detect if this is a repeated phrase
        const normalizedText = text.trim().toLowerCase().replace(/[^\w\s]/g, '');
        const isRepetition = this.recentPhrases.some(phrase => {
          const similarity = this.calculateSimilarity(normalizedText, phrase);
          return similarity > 0.85; // 85% similar = likely repetition
        });

        if (isRepetition) {
          console.warn(`${LOG_PREFIX} ⚠️ REPETITION DETECTED - suppressing duplicate phrase: "${text.substring(0, 50)}..."`);
          // Don't emit or track this phrase - it's a repeat
        } else {
          // Track this phrase for future comparison
          this.recentPhrases.push(normalizedText);
          if (this.recentPhrases.length > this.MAX_RECENT_PHRASES) {
            this.recentPhrases.shift(); // Remove oldest
          }

          console.log(`${LOG_PREFIX} 🗣️ OUTPUT TRANSCRIPTION (agent): "${text}"`);
          this.emit('transcript:agent', {
            text: text.trim(),
            isFinal: true,
            timestamp: new Date(),
          });
        }
      }
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

  // Track audio chunks for periodic logging
  private audioChunkCount: number = 0;

  private handleAudioOutput(base64Audio: string): void {
    if (!this.transcoder) {
      console.warn(`${LOG_PREFIX} Transcoder not initialized`);
      return;
    }

    // Start response if not already
    if (!this._isResponding) {
      this.currentResponseId = `resp-${Date.now()}`;
      this.setResponding(true, this.currentResponseId);
      console.log(`${LOG_PREFIX} 🎬 Starting new response: ${this.currentResponseId}`);
    }

    // Decode PCM audio from Gemini (24kHz)
    const pcmBuffer = Buffer.from(base64Audio, 'base64');

    // Transcode to G.711 for Telnyx
    const g711Buffer = this.transcoder.geminiToTelnyx(pcmBuffer, 24000);

    // Calculate duration (G.711: 8 bytes per ms at 8kHz)
    const durationMs = g711Buffer.length / 8;
    this.audioPlaybackMs += durationMs;
    this.audioChunkCount++;

    // Log only first chunk and then periodically (every 100 chunks / ~2s)
    if (this.audioChunkCount === 1) {
      console.log(`${LOG_PREFIX} 🔊 FIRST AUDIO chunk: ${pcmBuffer.length}B PCM→${g711Buffer.length}B G.711 (${durationMs.toFixed(0)}ms)`);
    } else if (this.audioChunkCount % 100 === 0) {
      console.log(`${LOG_PREFIX} 📊 Audio stats: ${this.audioChunkCount} chunks, ${this.audioPlaybackMs.toFixed(0)}ms total playback`);
    }

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
   * Calculate similarity between two strings (Jaccard similarity on words)
   * Returns a value between 0 (no similarity) and 1 (identical)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Clear recent phrases (call when starting a new conversation)
   */
  clearRecentPhrases(): void {
    this.recentPhrases = [];
  }

  /**
   * Check if the provider is ready to receive audio
   */
  isReady(): boolean {
    return this._isConnected && this.setupComplete;
  }
}

export default GeminiLiveProvider;
