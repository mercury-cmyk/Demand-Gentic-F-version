import OpenAI from "openai";
import WebSocket from "ws";
import { EventEmitter } from "events";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { ensureVoiceAgentControlLayer } from "./voice-agent-control-defaults";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export interface AiAgentSettings {
  persona: {
    name: string;
    companyName: string;
    role: string;
    voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  };
  scripts: {
    opening: string;
    gatekeeper: string;
    pitch: string;
    objections: string;
    closing: string;
  };
  handoff: {
    enabled: boolean;
    triggers: string[];
    transferNumber: string;
  };
  gatekeeperLogic: {
    maxAttempts: number;
  };
}

export interface CallContext {
  contactFirstName: string;
  contactLastName: string;
  contactTitle?: string;
  contactEmail?: string;
  companyName: string;
  phoneNumber: string;
  campaignId: string;
  queueItemId: string;
  agentFullName?: string;
  agentFirstName?: string;
  contactId?: string;
  elevenLabsAgentId?: string; // Campaign-specific ElevenLabs agent ID (overrides env var)
  virtualAgentId?: string; // Virtual agent ID for tracking in reports
}

type ConversationPhase = "opening" | "gatekeeper" | "pitch" | "objection_handling" | "closing" | "handoff";

export interface AiVoiceAgentEvents {
  "conversation:started": (callId: string) => void;
  "conversation:phase": (phase: ConversationPhase) => void;
  "transcript:ai": (text: string) => void;
  "transcript:human": (text: string) => void;
  "handoff:triggered": (reason: string) => void;
  "call:completed": (disposition: string, summary: string) => void;
  "error": (error: Error) => void;
}

export class AiVoiceAgent extends EventEmitter {
  private settings: AiAgentSettings;
  private context: CallContext;
  private realtimeWs: WebSocket | null = null;
  private currentPhase: ConversationPhase = "opening";
  private gatekeeperAttempts = 0;
  private conversationHistory: { role: "ai" | "human"; text: string }[] = [];
  private callId: string;

