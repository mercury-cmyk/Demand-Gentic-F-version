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
import { getVoiceModelForProvider } from "../ai-model-governance";
import { geminiApiKeyPool, type AcquiredSlot } from "../gemini-api-key-pool";

const LOG_PREFIX = "[Gemini-Provider]";
const DEBUG = process.env.DEBUG_VOICE_PROVIDERS === 'true';

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

  // Model override — set by connectWithRetry when trying fallback models
  private modelOverride: string | null = null;
  /** The model name that was actually used for the active connection */
  public activeModel: string | null = null;

  // WebSocket keepalive — prevents silent connection drops from proxies/LBs/firewalls
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongReceived: number = 0;
  private missedPongs: number = 0;
  private readonly KEEPALIVE_INTERVAL_MS = 25000; // 25 seconds (well under typical 60s proxy timeout)
  private readonly MAX_MISSED_PONGS = 2; // 2 missed pongs = ~50s unresponsive → reconnect

  // Audio tracking
  private audioBytesSent: number = 0;
  private audioPlaybackMs: number = 0;
  private backpressureDroppedFrames: number = 0;

  // Accumulated transcript for the current turn
  private currentTranscript: string = '';

  // Anti-repetition: Track recent phrases to prevent loops
  private recentPhrases: string[] = [];
  private readonly MAX_RECENT_PHRASES = 15;
  private consecutiveRepetitions: number = 0;

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

  // Transcript dedup: prevent duplicate/overlapping transcription events from Gemini
  private lastEmittedUserText: string = '';
  private lastEmittedUserTimestamp: number = 0;
  private lastEmittedAgentText: string = '';
  private lastEmittedAgentTimestamp: number = 0;

  // Track whether output_transcription was received during the current turn.
  // When true, the turn_complete handler will NOT re-emit the accumulated
  // currentTranscript, preventing duplicate agent text in the call transcript.
  private receivedOutputTranscription: boolean = false;

  // Queued opening message: if sendOpeningMessage is called before setup completes,
  // queue it and auto-send when setupComplete fires. Prevents silent agent on race conditions.
  private pendingOpeningMessage: string | null = null;

  // Pool slot — tracks which API key from the pool is used for this connection
  private poolSlot: AcquiredSlot | null = null;

  // Override setResponding to log audio state transitions for debugging voice delivery issues
  protected setResponding(responding: boolean, responseId?: string): void {
    const wasResponding = this._isResponding;
    super.setResponding(responding, responseId);
    if (responding && !wasResponding) {
      console.log(`${LOG_PREFIX} [AudioState] ▶ STARTED responding (id=${responseId})`);
    } else if (!responding && wasResponding) {
      console.log(`${LOG_PREFIX} [AudioState] ⏹ STOPPED responding (id=${responseId})`);
    }
  }

  async connect(): Promise<void> {
    const { getGcpProjectId, getGcpLocation } = await import('../../lib/gcp-config');
    const model = this.modelOverride || await getVoiceModelForProvider('google');
    this.activeModel = model;

    // Acquire a slot from the Gemini API key pool (round-robin across accounts)
    let slot: AcquiredSlot;
    try {
      slot = await geminiApiKeyPool.acquire();
      this.poolSlot = slot;
    } catch (poolErr: any) {
      // Fallback to single env-based config if pool fails
      console.warn(`${LOG_PREFIX} Pool acquire failed (${poolErr.message}), falling back to env config`);
      const projectId = getGcpProjectId();
      const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
      if (!projectId && !apiKey) {
        throw new Error("Google Cloud Project ID or API key required (pool exhausted and no env fallback)");
      }
      slot = {
        accountId: "env-fallback",
        accountName: "Environment Fallback",
        projectId: projectId || "",
        location: getGcpLocation(),
        apiKey: apiKey || null,
        useVertexAI: !!projectId,
        getAccessToken: async () => {
          const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
          const token = await auth.getAccessToken();
          if (!token) throw new Error("Failed to get access token");
          return token;
        },
        release: () => {},
      };
      this.poolSlot = slot;
    }

    const { projectId, location, apiKey, useVertexAI } = slot;

    if (DEBUG) {
      console.log(`${LOG_PREFIX} Configuration:`, {
        model,
        useVertexAI,
        hasApiKey: !!apiKey,
        hasProjectId: !!projectId,
        projectId: projectId || 'N/A',
        poolAccount: slot.accountName,
        reason: useVertexAI ? 'Using Vertex AI (project ID available)' : 'Using Google AI Studio (no project ID)'
      });
    }

    if (!useVertexAI && !apiKey) {
      slot.release();
      this.poolSlot = null;
      throw new Error("Google Cloud Project ID (for Vertex AI) or API key (for Google AI Studio) required");
    }

    return new Promise(async (resolve, reject) => {
      try {
        let wsUrl: string;
        let headers: Record<string, string> = {};

        if (useVertexAI) {
          // Vertex AI endpoint - use OAuth2 via pool slot's auth
          if (DEBUG) console.log(`${LOG_PREFIX} Using Vertex AI endpoint for project: ${projectId} (${slot.accountName})`);

          const accessToken = await slot.getAccessToken();

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
          // Google AI endpoint - use API key from pool slot
          if (DEBUG) console.log(`${LOG_PREFIX} Using Google AI endpoint (${slot.accountName})`);

          wsUrl = getGeminiLiveEndpoint({
            projectId: '',
            location: '',
            model,
            apiKey,
            useVertexAI: false,
          });
          // API key is in the URL query param
        }

        if (DEBUG) {
          console.log(`${LOG_PREFIX} Connecting to Gemini Live API...`);
          console.log(`${LOG_PREFIX} Mode: ${useVertexAI ? 'Vertex AI' : 'Google AI Studio'}, Model: ${model}`);
          console.log(`${LOG_PREFIX} WebSocket URL: ${wsUrl.replace(/key=[^&]+/, 'key=***')}`);
        }

        this.ws = new WebSocket(wsUrl, { headers });

        // Connection timeout — use terminate() for immediate TCP teardown instead of close()
        // close() sends a close frame and waits for the peer, which may never arrive
        this.connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            console.error(`${LOG_PREFIX} Connection timeout — forcing TCP teardown`);
            this.ws.terminate();
            reject(new Error("Gemini connection timeout"));
          }
        }, 15000); // 15s timeout for Gemini

        this.ws.on("open", () => {
          clearTimeout(this.connectionTimeout!);
          console.log(`${LOG_PREFIX} Connected to Gemini Live API (pool: ${slot.accountName})`);
          // Report success to pool
          if (this.poolSlot) geminiApiKeyPool.reportSuccess(this.poolSlot.accountId);
          // Start WebSocket keepalive to prevent silent connection drops
          this.startKeepalive();
          // Don't emit connected yet - wait for setup_complete
          resolve();
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data.toString());
        });

        // Handle pong responses for keepalive health monitoring
        this.ws.on("pong", () => {
          this.lastPongReceived = Date.now();
          this.missedPongs = 0;
        });

        this.ws.on("close", (code, reason) => {
          const reasonStr = reason ? reason.toString() : 'no reason';
          console.log(`${LOG_PREFIX} WebSocket closed: code=${code}, reason=${reasonStr}, setupComplete=${this.setupComplete}`);
          if (!this.setupComplete) {
            console.error(`${LOG_PREFIX} ❌ WebSocket closed BEFORE setup_complete! This means the setup message was likely rejected.`);
            console.error(`${LOG_PREFIX} 💡 Common causes: unsupported fields in setup, auth failure, model not available, quota exceeded`);
          }
          const wasActive = this._isConnected || this.setupComplete;
          this.stopKeepalive();
          this.setConnected(false);
          this.setupComplete = false;
          this.ws = null;

          // Attempt automatic reconnection if the close was unexpected (mid-call)
          if (wasActive) {
            console.warn(`${LOG_PREFIX} ⚡ Unexpected close during active session — attempting reconnection...`);
            this.attemptReconnection();
          }
        });

        this.ws.on("error", (error: any) => {
          console.error(`${LOG_PREFIX} ❌ WebSocket error (pool: ${slot.accountName}):`, error);
          console.error(`${LOG_PREFIX} Error details: code=${error.code}, errno=${error.errno}, message=${error.message}`);
          // Report failure to pool for rate-limit/auth rotation
          if (this.poolSlot) geminiApiKeyPool.reportFailure(this.poolSlot.accountId, error.message);
          if (error.message?.includes('401') || error.message?.includes('403')) {
            console.error(`${LOG_PREFIX} 🔑 Authentication failed for ${slot.accountName}`);
          }
          if (error.message?.includes('404')) {
            console.error(`${LOG_PREFIX} 🔍 Model not found - check GEMINI_LIVE_MODEL (current: ${process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-latest'})`);
          }
          this.emitError('connection_error', error.message, false);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Connect with retry logic. Re-authenticates on failure (for Vertex AI).
   * Max 2 retries (3 total attempts) with exponential backoff.
   * If all retries fail with the primary model, tries known fallback model names.
   */
  async connectWithRetry(maxRetries: number = 2): Promise<void> {
    const primaryModel = this.modelOverride || await getVoiceModelForProvider('google');
    let lastError: Error | null = null;

    // Try primary model with retries
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          if (DEBUG) console.log(`${LOG_PREFIX} Retry attempt ${attempt}/${maxRetries} after ${backoffMs}ms backoff...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));

          // Force re-authentication by clearing cached auth
          if (this.auth) {
            if (DEBUG) console.log(`${LOG_PREFIX} Refreshing OAuth token for retry...`);
            this.auth = null;
          }

          // Clean up stale WebSocket from previous attempt — terminate to force TCP teardown
          if (this.ws) {
            try { this.ws.terminate(); } catch (_) {}
            this.ws = null;
          }
          this.setupComplete = false;
        }

        this.modelOverride = primaryModel;
        await this.connect();
        return; // Success
      } catch (error: any) {
        lastError = error;
        console.error(`${LOG_PREFIX} Connection attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

        // Don't retry on definitive config errors
        if (error.message?.includes('required') && !error.message?.includes('timeout')) {
          throw error;
        }
      }
    }

    // Primary model exhausted retries — try known fallback model names
    // Note: As of 2026-03, only 'gemini-2.5-flash-native-audio-latest' works via Vertex AI WebSocket.
    // Other model names (dialog, flash-live, etc.) all return code=1008.
    const FALLBACK_MODELS: string[] = [];

    for (const fallbackModel of FALLBACK_MODELS) {
      console.warn(`${LOG_PREFIX} ⚡ Primary model "${primaryModel}" failed. Trying fallback: "${fallbackModel}"...`);
      try {
        if (this.auth) this.auth = null;
        if (this.ws) {
          try { this.ws.terminate(); } catch (_) {}
          this.ws = null;
        }
        this.setupComplete = false;
        this.modelOverride = fallbackModel;
        await this.connect();
        console.log(`${LOG_PREFIX} ✅ Fallback model "${fallbackModel}" connected successfully`);
        return;
      } catch (error: any) {
        console.error(`${LOG_PREFIX} Fallback model "${fallbackModel}" also failed:`, error.message);
      }
    }

    throw lastError || new Error('Gemini connection failed after retries and fallbacks');
  }

  // ==================== KEEPALIVE & RECONNECTION ====================

  /**
   * Start WebSocket ping/pong keepalive.
   * Prevents silent connection drops from proxies, load balancers, and firewalls
   * that kill idle WebSocket connections after 30-60 seconds of inactivity.
   */
  private startKeepalive(): void {
    this.stopKeepalive(); // Clear any existing interval
    this.lastPongReceived = Date.now();
    this.missedPongs = 0;

    this.keepaliveInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopKeepalive();
        return;
      }

      // Check if pongs are being received
      const timeSinceLastPong = Date.now() - this.lastPongReceived;
      if (timeSinceLastPong > this.KEEPALIVE_INTERVAL_MS * 2) {
        this.missedPongs++;
        console.warn(`${LOG_PREFIX} ⚠️ Keepalive: missed pong #${this.missedPongs} (last pong ${Math.round(timeSinceLastPong / 1000)}s ago)`);

        if (this.missedPongs >= this.MAX_MISSED_PONGS) {
          console.error(`${LOG_PREFIX} ❌ Keepalive: ${this.MAX_MISSED_PONGS} missed pongs — connection is dead, forcing close`);
          this.stopKeepalive();
          try { this.ws.terminate(); } catch (_) {} // Force-kill (faster than close())
          return;
        }
      }

      // Send ping frame
      try {
        this.ws.ping();
      } catch (err) {
        console.warn(`${LOG_PREFIX} ⚠️ Keepalive ping failed:`, err);
        this.stopKeepalive();
      }
    }, this.KEEPALIVE_INTERVAL_MS);

    if (DEBUG) console.log(`${LOG_PREFIX} Keepalive started (interval: ${this.KEEPALIVE_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop the keepalive interval.
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
    this.missedPongs = 0;
  }

  // Reconnection state
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private isReconnecting: boolean = false;

  /**
   * Attempt automatic reconnection with exponential backoff.
   * Called when the WebSocket closes unexpectedly during an active session.
   */
  private async attemptReconnection(): Promise<void> {
    if (this.isReconnecting) {
      if (DEBUG) console.log(`${LOG_PREFIX} Reconnection already in progress, skipping`);
      return;
    }

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`${LOG_PREFIX} ❌ Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached — giving up`);
      this.emitError('connection_error', 'Connection lost after max reconnection attempts', false);
      this.reconnectAttempts = 0;
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000); // 1s, 2s, 4s (max 8s)
    console.log(`${LOG_PREFIX} 🔄 Reconnection attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${backoffMs}ms...`);

    await new Promise(resolve => setTimeout(resolve, backoffMs));

    try {
      // Force re-authentication
      if (this.auth) {
        this.auth = null;
      }

      // Clean up stale state — use terminate() to avoid hanging on unresponsive peer
      if (this.ws) {
        try { this.ws.terminate(); } catch (_) {}
        this.ws = null;
      }
      this.setupComplete = false;

      await this.connect();

      // Re-configure if we have a stored config
      if (this.config) {
        await this.configure(this.config);
        console.log(`${LOG_PREFIX} ✅ Reconnected and reconfigured successfully (attempt ${this.reconnectAttempts})`);
      } else {
        console.log(`${LOG_PREFIX} ✅ Reconnected successfully (attempt ${this.reconnectAttempts}), no config to restore`);
      }

      this.reconnectAttempts = 0;
      this.isReconnecting = false;
    } catch (error: any) {
      console.error(`${LOG_PREFIX} ❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error.message);
      this.isReconnecting = false;

      // Schedule retry (non-recursive to avoid tight loops / stack buildup)
      if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        setTimeout(() => this.attemptReconnection(), 500);
      } else {
        console.error(`${LOG_PREFIX} ❌ All reconnection attempts exhausted after failure`);
        this.emitError('connection_error', 'Connection lost after max reconnection attempts', false);
        this.reconnectAttempts = 0;
      }
    }
  }

  async disconnect(): Promise<void> {
    // Log audio quality stats at disconnect
    if (this.backpressureDroppedFrames > 0) {
      console.warn(`${LOG_PREFIX} ⚠️ Audio quality: ${this.backpressureDroppedFrames} frames dropped due to backpressure during session (bytes sent: ${this.audioBytesSent})`);
    }

    // Prevent reconnection during intentional disconnect
    this.isReconnecting = false;
    this.reconnectAttempts = this.MAX_RECONNECT_ATTEMPTS; // Block any pending reconnection attempts

    // Stop keepalive first
    this.stopKeepalive();

    // Stop Speech-to-Text
    this.stopSpeechToText();

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.ws) {
      // Remove close listener to prevent reconnection trigger on intentional close
      this.ws.removeAllListeners('close');
      this.ws.terminate(); // terminate() is immediate; close() can hang if peer is unresponsive
      this.ws = null;
    }

    this.setupComplete = false;
    this.pendingOpeningMessage = null;
    // Reset transcript dedup tracking
    this.lastEmittedUserText = '';
    this.lastEmittedUserTimestamp = 0;
    this.lastEmittedAgentText = '';
    this.lastEmittedAgentTimestamp = 0;
    this.receivedOutputTranscription = false;
    // Reset reconnection state
    this.reconnectAttempts = 0;

    // Release pool slot
    if (this.poolSlot) {
      this.poolSlot.release();
      this.poolSlot = null;
    }
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
      let settled = false;
      const SETUP_TIMEOUT_MS = 35000; // 35 seconds - Vertex AI cold starts can take 15-25s under load

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.error(`${LOG_PREFIX} ❌ Gemini setup timeout - no setup_complete within ${SETUP_TIMEOUT_MS / 1000}s`);
          console.error(`${LOG_PREFIX} 💡 This usually means the setup message contains unsupported fields or auth failed silently`);
          console.error(`${LOG_PREFIX} 💡 WS readyState: ${this.ws?.readyState}, bufferedAmount: ${this.ws?.bufferedAmount}`);
          this.removeListener('connected', onConnected);
          reject(new Error(`Gemini setup timeout - no setup_complete within ${SETUP_TIMEOUT_MS / 1000} seconds`));
        }
      }, SETUP_TIMEOUT_MS);

      // Listen for connected event (fires when setupComplete is received)
      const onConnected = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          if (DEBUG) console.log(`${LOG_PREFIX} Setup complete, configure() resolving`);
          resolve();
        }
      };

      // Listen for errors that arrive during setup
      const onError = (err: any) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          console.error(`${LOG_PREFIX} ❌ Error during setup:`, err);
          this.removeListener('connected', onConnected);
          reject(new Error(`Gemini setup failed: ${err?.message || err}`));
        }
      };
      this.once('error', onError);

      // Also listen for WS close during setup
      const onClose = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          console.error(`${LOG_PREFIX} ❌ WebSocket closed during setup (before setup_complete)`);
          this.removeListener('connected', onConnected);
          reject(new Error('Gemini WebSocket closed during setup'));
        }
      };
      if (this.ws) {
        this.ws.once('close', onClose);
      }

      // Already connected (shouldn't happen but handle it)
      if (this.setupComplete) {
        settled = true;
        clearTimeout(timeout);
        resolve();
        return;
      }

      this.once('connected', onConnected);

      // Send setup message
      void this.sendSetupMessage(config);
      if (DEBUG) console.log(`${LOG_PREFIX} Setup message sent, waiting for setupComplete... (timeout: ${SETUP_TIMEOUT_MS / 1000}s)`);
    });
  }

  // Whether we're connected to Vertex AI (camelCase) vs Google AI Studio (snake_case)
  private useVertexAI: boolean = false;

  private async sendSetupMessage(config: VoiceProviderConfig): Promise<void> {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.warn(`${LOG_PREFIX} sendSetupMessage failed: WS not open`);
        return;
      }

      const { getGcpProjectId: _getProjectId, getGcpLocation: _getLocation } = await import('../../lib/gcp-config');
      const projectId = _getProjectId();
      const location = _getLocation();
      // Use the model that successfully connected (activeModel), not governance default
      const model = this.activeModel || await getVoiceModelForProvider('google');
      // Prefer Vertex AI when project ID is available (required for native audio models)
      this.useVertexAI = !!projectId;

    // Map voice to Gemini format
    const voice = mapVoiceToProvider(config.voice, 'google');

    const modelResourceName = this.useVertexAI
      ? getVertexModelName({ projectId: projectId!, location, model, useVertexAI: true })
      : `models/${model}`;

    // Build tools - convert to Gemini format
    const functionDeclarations = config.tools.length > 0
      ? convertToolsToGemini(config.tools).function_declarations
      : [];

    // CRITICAL: Vertex AI (aiplatform.googleapis.com) uses camelCase JSON field names
    // while Google AI Studio (generativelanguage.googleapis.com) uses snake_case.
    // Sending the wrong casing causes silent setup rejection (no setup_complete).
    let setup: Record<string, unknown>;

    if (this.useVertexAI) {
      // ===== VERTEX AI FORMAT (camelCase) =====
      setup = {
        model: modelResourceName,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
          temperature: config.temperature ?? 0.7,
        },
        systemInstruction: {
          parts: [{ text: config.systemPrompt }],
        },
        // Tools as array for Vertex AI
        tools: [{ functionDeclarations }],
        // VAD / realtime input configuration
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            ...(config.turnDetection?.silenceDurationMs ? {
              silenceDurationMs: config.turnDetection.silenceDurationMs,
            } : {}),
          },
        },
      };

      // Enable transcription at setup level (supported by native-audio models)
      if (config.transcriptionEnabled !== false) {
        setup.outputAudioTranscription = {};
        setup.inputAudioTranscription = {};
      }
    } else {
      // ===== GOOGLE AI STUDIO FORMAT (snake_case) =====
      setup = {
        model: modelResourceName,
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: voice,
              },
            },
          },
          temperature: config.temperature ?? 0.7,
        },
        system_instruction: {
          parts: [{ text: config.systemPrompt }],
        },
        // Tools as single object for Google AI Studio
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
    }

      const setupMessage = { setup };

      // Log the exact message for debugging (redact system prompt)
      if (DEBUG) {
        const debugSetup = { ...setup };
        if (this.useVertexAI) {
          debugSetup.systemInstruction = { parts: [{ text: `[${(config.systemPrompt || '').length} chars]` }] };
        } else {
          debugSetup.system_instruction = { parts: [{ text: `[${(config.systemPrompt || '').length} chars]` }] };
        }
        console.log(`${LOG_PREFIX} Setup message (${this.useVertexAI ? 'Vertex AI/camelCase' : 'Google AI/snake_case'}):`, JSON.stringify(debugSetup, null, 2));
      }

      this.ws.send(JSON.stringify(setupMessage));
      console.log(`${LOG_PREFIX} Setup message sent with voice: ${voice}, format: ${this.useVertexAI ? 'camelCase' : 'snake_case'}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to send governed setup message:`, error);
      this.emitError('setup_failed', error instanceof Error ? error.message : 'Failed to send Gemini setup message', false);
    }
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

    // Check for backpressure before sending
    // Lower threshold (1MB) to detect congestion earlier — better to drop sooner and
    // notify than accumulate a huge buffer that causes delayed/garbled audio
    const bufferSize = this.ws.bufferedAmount;
    const MAX_BUFFER_SIZE = 1 * 1024 * 1024; // 1MB (~62s of audio — if we're this far behind, audio is stale)
    const WARN_BUFFER_SIZE = 512 * 1024; // 512KB — warn early
    if (bufferSize > MAX_BUFFER_SIZE) {
      this.backpressureDroppedFrames++;
      const now = Date.now();
      if (now - this.lastBackpressureWarnAt > 2000) {
        console.warn(`${LOG_PREFIX} ⚠️ Gemini WS backpressure: ${bufferSize}B buffered, dropping frame (total dropped: ${this.backpressureDroppedFrames})`);
        this.lastBackpressureWarnAt = now;
        // Emit event so upper layers can react (e.g. log call quality issue)
        this.emit('audio:backpressure', {
          bufferedBytes: bufferSize,
          droppedFrames: this.backpressureDroppedFrames,
        });
      }
      return;
    } else if (bufferSize > WARN_BUFFER_SIZE) {
      const now = Date.now();
      if (now - this.lastBackpressureWarnAt > 5000) {
        console.warn(`${LOG_PREFIX} ⚠️ Gemini WS buffer building up: ${bufferSize}B — potential network congestion`);
        this.lastBackpressureWarnAt = now;
      }
    }

    // Transcode G.711 to PCM 16kHz for Gemini
    const pcmBuffer = this.transcoder.telnyxToGemini(audioBuffer);
    const base64Audio = pcmBuffer.toString('base64');

    // Build message with fast string concatenation instead of JSON.stringify
    // Vertex AI uses camelCase, Google AI Studio uses snake_case
    const msg = this.useVertexAI
      ? `{"realtimeInput":{"mediaChunks":[{"mimeType":"audio/pcm","data":"${base64Audio}"}]}}`
      : `{"realtime_input":{"media_chunks":[{"mime_type":"audio/pcm","data":"${base64Audio}"}]}}`;

    try {
        this.ws.send(msg);
        this.audioBytesSent += audioBuffer.length;
        this.audioInboundChunks++;

        // POST-CALL TRANSCRIPTION: STT disabled during calls for zero latency.
        // Full transcription runs after the call from the recording.
    } catch (e) {
        console.error(`${LOG_PREFIX} Error sending audio to Gemini`, e);
    }
  }

  /**
   * Initialize Google Cloud Speech-to-Text for user speech transcription.
   * DISABLED: Post-call transcription eliminates the need for real-time STT.
   * This reduces latency, CPU overhead, and network usage during live calls.
   */
  private async initializeSpeechToText(): Promise<void> {
    if (DEBUG) console.log(`${LOG_PREFIX} Speech-to-Text DISABLED — post-call transcription enabled`);
    this.sttEnabled = false;
    return;
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
            if (DEBUG) console.log(`${LOG_PREFIX} User said: ${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}`);
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
          if (DEBUG) console.log(`${LOG_PREFIX} STT stream deadline exceeded, restarting...`);
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
        if (DEBUG) console.log(`${LOG_PREFIX} STT stream approaching limit, restarting...`);
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
    // Vertex AI uses camelCase, Google AI Studio uses snake_case
    const message = this.useVertexAI
      ? {
          clientContent: {
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true,
          },
        }
      : {
          client_content: {
            turns: [{ role: 'user', parts: [{ text }] }],
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
    // Vertex AI uses camelCase, Google AI Studio uses snake_case
    const message = this.useVertexAI
      ? { clientContent: { turnComplete: true } }
      : { client_content: { turn_complete: true } };

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

    // Vertex AI uses camelCase, Google AI Studio uses snake_case
    const message = this.useVertexAI
      ? {
          toolResponse: {
            functionResponses: [{
              id: callId,
              name: pendingCall.name,
              response: { output: result },
            }],
          },
        }
      : {
          tool_response: {
            function_responses: [{
              id: callId,
              name: pendingCall.name,
              response: { output: result },
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
    // Vertex AI uses camelCase, Google AI Studio uses snake_case
    const message = this.useVertexAI
      ? { clientContent: { turnComplete: true } }
      : { client_content: { turn_complete: true } };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send opening message to start the conversation.
   *
   * CRITICAL: The model must ONLY say the exact greeting and then STOP.
   * It must NOT predict, assume, or continue with any follow-up like "okay, great".
   * The model must wait for the actual human to respond before saying anything else.
   *
   * Implementation: We send turnComplete: true so Gemini knows it is NOW its turn to
   * speak. After Gemini finishes its response (turn_complete from server), it enters
   * listening mode and the VAD (automatic_activity_detection) handles detecting caller
   * speech from the audio stream. The trigger text is kept minimal to prevent Gemini
   * from monologuing multiple consecutive turns.
   */
  sendOpeningMessage(text: string): void {
    if (DEBUG) console.log(`${LOG_PREFIX} 🎙️ sendOpeningMessage called: ws=${!!this.ws}, wsState=${this.ws?.readyState}, setupComplete=${this.setupComplete}`);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      // Instead of silently dropping, queue the message for when setup completes
      console.warn(`${LOG_PREFIX} ⏳ Opening message queued - not ready yet (ws=${!!this.ws}, state=${this.ws?.readyState}, setup=${this.setupComplete})`);
      this.pendingOpeningMessage = text;
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
    const triggerText = `[CALL CONNECTED] The phone line is now live. Say your greeting: "${text}" — then STOP and LISTEN.`;

    // Vertex AI uses camelCase, Google AI Studio uses snake_case
    const message = this.useVertexAI
      ? {
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: triggerText }] }],
            turnComplete: true,
          },
        }
      : {
          client_content: {
            turns: [{ role: 'user', parts: [{ text: triggerText }] }],
            turn_complete: true,
          },
        };

    this.ws.send(JSON.stringify(message));
    if (DEBUG) console.log(`${LOG_PREFIX} Opening message sent (turnComplete=true, minimal trigger): "${text.substring(0, 50)}..."`);
  }

  /**
   * Send a contextual opening based on what was heard during the initial listening window.
   * Instead of a generic greeting, this adapts to whether the right party answered,
   * a gatekeeper answered, or something else was detected.
   *
   * @param defaultGreeting - The default opening script (used for contact name)
   * @param callerType - 'right_party' | 'gatekeeper' — what was detected
   * @param heardText - What the caller said during the listening window
   */
  sendContextualOpening(defaultGreeting: string, callerType: 'right_party' | 'gatekeeper', heardText: string): void {
    if (DEBUG) console.log(`${LOG_PREFIX} 🎙️ sendContextualOpening called: type=${callerType}, heard="${heardText.substring(0, 80)}"`);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupComplete) {
      console.warn(`${LOG_PREFIX} ❌ Cannot send contextual opening - not ready`);
      return;
    }

    let triggerText: string;
    if (callerType === 'right_party') {
      // The contact identified themselves — skip identity check, go straight to introduction
      triggerText = `[CALL CONNECTED] The person who answered has already identified themselves as the contact. They said: "${heardText}".
Do NOT ask "Am I speaking with..." — identity is already confirmed.
Your response MUST be: Greet them warmly by first name, introduce yourself and your organization, then politely ask if they have a moment for a quick conversation (about a minute). Be warm, respectful, and concise. Then STOP and LISTEN for their response.`;
    } else {
      // Gatekeeper detected — ask for the contact
      triggerText = `[CALL CONNECTED] A gatekeeper/receptionist answered. They said: "${heardText}".
Respond naturally to their question. If they asked "who is calling" or similar, identify yourself briefly. Then politely ask to be connected to the contact. Keep it concise and professional.`;
    }

    const message = this.useVertexAI
      ? {
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: triggerText }] }],
            turnComplete: true,
          },
        }
      : {
          client_content: {
            turns: [{ role: 'user', parts: [{ text: triggerText }] }],
            turn_complete: true,
          },
        };

    this.ws.send(JSON.stringify(message));
    if (DEBUG) console.log(`${LOG_PREFIX} Contextual opening sent (type=${callerType}): "${triggerText.substring(0, 80)}..."`);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Log incoming message type (gated - fires on every WS message)
      if (DEBUG) {
        if (message.setup_complete || message.setupComplete) {
          console.log(`${LOG_PREFIX} 📬 Message received: SETUP_COMPLETE`);
        } else if (message.server_content || message.serverContent) {
          console.log(`${LOG_PREFIX} 📬 Message received: SERVER_CONTENT`);
        } else if (message.tool_call || message.toolCall) {
          console.log(`${LOG_PREFIX} 📬 Message received: TOOL_CALL`);
        } else {
          const msgStr = JSON.stringify(message);
          console.log(`${LOG_PREFIX} 📬 Message received (${this.setupComplete ? 'post-setup' : 'PRE-SETUP'}): ${msgStr.substring(0, 300)}`);
          if (!this.setupComplete && msgStr.length > 300) {
            console.log(`${LOG_PREFIX} 📬 Full pre-setup message: ${msgStr}`);
          }
        }
      }

      // Check for errors
      if (isGeminiError(message)) {
        console.error(`${LOG_PREFIX} 🚨 API error:`, message.error);
        console.error(`${LOG_PREFIX} 🚨 Full error details:`, JSON.stringify(message.error, null, 2));
        this.emitError(
          message.error.status || 'api_error',
          message.error.message,
          message.error.status !== 'UNAUTHENTICATED'
        );
        this.emit('error', new Error(message.error.message || 'Gemini API error'));
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
      if (DEBUG) console.log(`${LOG_PREFIX} Setup complete - ready to receive audio`);
      this.setupComplete = true;
      this.setConnected(true);
      // Initialize Speech-to-Text for user transcription (async, don't block)
      this.initializeSpeechToText().catch(err => {
        console.warn(`${LOG_PREFIX} STT init failed:`, err.message);
      });
      // Flush any queued opening message that arrived before setup completed
      if (this.pendingOpeningMessage) {
        const queuedText = this.pendingOpeningMessage;
        this.pendingOpeningMessage = null;
        if (DEBUG) console.log(`${LOG_PREFIX} 📤 Flushing queued opening message after setup_complete`);
        this.sendOpeningMessage(queuedText);
      }
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
             if (DEBUG) console.warn(`${LOG_PREFIX} ⚠️ Detected AudioPart but failed to extract data!`);
        }
      } else {
        if (DEBUG) console.log(`${LOG_PREFIX} ⚠️ No audio part in model turn. Parts: ${parts.map((p: any) => Object.keys(p)[0]).join(', ')}`);
      }

      // Handle text output (for transcription)
      if (hasTextPart(parts)) {
        const text = extractText(parts);
        if (text) {
          if (DEBUG) console.log(`${LOG_PREFIX} 📝 Text output: ${text.substring(0, 100)}`);
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
        if (DEBUG) console.log(`${LOG_PREFIX} 🔧 Function calls: ${functionCalls.map(f => f.name).join(', ')}`);
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
      if (DEBUG) {
        const contentKeys = Object.keys(content).filter(k => k !== 'model_turn' && k !== 'modelTurn');
        if (contentKeys.length > 0) {
          console.log(`${LOG_PREFIX} 📋 Server content (no model_turn), keys: ${contentKeys.join(', ')}`);
        }
      }
    }

    // Handle INPUT transcription - what Gemini heard from the caller
    // This is critical for detecting prospect speech via Gemini's own ASR
    if (content.input_transcription || content.inputTranscription) {
      const inputTranscription = content.input_transcription || content.inputTranscription;
      const text = inputTranscription.text || inputTranscription.transcript || '';
      const trimmedUserText = text.trim();
      if (trimmedUserText) {
        // Dedup: skip if same text emitted within 2s, or shorter substring of recent within 3s
        const now = Date.now();
        const timeSinceLast = now - this.lastEmittedUserTimestamp;
        if (trimmedUserText === this.lastEmittedUserText && timeSinceLast < 2000) {
          if (DEBUG) console.log(`${LOG_PREFIX} [Dedup] Skipping duplicate user transcription: "${trimmedUserText.substring(0, 50)}"`);
        } else if (this.lastEmittedUserText.includes(trimmedUserText) && timeSinceLast < 3000) {
          // New text is shorter substring of what we already emitted — skip
          if (DEBUG) console.log(`${LOG_PREFIX} [Dedup] Skipping subset user transcription: "${trimmedUserText.substring(0, 50)}"`);
        } else {
          // If new text contains the old text (supersedes), update tracking and emit
          this.lastEmittedUserText = trimmedUserText;
          this.lastEmittedUserTimestamp = now;

          if (DEBUG) console.log(`${LOG_PREFIX} 👂 INPUT TRANSCRIPTION (caller): "${trimmedUserText}"`);
          this.emit('transcript:user', {
            text: trimmedUserText,
            isFinal: true,
            timestamp: new Date(),
          });
        }
      }
    }

    // Handle OUTPUT transcription - what Gemini said (text version of its audio)
    // This is the AUTHORITATIVE source for agent speech transcription.
    // When present, it supersedes model_turn.parts text (currentTranscript).
    if (content.output_transcription || content.outputTranscription) {
      const outputTranscription = content.output_transcription || content.outputTranscription;
      const text = outputTranscription.text || outputTranscription.transcript || '';
      const trimmedAgentText = text.trim();
      if (trimmedAgentText) {
        // Mark that output_transcription is providing the text for this turn.
        // This prevents turn_complete from re-emitting the same content via currentTranscript.
        this.receivedOutputTranscription = true;
        // Clear the model_turn accumulated text since output_transcription supersedes it
        this.currentTranscript = '';

        // Dedup: skip if same text emitted within 2s, or shorter substring of recent within 3s
        const now = Date.now();
        const timeSinceLast = now - this.lastEmittedAgentTimestamp;
        if (trimmedAgentText === this.lastEmittedAgentText && timeSinceLast < 2000) {
          if (DEBUG) console.log(`${LOG_PREFIX} [Dedup] Skipping duplicate agent transcription: "${trimmedAgentText.substring(0, 50)}"`);
          // Early return from this block — no anti-repetition or emission needed
        } else if (this.lastEmittedAgentText.includes(trimmedAgentText) && timeSinceLast < 3000) {
          if (DEBUG) console.log(`${LOG_PREFIX} [Dedup] Skipping subset agent transcription: "${trimmedAgentText.substring(0, 50)}"`);
        } else {
        // Not a duplicate — proceed with anti-repetition check and emission
        this.lastEmittedAgentText = trimmedAgentText;
        this.lastEmittedAgentTimestamp = now;

        // ANTI-REPETITION CHECK: Detect if this is a repeated phrase
        // Only check for repetitions on substantial text (short phrases like
        // "I understand", "I see", "okay" are normal conversational fillers)
        const normalizedText = trimmedAgentText.toLowerCase().replace(/[^\w\s]/g, '');
        const wordCount = normalizedText.split(/\s+/).filter(w => w.length > 0).length;
        let isRepetition = false;

        // Only run repetition detection on phrases with 6+ words
        // Short phrases are natural conversational responses and should never be flagged
        if (wordCount >= 6) {
          isRepetition = this.recentPhrases.some(phrase => {
            const similarity = this.calculateSimilarity(normalizedText, phrase);
            return similarity > 0.92; // 92% similar = very likely true repetition (was 85% — too aggressive)
          });
        }

        if (isRepetition) {
          this.consecutiveRepetitions++;
          console.warn(`${LOG_PREFIX} ⚠️ REPETITION DETECTED (${this.consecutiveRepetitions}x): "${trimmedAgentText.substring(0, 50)}..."`);

          // Reduced escalation — only intervene on true loops (3+ consecutive)
          if (this.consecutiveRepetitions < 3) {
            // Level 1-2: Just log it and still emit — a couple repetitions can be normal
            console.warn(`${LOG_PREFIX} Level 1: Logging repetition (not suppressing yet)`);
            this.recentPhrases.push(normalizedText);
            if (this.recentPhrases.length > this.MAX_RECENT_PHRASES) {
              this.recentPhrases.shift();
            }
            this.emit('transcript:agent', {
              text: trimmedAgentText,
              isFinal: true,
              timestamp: new Date(),
            });
          } else if (this.consecutiveRepetitions < 5) {
            // Level 2: Cancel + gentle redirect (was Level 3 before)
            console.warn(`${LOG_PREFIX} Level 2: Cancel + redirect (${this.consecutiveRepetitions}x)`);
            this.cancelResponse();
            setTimeout(() => {
              this.sendTextMessage(
                "[SYSTEM: You are repeating yourself. Try a different approach or wait for the prospect to speak.]"
              );
            }, 200);
          } else {
            // Level 3: Nuclear — reset and wait (was Level 4 at 5x before)
            console.warn(`${LOG_PREFIX} Level 3: Nuclear reset (${this.consecutiveRepetitions}x)`);
            this.cancelResponse();
            this.recentPhrases = [];
            this.consecutiveRepetitions = 0;
            setTimeout(() => {
              this.sendTextMessage(
                "[SYSTEM: STOP repeating. Stay silent and wait for the other person to speak. " +
                "When they do, respond to what they actually say.]"
              );
            }, 200);
          }
        } else {
          this.consecutiveRepetitions = 0;
          // Track this phrase for future comparison (only substantial ones)
          if (wordCount >= 6) {
            this.recentPhrases.push(normalizedText);
            if (this.recentPhrases.length > this.MAX_RECENT_PHRASES) {
              this.recentPhrases.shift(); // Remove oldest
            }
          }

          if (DEBUG) console.log(`${LOG_PREFIX} 🗣️ OUTPUT TRANSCRIPTION (agent): "${trimmedAgentText}"`);
          this.emit('transcript:agent', {
            text: trimmedAgentText,
            isFinal: true,
            timestamp: new Date(),
          });
        }
        } // Close dedup else block
      }
    }

    // Turn complete
    if (content.turn_complete || content.turnComplete) {
      if (DEBUG) console.log(`${LOG_PREFIX} ✋ Turn complete signal received`);
      // Only emit accumulated model_turn text if output_transcription did NOT
      // already provide the authoritative transcription for this turn.
      // Emitting both causes duplicate/garbled text in the call transcript.
      if (this.currentTranscript && !this.receivedOutputTranscription) {
        if (DEBUG) console.log(`${LOG_PREFIX} 📝 Final transcript (from model_turn): ${this.currentTranscript}`);
        this.emit('transcript:agent', {
          text: this.currentTranscript,
          isFinal: true,
          timestamp: new Date(),
        });
      } else if (this.currentTranscript && this.receivedOutputTranscription) {
        if (DEBUG) console.log(`${LOG_PREFIX} 📝 Skipping model_turn transcript (output_transcription already emitted): ${this.currentTranscript}`);
      }
      this.currentTranscript = '';
      this.receivedOutputTranscription = false;
      this.emit('audio:done');
      this.setResponding(false, this.currentResponseId || undefined);
      this.currentResponseId = null;

      // Cooldown: a successful turn completion means the model is behaving normally
      if (this.consecutiveRepetitions > 0) {
        this.consecutiveRepetitions = Math.max(0, this.consecutiveRepetitions - 1);
      }
    }

    // Interrupted
    if (content.interrupted) {
      if (DEBUG) console.log(`${LOG_PREFIX} 🛑 Response interrupted`);
      this.currentTranscript = '';
      this.receivedOutputTranscription = false;

      // CRITICAL FIX: Reset repetition tracking on interruption.
      // When Gemini is interrupted, the phrase it was saying got cut off.
      // If it tries to say something similar next (resuming its thought),
      // we should NOT count that as a repetition — only true loops.
      this.consecutiveRepetitions = 0;
      if (this.recentPhrases.length > 5) {
        this.recentPhrases = this.recentPhrases.slice(-5);
      }

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
      if (DEBUG) console.log(`${LOG_PREFIX} 🎬 Starting new response: ${this.currentResponseId}`);
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
    if (DEBUG) {
      if (this.audioChunkCount === 1) {
        console.log(`${LOG_PREFIX} 🔊 FIRST AUDIO chunk: ${pcmBuffer.length}B PCM→${g711Buffer.length}B G.711 (${durationMs.toFixed(0)}ms)`);
      } else if (this.audioChunkCount % 100 === 0) {
        console.log(`${LOG_PREFIX} 📊 Audio stats: ${this.audioChunkCount} chunks, ${this.audioPlaybackMs.toFixed(0)}ms total playback`);
      }
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
  getAudioStats(): { bytesSent: number; playbackMs: number; backpressureDroppedFrames: number } {
    return {
      bytesSent: this.audioBytesSent,
      playbackMs: this.audioPlaybackMs,
      backpressureDroppedFrames: this.backpressureDroppedFrames,
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
   * Soft-reset repetition tracking after a major state transition (e.g. identity confirmation).
   * Keeps the last few phrases for minimal loop detection but resets the escalation counter.
   */
  softResetRepetitionTracking(): void {
    this.consecutiveRepetitions = 0;
    if (this.recentPhrases.length > 3) {
      this.recentPhrases = this.recentPhrases.slice(-3);
    }
    if (DEBUG) console.log(`${LOG_PREFIX} 🔄 Repetition tracking soft-reset (kept ${this.recentPhrases.length} phrases)`);
  }

  /**
   * Check if the provider is ready to receive audio
   */
  isReady(): boolean {
    return this._isConnected && this.setupComplete;
  }
}

export default GeminiLiveProvider;
