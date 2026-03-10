/**
 * Kimi Voice Provider
 *
 * Implements IVoiceProvider for Moonshot AI's Kimi platform.
 * Architecture: STT (Google Cloud) → Kimi LLM → TTS (Google Cloud)
 *
 * Since Kimi doesn't have a native real-time audio WebSocket API,
 * this provider bridges:
 *   1. Inbound G.711 audio → PCM → Google STT streaming (speech-to-text)
 *   2. Recognized text → Kimi chat API (fast, intelligent responses)
 *   3. Kimi response text → Google TTS → PCM → G.711 outbound audio
 *
 * Advantages of Kimi as the LLM brain:
 *   - 128k context window for deep conversational memory
 *   - Strong reasoning and analysis capabilities
 *   - Cost-effective compared to OpenAI/Gemini for chat
 *   - Maintains full conversation history within call
 */

import { TextToSpeechClient, protos as ttsProtos } from "@google-cloud/text-to-speech";
import { SpeechClient, protos as sttProtos } from "@google-cloud/speech";
import {
  BaseVoiceProvider,
  VoiceProviderConfig,
  ProviderTool,
  mapVoiceToProvider,
} from "./voice-provider.interface";
import { AudioTranscoder } from "./audio-transcoder";
import { kimiChat, kimiGenerateJSON, isKimiConfigured, type KimiMessage } from "../kimi-client";
import { v4 as uuidv4 } from "uuid";

const LOG_PREFIX = "[Kimi-Voice]";
const DEBUG = process.env.DEBUG_VOICE_PROVIDERS === "true";

// ==================== VOICE MAPPING ====================

/** Map internal voice names → Google Cloud TTS voice names */
const KIMI_VOICE_MAP: Record<string, { name: string; gender: "MALE" | "FEMALE" }> = {
  // Map from common voice names to Google Cloud TTS voices
  kore: { name: "en-US-Neural2-F", gender: "FEMALE" },
  nova: { name: "en-US-Neural2-F", gender: "FEMALE" },
  shimmer: { name: "en-US-Neural2-C", gender: "FEMALE" },
  alloy: { name: "en-US-Neural2-A", gender: "MALE" },
  echo: { name: "en-US-Neural2-D", gender: "MALE" },
  fable: { name: "en-US-Neural2-J", gender: "MALE" },
  onyx: { name: "en-US-Neural2-D", gender: "MALE" },
  cedar: { name: "en-US-Studio-O", gender: "FEMALE" },
  marin: { name: "en-US-Studio-Q", gender: "MALE" },
  fenrir: { name: "en-US-Neural2-D", gender: "MALE" },
  puck: { name: "en-US-Neural2-A", gender: "MALE" },
  // Default
  default: { name: "en-US-Neural2-F", gender: "FEMALE" },
};

// ==================== KIMI VOICE PROVIDER ====================

export class KimiVoiceProvider extends BaseVoiceProvider {
  readonly providerName = "kimi" as any; // Extended provider type

  // Google Cloud clients
  private ttsClient: TextToSpeechClient | null = null;
  private sttClient: SpeechClient | null = null;
  private sttStream: ReturnType<SpeechClient["streamingRecognize"]> | null = null;

  // Audio transcoding
  private transcoder: AudioTranscoder | null = null;

  // Conversation state
  private conversationHistory: KimiMessage[] = [];
  private systemPrompt: string = "";
  private tools: ProviderTool[] = [];
  private voice: string = "default";
  private ttsVoiceName: string = "en-US-Neural2-F";
  private ttsGender: "MALE" | "FEMALE" = "FEMALE";

  // Turn detection state
  private speechBuffer: string = "";
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private isSpeaking: boolean = false;
  private silenceDurationMs: number = 800;

  // Rate limiting
  private lastResponseTime: number = 0;
  private minResponseIntervalMs: number = 500;

  // STT restart management
  private sttRestartTimer: ReturnType<typeof setInterval> | null = null;
  private readonly STT_STREAM_DURATION_MS = 55_000; // Restart before 60s Google limit

