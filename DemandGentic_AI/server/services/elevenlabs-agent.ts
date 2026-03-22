import { EventEmitter } from "events";
import WebSocket from "ws";

interface ElevenLabsAgentConfig {
  agentId: string;
  apiKey: string;
  firstMessage?: string;
  systemPrompt?: string;
  voiceId?: string;
  customData?: Record;
}

interface ConversationMessage {
  type: string;
  audio?: {
    chunk?: string;
    sample_rate?: number;
  };
  transcript?: string;
  text?: string;
  is_final?: boolean;
  conversation_id?: string;
}

export class ElevenLabsConversationalAgent extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: ElevenLabsAgentConfig;
  private conversationId: string | null = null;
  private isConnected: boolean = false;
  private audioQueue: Buffer[] = [];

  constructor(config: ElevenLabsAgentConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise {
    return new Promise((resolve, reject) => {
      const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${this.config.agentId}`;
      
      console.log(`[ElevenLabs] Connecting to Conversational AI: ${this.config.agentId}`);
      
      this.ws = new WebSocket(url, {
        headers: {
          "xi-api-key": this.config.apiKey,
        },
      });

      this.ws.on("open", () => {
        console.log("[ElevenLabs] WebSocket connected");
        this.isConnected = true;
        
        // Send initial configuration
        const initConfig: any = {
          type: "conversation_initiation_client_data",
        };
        
        if (this.config.systemPrompt || this.config.firstMessage || this.config.voiceId) {
          initConfig.conversation_config_override = {
            agent: {},
          };
          
          if (this.config.systemPrompt) {
            initConfig.conversation_config_override.agent.prompt = {
              prompt: this.config.systemPrompt,
            };
          }
          
          if (this.config.firstMessage) {
            initConfig.conversation_config_override.agent.first_message = this.config.firstMessage;
          }
          
          if (this.config.voiceId) {
            initConfig.conversation_config_override.agent.tts = {
              voice_id: this.config.voiceId,
            };
          }
        }
        
        if (this.config.customData) {
          initConfig.custom_llm_extra_body = this.config.customData;
        }
        
        this.ws!.send(JSON.stringify(initConfig));
        resolve();
      });

      this.ws.on("message", (data: Buffer | string) => {
        try {
          const message: ConversationMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error("[ElevenLabs] Failed to parse message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("[ElevenLabs] WebSocket error:", error);
        this.emit("error", error);
        reject(error);
      });

      this.ws.on("close", (code, reason) => {
        console.log(`[ElevenLabs] WebSocket closed: ${code} - ${reason}`);
        this.isConnected = false;
        this.emit("close", { code, reason: reason.toString() });
      });

      // Timeout for connection
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error("Connection timeout"));
        }
      }, 10000);
    });
  }

  private handleMessage(message: ConversationMessage): void {
    switch (message.type) {
      case "conversation_initiation_metadata":
        this.conversationId = message.conversation_id || null;
        console.log(`[ElevenLabs] Conversation started: ${this.conversationId}`);
        this.emit("conversation:started", { conversationId: this.conversationId });
        break;

      case "audio":
        if (message.audio?.chunk) {
          // Audio is base64 encoded PCM
          const audioBuffer = Buffer.from(message.audio.chunk, "base64");
          this.emit("audio:chunk", {
            audio: audioBuffer,
            sampleRate: message.audio.sample_rate || 16000,
          });
        }
        break;

      case "agent_response":
        if (message.text) {
          console.log(`[ElevenLabs] Agent response: ${message.text.substring(0, 100)}...`);
          this.emit("agent:response", { text: message.text });
        }
        break;

      case "user_transcript":
        if (message.transcript) {
          console.log(`[ElevenLabs] User said: ${message.transcript}`);
          this.emit("user:transcript", {
            text: message.transcript,
            isFinal: message.is_final || false,
          });
        }
        break;

      case "interruption":
        console.log("[ElevenLabs] User interrupted");
        this.emit("interruption");
        break;

      case "ping":
        // Respond to ping with pong
        if (this.ws && this.isConnected) {
          this.ws.send(JSON.stringify({ type: "pong" }));
        }
        break;

      case "error":
        console.error("[ElevenLabs] Error from server:", message);
        this.emit("error", message);
        break;

      default:
        console.log(`[ElevenLabs] Unknown message type: ${message.type}`);
    }
  }

  sendAudio(audioBuffer: Buffer): void {
    if (!this.ws || !this.isConnected) {
      console.warn("[ElevenLabs] Cannot send audio - not connected");
      return;
    }

    // ElevenLabs expects base64 encoded audio or raw binary
    // Send as binary for efficiency
    this.ws.send(audioBuffer);
  }

  sendAudioBase64(audioBase64: string): void {
    if (!this.ws || !this.isConnected) {
      console.warn("[ElevenLabs] Cannot send audio - not connected");
      return;
    }

    const message = {
      type: "audio",
      audio: {
        chunk: audioBase64,
      },
    };
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    if (this.ws) {
      console.log("[ElevenLabs] Disconnecting...");
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  getConversationId(): string | null {
    return this.conversationId;
  }

  isActive(): boolean {
    return this.isConnected;
  }
}

// Voice presets for ElevenLabs
export const ELEVENLABS_VOICES = {
  rachel: "21m00Tcm4TlvDq8ikWAM",      // Calm, professional female
  domi: "AZnzlk1XvdvUeBnXmlld",         // Strong, confident female
  bella: "EXAVITQu4vr4xnSDxMaL",        // Soft, friendly female
  antoni: "ErXwobaYiN019PkySvjV",       // Well-rounded male
  elli: "MF3mGyEYCl7XYWbV9V6O",         // Emotional, young female
  josh: "TxGEqnHWrfWFTfGW9XjX",         // Deep, mature male
  arnold: "VR6AewLTigWG4xSOukaG",       // Crisp, older male
  adam: "pNInz6obpgDQGcFmaJgB",         // Deep, authoritative male
  sam: "yoZ06aMxZJJ28mfd3POQ",          // Dynamic, young male
};

export function createElevenLabsAgent(
  agentId: string,
  options?: {
    firstMessage?: string;
    systemPrompt?: string;
    voiceName?: keyof typeof ELEVENLABS_VOICES;
    customData?: Record;
  }
): ElevenLabsConversationalAgent {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  return new ElevenLabsConversationalAgent({
    agentId,
    apiKey,
    firstMessage: options?.firstMessage,
    systemPrompt: options?.systemPrompt,
    voiceId: options?.voiceName ? ELEVENLABS_VOICES[options.voiceName] : undefined,
    customData: options?.customData,
  });
}