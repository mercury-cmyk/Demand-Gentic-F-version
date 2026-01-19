/**
 * Gemini Live Voice Simulation Service
 *
 * Real-time voice simulation for campaign testing using Gemini Live API.
 * Provides WebSocket-based bidirectional audio streaming for:
 * - Sales call practice with AI prospects
 * - Objection handling training
 * - Script testing and refinement
 * - Agent performance evaluation
 *
 * Powered by Google Cloud Vertex AI Gemini Live (Native Audio)
 */

import WebSocket from "ws";
import { EventEmitter } from "events";
import { GoogleAuth } from "google-auth-library";
import { generateJSON, chat } from "./vertex-client";

// ==================== TYPES ====================

export interface SimulationSession {
  sessionId: string;
  status: "initializing" | "ready" | "active" | "completed" | "error";
  startTime?: Date;
  endTime?: Date;
  transcript: TranscriptEntry[];
  analysis?: SimulationAnalysis;
  config: SimulationConfig;
}

export interface SimulationConfig {
  scenarioType: "cold_call" | "follow_up" | "qualification" | "objection_handling" | "demo_request";
  prospectPersona: {
    name: string;
    title: string;
    company: string;
    industry: string;
    attitude: "friendly" | "busy" | "skeptical" | "interested" | "hostile";
    painPoints: string[];
  };
  agentContext?: {
    companyName: string;
    productName: string;
    valueProposition: string;
  };
  difficulty: "easy" | "medium" | "hard";
  maxDurationMinutes: number;
  recordAudio: boolean;
  voiceSettings: {
    voice: string; // Gemini voice name
    language: string;
  };
}

export interface TranscriptEntry {
  timestamp: Date;
  speaker: "agent" | "prospect";
  text: string;
  sentiment?: "positive" | "neutral" | "negative";
  isObjection?: boolean;
}

export interface SimulationAnalysis {
  overallScore: number;
  categoryScores: {
    opening: number;
    rapport: number;
    discovery: number;
    objectionHandling: number;
    closing: number;
  };
  objections: {
    raised: string[];
    handledWell: string[];
    missedOpportunities: string[];
  };
  strengths: string[];
  improvements: string[];
  recommendations: string[];
  callDuration: number;
  talkTimeRatio: {
    agent: number;
    prospect: number;
  };
}

export interface GeminiLiveMessage {
  type: "setup" | "audio" | "text" | "function_call" | "end_turn" | "close";
  data?: any;
}

// ==================== GEMINI LIVE SIMULATION CLASS ====================

export class GeminiLiveSimulation extends EventEmitter {
  private ws: WebSocket | null = null;
  private session: SimulationSession;
  private auth: GoogleAuth | null = null;
  private isConnected: boolean = false;
  private audioChunks: Buffer[] = [];