  async connect(): Promise<void> {
    if (!isKimiConfigured()) {
      throw new Error("Kimi API key not configured (KIMI_API_KEY)");
    }

    try {
      this.ttsClient = new TextToSpeechClient();
      this.sttClient = new SpeechClient();
      this.transcoder = new AudioTranscoder();

      console.log(`${LOG_PREFIX} Connected — Kimi LLM + Google STT/TTS ready`);
      this.setConnected(true);
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Connection failed:`, error.message);
      this.emitError("CONNECTION_FAILED", error.message, false);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.stopSttStream();
    if (this.sttRestartTimer) {
      clearInterval(this.sttRestartTimer);
      this.sttRestartTimer = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    this.ttsClient = null;
    this.sttClient = null;
    this.transcoder = null;
    this.conversationHistory = [];

    this.setConnected(false);
    console.log(`${LOG_PREFIX} Disconnected`);
  }

  async configure(config: VoiceProviderConfig): Promise<void> {
    this.config = config;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools || [];
    this.voice = config.voice || "default";
    this.silenceDurationMs = config.turnDetection?.silenceDurationMs || 800;

    // Resolve TTS voice
    const voiceKey = this.voice.toLowerCase();
    const mapped = KIMI_VOICE_MAP[voiceKey] || KIMI_VOICE_MAP.default;
    this.ttsVoiceName = mapped.name;
    this.ttsGender = mapped.gender;

    // Start STT streaming
    this.startSttStream();

    // Auto-restart STT stream before Google's 60s limit
    this.sttRestartTimer = setInterval(() => {
      if (this._isConnected) {
        this.restartSttStream();
      }
    }, this.STT_STREAM_DURATION_MS);

    console.log(`${LOG_PREFIX} Configured — voice: ${this.ttsVoiceName}, tools: ${this.tools.length}`);
  }

  sendAudio(audioBuffer: Buffer): void {
    if (!this.sttStream || !this.transcoder) return;

    try {
      // Convert G.711 → PCM 16kHz for Google STT
      const inputFormat = this.config?.inputAudioFormat || "g711_ulaw";
      let pcmData: Buffer;

      if (inputFormat === "g711_ulaw" || inputFormat === "g711_alaw") {
        pcmData = this.transcoder.g711ToPcm16k(audioBuffer, inputFormat === "g711_ulaw" ? "ulaw" : "alaw");
      } else {
        pcmData = audioBuffer;
      }

      // Feed to STT
      this.sttStream.write({
        audioContent: pcmData,
      });
    } catch (error: any) {
      if (DEBUG) console.warn(`${LOG_PREFIX} Audio send error:`, error.message);
    }
  }

  sendTextMessage(text: string): void {
    // Direct text input — process as if user said it
    this.processUserUtterance(text);
  }

  cancelResponse(): void {
    this._isResponding = false;
    console.log(`${LOG_PREFIX} Response cancelled`);
  }

  truncateAudio(_itemId: string, _audioEndMs: number): void {
    // Audio truncation for interruption — stop current TTS output
    this._isResponding = false;
  }

  respondToFunctionCall(callId: string, result: any): void {
    // Add function result to conversation and generate follow-up
    this.conversationHistory.push({
      role: "assistant",
      content: `[Function ${callId} returned: ${JSON.stringify(result)}]`,
    });

    // Generate follow-up response
    this.generateAndSpeakResponse();
  }

  triggerResponse(): void {
    if (this.speechBuffer.trim()) {
      this.processUserUtterance(this.speechBuffer.trim());
      this.speechBuffer = "";
    }
  }

  // ==================== STT MANAGEMENT ====================

  private startSttStream(): void {
    if (!this.sttClient) return;

    try {
      const request: sttProtos.google.cloud.speech.v1.IStreamingRecognitionConfig = {
        config: {
          encoding: "LINEAR16" as any,
          sampleRateHertz: 16000,
          languageCode: "en-US",
          enableAutomaticPunctuation: true,
          model: "phone_call",
          useEnhanced: true,
        },
        interimResults: true,
      };

      this.sttStream = this.sttClient.streamingRecognize(request as any);

      this.sttStream.on("data", (response: any) => {
        const result = response.results?.[0];
        if (!result) return;

        const transcript = result.alternatives?.[0]?.transcript || "";
        const isFinal = result.isFinal;

        if (transcript) {
          // Emit user transcript
          this.emit("transcript:user", {
            text: transcript,
            isFinal,
            timestamp: new Date(),
          });

          if (isFinal) {
            this.speechBuffer += " " + transcript;
            this.resetSilenceTimer();
          } else {
            // Interim — track that user is speaking
            if (!this.isSpeaking) {
              this.isSpeaking = true;
              this.emit("speech:started");
            }
            this.resetSilenceTimer();
          }
        }
      });

      this.sttStream.on("error", (error: any) => {
        // Ignore "stream closed" errors during restart
        if (error.code === 11 || error.message?.includes("ERR_STREAM_WRITE_AFTER_END")) return;
        console.warn(`${LOG_PREFIX} STT error:`, error.message);
      });

      this.sttStream.on("end", () => {
        if (DEBUG) console.log(`${LOG_PREFIX} STT stream ended`);
      });
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Failed to start STT:`, error.message);
    }
  }

  private stopSttStream(): void {
    if (this.sttStream) {
      try {
        this.sttStream.end();
      } catch {}
      this.sttStream = null;
    }
  }

  private restartSttStream(): void {
    if (DEBUG) console.log(`${LOG_PREFIX} Restarting STT stream (periodic)`);
    this.stopSttStream();
    this.startSttStream();
  }

  // ==================== TURN DETECTION ====================

  private resetSilenceTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);

    this.silenceTimer = setTimeout(() => {
      if (this.speechBuffer.trim()) {
        this.isSpeaking = false;
        this.emit("speech:stopped");

        const utterance = this.speechBuffer.trim();
        this.speechBuffer = "";
        this.processUserUtterance(utterance);
      }
    }, this.silenceDurationMs);
  }

  // ==================== KIMI LLM + TTS ====================

  private async processUserUtterance(text: string): Promise<void> {
    if (!text.trim()) return;

    // Rate limit
    const now = Date.now();
    if (now - this.lastResponseTime < this.minResponseIntervalMs) {
      if (DEBUG) console.log(`${LOG_PREFIX} Rate limited, skipping`);
      return;
    }
    this.lastResponseTime = now;

    const responseId = uuidv4();
    this.setResponding(true, responseId);

    try {
      // Add user message to history
      this.conversationHistory.push({ role: "user", content: text });

      // Check for function calls first
      if (this.tools.length > 0) {
        const functionCall = await this.detectFunctionCall(text);
        if (functionCall) {
          this.emit("function:call", {
            callId: uuidv4(),
            name: functionCall.name,
            args: functionCall.args,
          });
          this.setResponding(false, responseId);
          return;
        }
      }

      // Generate response via Kimi
      const response = await this.generateKimiResponse();

      // Add to history
      this.conversationHistory.push({ role: "assistant", content: response });

      // Emit agent transcript
      this.emit("transcript:agent", {
        text: response,
        isFinal: true,
        timestamp: new Date(),
      });

      // Convert to speech and send
      await this.textToSpeechAndSend(response, responseId);

      this.setResponding(false, responseId);
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Response generation error:`, error.message);
      this.emitError("RESPONSE_ERROR", error.message, true);
      this.setResponding(false, responseId);
    }
  }

  private async generateKimiResponse(): Promise<string> {
    // Build tools context for system prompt
    let toolsContext = "";
    if (this.tools.length > 0) {
      toolsContext = `\n\nYou have access to these functions (call them by saying their exact purpose naturally):\n${this.tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}`;
    }

    const fullSystemPrompt = this.systemPrompt + toolsContext;

    // Use last 20 messages for context (within Kimi's generous limits)
    const recentHistory = this.conversationHistory.slice(-20);

    const response = await kimiChat(fullSystemPrompt, recentHistory, {
      model: "fast", // Use 8k model for low latency in calls
      temperature: 0.7,
      maxTokens: 300, // Keep responses concise for voice
    });

    return response || "I'm sorry, I didn't catch that. Could you repeat?";
  }

  private async detectFunctionCall(
    text: string
  ): Promise<{ name: string; args: Record<string, any> } | null> {
    if (this.tools.length === 0) return null;

    try {
      const toolNames = this.tools.map((t) => t.name);
      const prompt = `Given this user statement in a phone conversation: "${text}"

Available functions: ${JSON.stringify(this.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })))}