  constructor(settings: AiAgentSettings, context: CallContext) {
    super();
    this.settings = settings;
    this.context = context;
    this.callId = `ai-call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private interpolateScript(script: string): string {
    return script
      .replace(/\{\{firstName\}\}/g, this.context.contactFirstName)
      .replace(/\{\{lastName\}\}/g, this.context.contactLastName)
      .replace(/\{\{companyName\}\}/g, this.context.companyName)
      .replace(/\{\{agentName\}\}/g, this.settings.persona.name)
      .replace(/\{\{agentCompany\}\}/g, this.settings.persona.companyName)
      .replace(/\{\{agentRole\}\}/g, this.settings.persona.role);
  }

  private async buildSystemPrompt(): Promise<string> {
    const personaIntro = `You are ${this.settings.persona.name}, a ${this.settings.persona.role} at ${this.settings.persona.companyName}. 
You are making an outbound sales call to ${this.context.contactFirstName} ${this.context.contactLastName} at ${this.context.companyName}.`;

    const gatekeeperInstructions = `
GATEKEEPER HANDLING:
If you encounter a gatekeeper (receptionist, assistant, or anyone who isn't ${this.context.contactFirstName}):
- Be professional and courteous
- State your name and company clearly
- Ask to be connected to ${this.context.contactFirstName}
- If asked "What is this regarding?", respond: "${this.interpolateScript(this.settings.scripts.gatekeeper)}"
- You have ${this.settings.gatekeeperLogic.maxAttempts} attempts to reach the decision maker
- If the gatekeeper refuses, ask for the best time to call back or offer to leave a message`;

    const pitchInstructions = `
WHEN YOU REACH ${this.context.contactFirstName.toUpperCase()}:
Opening: ${this.interpolateScript(this.settings.scripts.opening)}

Main Pitch: ${this.interpolateScript(this.settings.scripts.pitch)}

Closing: ${this.interpolateScript(this.settings.scripts.closing)}`;

    const objectionHandling = this.settings.scripts.objections
      ? `
OBJECTION HANDLING:
${this.interpolateScript(this.settings.scripts.objections)}`
      : "";

    const handoffInstructions = this.settings.handoff.enabled
      ? `
HANDOFF TRIGGERS:
Transfer the call to a human agent if any of these occur:
${this.settings.handoff.triggers.map((t) => `- ${t}`).join("\n")}
Say: "That's a great point. Let me connect you with one of our specialists who can better assist you."`
      : "";

    const prompt = `${personaIntro}

VOICE & TONE:
- Speak naturally and conversationally
- Be professional but warm and friendly
- Listen carefully and respond appropriately
- Keep responses concise (1-3 sentences typically)
- Don't be pushy or aggressive
- If the prospect says they're not interested, respect that gracefully

${gatekeeperInstructions}

${pitchInstructions}

${objectionHandling}

${handoffInstructions}

IMPORTANT:
- Always identify yourself at the start
- Be truthful and don't make claims you can't back up
- If you don't understand something, ask for clarification
- Log any key information the prospect shares for follow-up`;
    return ensureVoiceAgentControlLayer(prompt);

    // Build complete prompt with organization context from database
    const basePrompt = `${personaIntro}

  VOICE & TONE:
  - Speak naturally and conversationally
  - Be professional but warm and friendly
  - Listen carefully and respond appropriately
  - Keep responses concise (1-3 sentences typically)
  - Don't be pushy or aggressive
  - If the prospect says they're not interested, respect that gracefully

  ${gatekeeperInstructions}

  ${pitchInstructions}

  ${objectionHandling}

  ${handoffInstructions}

  IMPORTANT:
  - Always identify yourself at the start
  - Be truthful and don't make claims you can't back up
  - If you don't understand something, ask for clarification
  - Log any key information the prospect shares for follow-up`;

    // Wrap with organization context from database (includes compliance, policies, voice defaults)
    return await buildAgentSystemPrompt(basePrompt);
  }

  async startConversation(): Promise<void> {
    this.emit("conversation:started", this.callId);
    this.emit("conversation:phase", "opening");
  }

  async processIncomingAudio(audioBuffer: Buffer): Promise<Buffer | null> {
    return null;
  }

  async generateResponse(humanText: string): Promise<string> {
    this.conversationHistory.push({ role: "human", text: humanText });
    this.emit("transcript:human", humanText);

    const isGatekeeper = this.detectGatekeeper(humanText);
    if (isGatekeeper && this.currentPhase === "opening") {
      this.currentPhase = "gatekeeper";
      this.gatekeeperAttempts++;
      this.emit("conversation:phase", "gatekeeper");
    }

    const shouldHandoff = this.checkHandoffTriggers(humanText);
    if (shouldHandoff) {
      this.currentPhase = "handoff";
      this.emit("conversation:phase", "handoff");
      this.emit("handoff:triggered", shouldHandoff);
      return `That's a great point about ${shouldHandoff}. Let me connect you with one of our specialists who can better assist you with that.`;
    }

    try {
        const systemPrompt = await this.buildSystemPrompt();
      
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...this.conversationHistory.map((m) => ({
            role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
            content: m.text,
          })),
        ],
        max_tokens: 200,
        temperature: 0.7,
      });

      const aiResponse = response.choices[0]?.message?.content || "";
      this.conversationHistory.push({ role: "ai", text: aiResponse });
      this.emit("transcript:ai", aiResponse);

      this.updatePhaseFromResponse(humanText, aiResponse);

      return aiResponse;
    } catch (error) {
      this.emit("error", error as Error);
      throw error;
    }
  }

  private detectGatekeeper(text: string): boolean {
    const gatekeeperPhrases = [
      "who's calling",
      "who is calling",
      "may i ask who",
      "what is this regarding",
      "what is this about",
      "who are you with",
      "what company",
      "is this a sales call",
      "can i take a message",
      "they're not available",
      "he's not available",
      "she's not available",
      "in a meeting",
      "not in the office",
      "let me transfer you to",
    ];

    const lowerText = text.toLowerCase();
    return gatekeeperPhrases.some((phrase) => lowerText.includes(phrase));
  }

  private checkHandoffTriggers(text: string): string | null {
    if (!this.settings.handoff.enabled) return null;

    const lowerText = text.toLowerCase();

    const triggerPatterns: Record<string, string[]> = {
      explicit_request: [
        "speak to a person",
        "talk to someone",
        "real person",
        "human",
        "transfer me",
        "speak to a manager",
        "supervisor",
      ],
      complex_objection: [
        "that's not how we do things",
        "we tried that before",
        "our situation is different",
        "it's complicated",
      ],
      pricing_discussion: [
        "how much",
        "what's the cost",
        "pricing",
        "budget",
        "quote",
        "discount",
        "negotiate",
      ],
      technical_question: [
        "technical specifications",
        "integration",
        "api",
        "compatibility",
        "requirements",
        "implementation",
      ],
      angry_prospect: [
        "stop calling",
        "this is ridiculous",
        "waste of time",
        "harassment",
        "do not call",
        "annoyed",
        "frustrated",
      ],
      decision_maker_reached: [],
    };

    for (const trigger of this.settings.handoff.triggers) {
      const patterns = triggerPatterns[trigger] || [];
      for (const pattern of patterns) {
        if (lowerText.includes(pattern)) {
          return trigger;
        }
      }
    }

    return null;
  }

  private updatePhaseFromResponse(humanText: string, aiResponse: string): void {
    const lowerHuman = humanText.toLowerCase();

    if (
      this.currentPhase === "gatekeeper" &&
      (lowerHuman.includes("speaking") ||
        lowerHuman.includes("this is") ||
        lowerHuman.includes("hi") ||
        lowerHuman.includes("hello"))
    ) {
      const nameCheck = `${this.context.contactFirstName} ${this.context.contactLastName}`.toLowerCase();
      if (lowerHuman.includes(nameCheck) || lowerHuman.includes(this.context.contactFirstName.toLowerCase())) {
        this.currentPhase = "pitch";
        this.emit("conversation:phase", "pitch");
      }
    }

    if (this.currentPhase === "pitch") {
      const objectionIndicators = [
        "not interested",
        "no thanks",
        "we're all set",
        "already have",
        "don't need",
        "too expensive",
        "no budget",
      ];
      if (objectionIndicators.some((obj) => lowerHuman.includes(obj))) {
        this.currentPhase = "objection_handling";
        this.emit("conversation:phase", "objection_handling");
      }
    }
  }

  async endConversation(disposition: string): Promise<{ summary: string; transcript: string }> {
    const transcript = this.conversationHistory
      .map((m) => `${m.role === "ai" ? "AI" : "Prospect"}: ${m.text}`)
      .join("\n");

    let summary = "";
    try {
      const summaryResponse = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Summarize this sales call in 2-3 sentences. Include: who was reached, main outcome, and any follow-up actions needed.",
          },
          {
            role: "user",
            content: transcript,
          },
        ],
        max_tokens: 150,
      });
      summary = summaryResponse.choices[0]?.message?.content || "Call completed.";
    } catch {
      summary = `Call ended with disposition: ${disposition}`;
    }

    this.emit("call:completed", disposition, summary);

    return { summary, transcript };
  }

  getCallId(): string {
    return this.callId;
  }

  getOpeningMessage(): string {
    return this.interpolateScript(this.settings.scripts.opening);
  }

  getCurrentPhase(): ConversationPhase {
    return this.currentPhase;
  }

  getGatekeeperAttempts(): number {
    return this.gatekeeperAttempts;
  }

  getVoiceSetting(): string {
    return this.settings.persona.voice || "alloy";
  }
}

export function createAiVoiceAgent(settings: AiAgentSettings, context: CallContext): AiVoiceAgent {
  return new AiVoiceAgent(settings, context);
}