  constructor(config: SimulationConfig) {
    super();
    this.session = {
      sessionId: `SIM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      status: "initializing",
      transcript: [],
      config,
    };
  }

  /**
   * Generate the system prompt for the AI prospect
   */
  private generateProspectPrompt(): string {
    const { prospectPersona, scenarioType, difficulty, agentContext } = this.session.config;

    const attitudeDescriptions: Record<string, string> = {
      friendly: "You are open and receptive to the call, willing to have a conversation.",
      busy: "You are short on time and want to get to the point quickly. You may try to end the call early.",
      skeptical: "You question everything and need strong evidence before considering anything.",
      interested: "You have been researching solutions and are genuinely curious about what's offered.",
      hostile: "You are frustrated with sales calls and may be dismissive or challenging.",
    };

    const difficultyModifiers: Record<string, string> = {
      easy: "Be relatively easy to engage. Raise 1-2 soft objections that can be overcome with basic responses.",
      medium: "Be moderately challenging. Raise 2-3 objections including at least one about price or timing.",
      hard: "Be very challenging. Raise multiple strong objections, ask tough questions, and require excellent handling to stay engaged.",
    };

    const scenarioContexts: Record<string, string> = {
      cold_call: "You did not expect this call and have never heard of the caller's company.",
      follow_up: "You vaguely remember receiving an email but haven't responded.",
      qualification: "You agreed to this call but are still evaluating options.",
      objection_handling: "Focus on raising objections throughout the conversation.",
      demo_request: "You are interested but need to be convinced a demo is worth your time.",
    };

    return `You are playing the role of a B2B prospect in a sales call simulation.

CHARACTER:
- Name: ${prospectPersona.name}
- Title: ${prospectPersona.title}
- Company: ${prospectPersona.company}
- Industry: ${prospectPersona.industry}

PERSONALITY & ATTITUDE:
${attitudeDescriptions[prospectPersona.attitude]}

PAIN POINTS (things you care about):
${prospectPersona.painPoints.map((p) => `- ${p}`).join("\n")}

SCENARIO:
${scenarioContexts[scenarioType]}

DIFFICULTY LEVEL:
${difficultyModifiers[difficulty]}

${
  agentContext
    ? `
CALLER CONTEXT (for your reference):
- Company: ${agentContext.companyName}
- Product: ${agentContext.productName}
- Value Prop: ${agentContext.valueProposition}
`
    : ""
}

BEHAVIOR RULES:
1. Stay in character throughout the entire call
2. Respond naturally and conversationally
3. Ask questions a real prospect would ask
4. Raise realistic objections based on your persona
5. React appropriately to how the agent handles your objections
6. If the agent does well, gradually become more interested
7. If the agent does poorly, become less engaged
8. Keep your responses concise (1-3 sentences typically)
9. Answer the phone naturally: "This is ${prospectPersona.name}" or "${prospectPersona.company}, ${prospectPersona.name} speaking"

COMMON OBJECTIONS TO USE (based on your persona):
- "I'm busy right now, can you call back?"
- "We're not looking for anything right now"
- "How did you get my number?"
- "We already have a solution for that"
- "Send me an email instead"
- "What's this going to cost?"
- "I need to talk to my team first"

Remember: You are simulating a REAL prospect. Make this a valuable training exercise by being realistic, not unnecessarily difficult or easy.`;
  }

  /**
   * Connect to Gemini Live API
   */
  async connect(): Promise<void> {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION || "us-central1";
    const model = process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio";

    if (!projectId) {
      throw new Error("GOOGLE_CLOUD_PROJECT or GCP_PROJECT_ID required for Gemini Live");
    }

    return new Promise(async (resolve, reject) => {
      try {
        // Get OAuth token
        this.auth = new GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });

        const accessToken = await this.auth.getAccessToken();
        if (!accessToken) {
          throw new Error("Failed to get Google Cloud access token");
        }

        // Build WebSocket URL for Vertex AI
        const wsUrl = `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

        console.log(`[GeminiLiveSimulation] Connecting to ${wsUrl}`);

        this.ws = new WebSocket(wsUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            this.ws?.close();
            reject(new Error("Connection timeout"));
          }
        }, 15000);