If the user is requesting an action that maps to one of these functions, respond with:
{"function": "<function_name>", "args": {<extracted_args>}}

If the user is NOT requesting a function call (just talking/asking), respond with:
{"function": null}

Respond with JSON only.`;

      const result = await kimiGenerateJSON<{ function: string | null; args?: Record<string, any> }>(prompt, {
        model: "fast",
        temperature: 0.1,
      });

      if (result.function && toolNames.includes(result.function)) {
        return { name: result.function, args: result.args || {} };
      }
    } catch {
      // Function detection failed — treat as regular conversation
    }

    return null;
  }

  private async textToSpeechAndSend(text: string, responseId: string): Promise<void> {
    if (!this.ttsClient || !this.transcoder) return;

    try {
      // Split long responses into sentences for faster first-byte
      const sentences = this.splitIntoSentences(text);

      for (const sentence of sentences) {
        if (!this._isConnected || !this._isResponding) break; // Interrupted

        const [ttsResponse] = await this.ttsClient.synthesizeSpeech({
          input: { text: sentence },
          voice: {
            languageCode: "en-US",
            name: this.ttsVoiceName,
            ssmlGender: this.ttsGender as any,
          },
          audioConfig: {
            audioEncoding: "LINEAR16" as any,
            sampleRateHertz: 24000,
            speakingRate: 1.05, // Slightly faster for natural phone pacing
            pitch: 0,
          },
        });

        if (!ttsResponse.audioContent) continue;

        const pcm24k = Buffer.from(ttsResponse.audioContent as Uint8Array);

        // Convert PCM 24kHz → G.711 for Telnyx
        const outputFormat = this.config?.outputAudioFormat || "g711_ulaw";
        let outBuffer: Buffer;

        if (outputFormat === "g711_ulaw" || outputFormat === "g711_alaw") {
          outBuffer = this.transcoder.pcm24kToG711(pcm24k, outputFormat === "g711_ulaw" ? "ulaw" : "alaw");
        } else {
          outBuffer = pcm24k;
        }

        // Emit audio in chunks matching expected frame size (~20ms)
        const chunkSize = 160; // 160 bytes = 20ms at 8kHz G.711
        for (let offset = 0; offset < outBuffer.length; offset += chunkSize) {
          if (!this._isResponding) break; // Check for interruption

          const chunk = outBuffer.subarray(offset, Math.min(offset + chunkSize, outBuffer.length));
          this.emit("audio:delta", {
            audioBuffer: chunk,
            format: outputFormat,
            durationMs: 20,
          });
        }
      }

      this.emit("audio:done");
    } catch (error: any) {
      console.error(`${LOG_PREFIX} TTS error:`, error.message);
      this.emitError("TTS_ERROR", error.message, true);
    }
  }

  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries for streaming TTS
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  async generateAndSpeakResponse(): Promise<void> {
    const response = await this.generateKimiResponse();
    this.conversationHistory.push({ role: "assistant", content: response });

    this.emit("transcript:agent", {
      text: response,
      isFinal: true,
      timestamp: new Date(),
    });

    const responseId = uuidv4();
    this.setResponding(true, responseId);
    await this.textToSpeechAndSend(response, responseId);
    this.setResponding(false, responseId);
  }
}