        this.ws.on("open", () => {
          clearTimeout(timeout);
          console.log(`[GeminiLiveSimulation] Connected to Gemini Live`);
          this.sendSetupMessage();
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on("close", (code, reason) => {
          console.log(`[GeminiLiveSimulation] Connection closed: ${code}`);
          this.isConnected = false;
          this.session.status = "completed";
          this.emit("session:ended", this.session);
        });

        this.ws.on("error", (error) => {
          console.error(`[GeminiLiveSimulation] WebSocket error:`, error);
          this.session.status = "error";
          this.emit("error", error);
          reject(error);
        });

        // Wait for setup complete
        this.once("setup:complete", () => {
          this.isConnected = true;
          this.session.status = "ready";
          this.session.startTime = new Date();
          this.emit("session:ready", this.session);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send setup message to configure the session
   */
  private sendSetupMessage(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION || "us-central1";
    const model = process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio";

    const setupMessage = {
      setup: {
        model: `projects/${projectId}/locations/${location}/publishers/google/models/${model}`,
        generation_config: {
          response_modalities: ["AUDIO"],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: this.session.config.voiceSettings.voice || "Kore",
              },
            },
          },
          temperature: 0.8,
          max_output_tokens: 4096,
        },
        system_instruction: {
          parts: [{ text: this.generateProspectPrompt() }],
        },
        tools: [
          {
            function_declarations: [
              {
                name: "end_call",
                description: "End the phone call when the conversation naturally concludes or the prospect wants to hang up",
                parameters: {
                  type: "object",
                  properties: {
                    reason: {
                      type: "string",
                      description: "Why the call is ending",
                      enum: [
                        "meeting_scheduled",
                        "callback_scheduled",
                        "not_interested",
                        "prospect_busy",
                        "natural_conclusion",
                      ],
                    },
                    summary: {
                      type: "string",
                      description: "Brief summary of the call outcome",
                    },
                  },
                  required: ["reason"],
                },
              },
              {
                name: "show_interest",
                description: "Signal that the prospect is becoming interested",
                parameters: {
                  type: "object",
                  properties: {
                    level: {
                      type: "string",
                      enum: ["curious", "interested", "very_interested"],
                    },
                    trigger: {
                      type: "string",
                      description: "What caused the interest",
                    },
                  },
                  required: ["level"],
                },
              },
              {
                name: "raise_objection",
                description: "Raise a sales objection",
                parameters: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["price", "timing", "authority", "need", "competition", "trust"],
                    },
                    objection: {
                      type: "string",
                      description: "The specific objection text",
                    },
                  },
                  required: ["type", "objection"],
                },
              },
            ],
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(setupMessage));
    console.log(`[GeminiLiveSimulation] Setup message sent`);
  }

  /**
   * Handle incoming messages from Gemini Live
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Setup complete
      if (message.setupComplete) {
        console.log(`[GeminiLiveSimulation] Setup complete`);
        this.emit("setup:complete");
        return;
      }

      // Server content (audio/text response)
      if (message.serverContent || message.server_content) {
        const content = message.serverContent || message.server_content;

        // Handle audio
        if (content.modelTurn?.parts || content.model_turn?.parts) {
          const parts = content.modelTurn?.parts || content.model_turn?.parts;

          for (const part of parts) {
            // Audio data
            if (part.inlineData || part.inline_data) {
              const audioData = part.inlineData || part.inline_data;
              if (audioData.data) {
                const audioBuffer = Buffer.from(audioData.data, "base64");
                this.audioChunks.push(audioBuffer);
                this.emit("audio:prospect", audioBuffer);
              }
            }

            // Text (transcript)
            if (part.text) {
              this.addTranscriptEntry("prospect", part.text);
              this.emit("transcript:prospect", part.text);
            }
          }
        }

        // Turn complete
        if (content.turnComplete || content.turn_complete) {
          this.emit("turn:complete", "prospect");
        }
      }

      // Tool/function calls
      if (message.toolCall || message.tool_call) {
        const toolCall = message.toolCall || message.tool_call;
        const functionCalls = toolCall.functionCalls || toolCall.function_calls || [];

        for (const fc of functionCalls) {
          this.handleFunctionCall(fc.name, fc.args);
        }
      }
    } catch (error) {
      console.error(`[GeminiLiveSimulation] Error parsing message:`, error);
    }
  }

  /**
   * Handle function calls from the AI prospect
   */
  private handleFunctionCall(name: string, args: any): void {
    console.log(`[GeminiLiveSimulation] Function call: ${name}`, args);

    switch (name) {
      case "end_call":
        this.emit("call:ending", args);
        // Don't immediately close - let it play out
        break;

      case "show_interest":
        this.emit("prospect:interest", args);
        break;

      case "raise_objection":
        this.emit("prospect:objection", args);
        this.session.transcript.push({
          timestamp: new Date(),
          speaker: "prospect",
          text: `[OBJECTION: ${args.type}] ${args.objection}`,
          isObjection: true,
        });
        break;
    }

    // Send function response
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const response = {
        tool_response: {
          function_responses: [
            {
              id: `${name}-${Date.now()}`,
              name,
              response: { acknowledged: true },
            },
          ],
        },
      };
      this.ws.send(JSON.stringify(response));
    }
  }

  /**
   * Send audio from the agent (user) to the AI prospect
   */
  sendAgentAudio(audioBuffer: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConnected) {
      console.warn(`[GeminiLiveSimulation] Cannot send audio - not connected`);
      return;
    }

    this.session.status = "active";

    const message = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: "audio/pcm",
            data: audioBuffer.toString("base64"),
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send text message (for text-based simulation)
   */
  sendAgentText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConnected) {
      console.warn(`[GeminiLiveSimulation] Cannot send text - not connected`);
      return;
    }

    this.session.status = "active";
    this.addTranscriptEntry("agent", text);

    const message = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turn_complete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
    this.emit("transcript:agent", text);
  }

  /**
   * Signal that the agent's turn is complete
   */
  endAgentTurn(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message = {
      client_content: {
        turn_complete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
    this.emit("turn:complete", "agent");
  }

  /**
   * Add entry to transcript
   */
  private addTranscriptEntry(speaker: "agent" | "prospect", text: string): void {
    this.session.transcript.push({
      timestamp: new Date(),
      speaker,
      text,
    });
  }

  /**
   * End the simulation and generate analysis
   */
  async endSimulation(): Promise<SimulationAnalysis> {
    this.session.status = "completed";
    this.session.endTime = new Date();

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Generate analysis
    const analysis = await this.analyzeSimulation();
    this.session.analysis = analysis;

    this.emit("session:completed", this.session);

    return analysis;
  }

  /**
   * Analyze the simulation transcript
   */
  private async analyzeSimulation(): Promise<SimulationAnalysis> {
    const transcript = this.session.transcript
      .map((e) => `${e.speaker.toUpperCase()}: ${e.text}`)
      .join("\n");

    const duration = this.session.endTime && this.session.startTime
      ? Math.round((this.session.endTime.getTime() - this.session.startTime.getTime()) / 1000)
      : 0;

    const agentWords = this.session.transcript
      .filter((e) => e.speaker === "agent")
      .reduce((sum, e) => sum + e.text.split(" ").length, 0);

    const prospectWords = this.session.transcript
      .filter((e) => e.speaker === "prospect")
      .reduce((sum, e) => sum + e.text.split(" ").length, 0);

    const totalWords = agentWords + prospectWords;

    const analysisPrompt = `Analyze this sales call simulation and provide detailed coaching feedback.

SIMULATION CONFIG:
- Scenario: ${this.session.config.scenarioType}
- Prospect Attitude: ${this.session.config.prospectPersona.attitude}
- Difficulty: ${this.session.config.difficulty}

TRANSCRIPT:
${transcript}

CALL DURATION: ${duration} seconds

Analyze the agent's performance on:
1. Opening - How well did they introduce themselves and capture attention?
2. Rapport - Did they build connection with the prospect?
3. Discovery - Did they ask good questions to understand needs?
4. Objection Handling - How well did they address concerns?
5. Closing - Did they move toward a clear next step?

Also identify:
- All objections raised and how they were handled
- Key strengths shown
- Areas for improvement
- Specific recommendations

Return JSON:
{
  "overallScore": 0-100,
  "categoryScores": {
    "opening": 0-100,
    "rapport": 0-100,
    "discovery": 0-100,
    "objectionHandling": 0-100,
    "closing": 0-100
  },
  "objections": {
    "raised": ["objection 1"],
    "handledWell": ["objection that was handled well"],
    "missedOpportunities": ["objection that could have been handled better"]
  },
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement area 1"],
  "recommendations": ["specific recommendation 1"]
}`;

    const result = await generateJSON<{
      overallScore: number;
      categoryScores: {
        opening: number;
        rapport: number;
        discovery: number;
        objectionHandling: number;
        closing: number;
      };
      objections: {
        raised: string[];
        handledWell: string[];
        missedOpportunities: string[];
      };
      strengths: string[];
      improvements: string[];
      recommendations: string[];
    }>(analysisPrompt, { temperature: 0.3 });

    return {
      ...result,
      callDuration: duration,
      talkTimeRatio: {
        agent: totalWords > 0 ? Math.round((agentWords / totalWords) * 100) : 50,
        prospect: totalWords > 0 ? Math.round((prospectWords / totalWords) * 100) : 50,
      },
    };
  }

  /**
   * Get current session state
   */
  getSession(): SimulationSession {
    return this.session;
  }

  /**
   * Get transcript as text
   */
  getTranscript(): string {
    return this.session.transcript.map((e) => `${e.speaker.toUpperCase()}: ${e.text}`).join("\n");
  }

  /**
   * Check if simulation is active
   */
  isActive(): boolean {
    return this.isConnected && (this.session.status === "ready" || this.session.status === "active");
  }
}

// ==================== FACTORY FUNCTION ====================

export function createSimulation(config: SimulationConfig): GeminiLiveSimulation {
  return new GeminiLiveSimulation(config);
}

// ==================== QUICK SIMULATION HELPERS ====================

/**
 * Run a quick text-based simulation (no audio)
 */
export async function runTextSimulation(
  config: Omit<SimulationConfig, "recordAudio" | "voiceSettings">,
  agentMessages: string[]
): Promise<{
  transcript: TranscriptEntry[];
  analysis: SimulationAnalysis;
}> {
  const fullConfig: SimulationConfig = {
    ...config,
    recordAudio: false,
    voiceSettings: { voice: "Kore", language: "en-US" },
  };

  // For text simulation, we use regular chat instead of Live API
  const systemPrompt = new GeminiLiveSimulation(fullConfig)["generateProspectPrompt"]();

  const transcript: TranscriptEntry[] = [];
  const messages: { role: "user" | "model"; content: string }[] = [];

  for (const agentMessage of agentMessages) {
    transcript.push({
      timestamp: new Date(),
      speaker: "agent",
      text: agentMessage,
    });

    messages.push({ role: "user", content: agentMessage });

    const response = await chat(systemPrompt, messages, { temperature: 0.8 });

    transcript.push({
      timestamp: new Date(),
      speaker: "prospect",
      text: response,
    });

    messages.push({ role: "model", content: response });
  }

  // Analyze
  const sim = new GeminiLiveSimulation(fullConfig);
  (sim as any).session.transcript = transcript;
  (sim as any).session.startTime = transcript[0]?.timestamp || new Date();
  (sim as any).session.endTime = transcript[transcript.length - 1]?.timestamp || new Date();

  const analysis = await (sim as any).analyzeSimulation();

  return { transcript, analysis };
}

export default {
  GeminiLiveSimulation,
  createSimulation,
  runTextSimulation,
};
