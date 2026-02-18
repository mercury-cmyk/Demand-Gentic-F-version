import OpenAI from "openai";
import WebSocket from "ws";
import { EventEmitter } from "events";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { ensureVoiceAgentControlLayer } from "./voice-agent-control-defaults";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { chat as vertexChat, generateText as vertexGenerateText } from "./vertex-ai/vertex-client";
import {
  buildAccountContextSection,
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  getAccountProfileData,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
  type AccountProfileData,
} from "./account-messaging-service";
import {
  buildCallPlanContextSection,
  buildParticipantCallContext,
  getCallMemoryNotes,
  getOrBuildAccountCallBrief,
  getOrBuildParticipantCallPlan,
} from "./account-call-service";

let openai: OpenAI | null = null;
let gemini: GoogleGenerativeAI | null = null;

function getOpenAI(): OpenAI {
  throw new Error("OpenAI provider is disabled for voice agents.");
}

function getGemini(): GoogleGenerativeAI {
  if (!gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY or GOOGLE_AI_API_KEY is not configured");
    }
    gemini = new GoogleGenerativeAI(apiKey);
  }
  return gemini;
}

async function generateGeminiChatResponse(
  systemPrompt: string,
  messages: Array<{ role: "ai" | "human"; text: string }>,
  options: { maxTokens: number; temperature: number }
): Promise<string> {
  const chatMessages = messages.map((m) => ({
    role: m.role === "ai" ? ("model" as const) : ("user" as const),
    content: m.text,
  }));

  try {
    const response = await vertexChat(systemPrompt, chatMessages, {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
    if (response) {
      return response;
    }
  } catch (error) {
    console.warn("[AiVoiceAgent] Vertex AI chat failed, falling back to Gemini API:", error);
  }

  const modelName = process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash-001";
  const model = getGemini().getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });

  const history = chatMessages
    .filter((m) => m.role === "user" || m.role === "model")
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

  const chat = model.startChat({ history });
  const lastHuman = [...messages].reverse().find((m) => m.role === "human");
  const fallbackUserMessage = lastHuman?.text || "Please continue the conversation.";
  const result = await chat.sendMessage(fallbackUserMessage);
  return result.response.text();
}

async function generateGeminiText(prompt: string, maxTokens: number): Promise<string> {
  try {
    const response = await vertexGenerateText(prompt, { maxTokens, temperature: 0.3 });
    if (response) {
      return response;
    }
  } catch (error) {
    console.warn("[AiVoiceAgent] Vertex AI text generation failed, falling back to Gemini API:", error);
  }

  const modelName = process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash-001";
  const model = getGemini().getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

export interface AiAgentSettings {
  persona: {
    name: string;
    companyName: string;
    role: string;
    // marin & cedar are highest quality, most natural voices (recommended)
    voice:
      | "alloy"
      | "ash"
      | "ballad"
      | "coral"
      | "echo"
      | "sage"
      | "shimmer"
      | "verse"
      | "marin"
      | "cedar"
      | "nova"
      | "fable"
      | "onyx"
      | "Puck"
      | "Charon"
      | "Kore"
      | "Fenrir"
      | "Aoede"
      | "Leda"
      | "Orus"
      | "Zephyr";
  };
  scripts: {
    opening: string;
    gatekeeper: string;
    pitch: string;
    objections: string;
    closing: string;
    systemPrompt?: string;
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
  accountId?: string;
  agentFullName?: string;
  agentFirstName?: string;
  contactId?: string;
  elevenLabsAgentId?: string; // Campaign-specific ElevenLabs agent ID (overrides env var)
  virtualAgentId?: string; // Virtual agent ID for tracking in reports
  runId?: string; // Dialer run ID for unified tracking
  callAttemptId?: string; // Dialer call attempt ID for unified tracking
  // Campaign context for AI agent behavior
  organizationName?: string; // The organization name (NOT campaign name)
  campaignObjective?: string; // e.g., "Book qualified meetings with IT decision makers"
  successCriteria?: string; // e.g., "Meeting booked with decision maker"
  targetAudienceDescription?: string; // e.g., "CISOs at mid-market companies"
  productServiceInfo?: string; // Product/service details
  talkingPoints?: string[]; // Key points to mention
  // Max call duration in seconds - auto-hangup after this time
  maxCallDurationSeconds?: number;
  // Number pool tracking for metrics and rotation
  callerNumberId?: string | null; // Pool number ID used for this call
  callerNumberDecisionId?: string | null; // Routing decision ID for audit
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
  private readonly MAX_CONVERSATION_HISTORY = 30; // Keep last 30 turns to limit token usage
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
    const { accountId, contactId } = this.context;
    
    // Initialize context sections
    let accountContextSection = null;
    let callPlanContextSection = null;

    // Only fetch intelligence if we have the required IDs
    if (!accountId || !contactId) {
      console.warn("Missing accountId or contactId - skipping account intelligence and call planning.");
    } else {
      const accountIntelligenceRecord = await getOrBuildAccountIntelligence(accountId);
      const accountMessagingBriefRecord = await getOrBuildAccountMessagingBrief({
        accountId: accountId,
        campaignId: this.context.campaignId || null,
        intelligenceRecord: accountIntelligenceRecord,
      });

      // Load account profile data for including in context
      const accountProfile = await getAccountProfileData(accountId);

      accountContextSection = buildAccountContextSection(
        accountIntelligenceRecord.payloadJson as AccountIntelligencePayload,
        accountMessagingBriefRecord.payloadJson as AccountMessagingBriefPayload,
        accountProfile
      );

      const accountCallBriefRecord = await getOrBuildAccountCallBrief({
        accountId: accountId,
        campaignId: this.context.campaignId || null,
      });
      const participantContext = await buildParticipantCallContext(contactId);
      const participantCallPlanRecord = await getOrBuildParticipantCallPlan({
        accountId: accountId,
        contactId: contactId,
        campaignId: this.context.campaignId || null,
        attemptNumber: 1,
        callAttemptId: null,
        accountCallBrief: accountCallBriefRecord,
      });
      const memoryNotes = await getCallMemoryNotes(accountId, contactId);
      callPlanContextSection = buildCallPlanContextSection({
        accountCallBrief: accountCallBriefRecord.payloadJson as any,
        participantCallPlan: participantCallPlanRecord.payloadJson as any,
        participantContext,
        memoryNotes,
      });
    }

    const personaIntro = `You are ${this.settings.persona.name}, a ${this.settings.persona.role} at ${this.settings.persona.companyName}.
  You are making an outbound sales call to ${this.context.contactFirstName} ${this.context.contactLastName} at ${this.context.companyName}.

  Your job is to be crystal clear about why you're calling, avoid vague phrases like "that's what we do" or "we have a platform", and always connect your reason for calling to a concrete benefit for their team.`;

    // Default scripts if not provided
    const defaultScripts = {
      opening: `Hi, this is {{agentName}} from {{agentCompany}}. Am I speaking with {{firstName}}?`,
      gatekeeper: `I'm calling to share a specific idea for how we can improve {{companyName}}'s demand generation performance, not a generic sales pitch.`,
      pitch: `I'm reaching out because we've been helping B2B teams like {{companyName}} use agentic, intelligence-led outreach to turn more good-fit accounts into real pipeline without adding more manual SDR effort. In a couple of minutes I can share what we're seeing work for demand leaders right now and see if any of it maps to your world.`,
      closing: `If this sounds at least directionally relevant, let's put 20–25 minutes on the calendar so we can go a level deeper on your current motion and share what's working for peers.`,
      objections: `If they say they don't have time right now, acknowledge it and immediately pivot to a specific next step. For example: "I completely understand the time crunch. Rather than trying to cram this in now, would it be more helpful if we picked a 20-minute slot later this week so you can actually focus? I can send a calendar link for a time that works best for you." If they offer to receive a link or callback, confirm one concrete next step (either a specific time window or that you'll send a short follow-up with a scheduling link) instead of leaving it open-ended.`,
    };
    const scripts = {
      opening: this.settings.scripts?.opening || defaultScripts.opening,
      gatekeeper: this.settings.scripts?.gatekeeper || defaultScripts.gatekeeper,
      pitch: this.settings.scripts?.pitch || defaultScripts.pitch,
      closing: this.settings.scripts?.closing || defaultScripts.closing,
      objections: this.settings.scripts?.objections || defaultScripts.objections,
    };
    const maxGatekeeperAttempts = this.settings.gatekeeperLogic?.maxAttempts || 3;

    const gatekeeperInstructions = `
GATEKEEPER HANDLING:
If you encounter a gatekeeper (receptionist, assistant, or anyone who isn't ${this.context.contactFirstName}):
- Be professional and courteous
- State your name and company clearly
- Ask to be connected to ${this.context.contactFirstName}
- If asked "What is this regarding?", respond: "${this.interpolateScript(scripts.gatekeeper)}"
- You have ${maxGatekeeperAttempts} attempts to reach the decision maker
- If the gatekeeper refuses, ask for the best time to call back or offer to leave a message`;

    const pitchInstructions = `
WHEN YOU REACH ${this.context.contactFirstName.toUpperCase()}:
Opening: ${this.interpolateScript(scripts.opening)}

Main Pitch: ${this.interpolateScript(scripts.pitch)}

Closing: ${this.interpolateScript(scripts.closing)}`;

    const objectionHandling = scripts.objections
      ? `
OBJECTION HANDLING:
${this.interpolateScript(scripts.objections)}`
      : "";

    const handoffInstructions = this.settings.handoff?.enabled && this.settings.handoff?.triggers?.length
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
    return ensureVoiceAgentControlLayer(
      `${prompt}\n\n---\n\n${accountContextSection}\n\n---\n\n${callPlanContextSection}`
    );

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
      
      // Prune history to last N turns to prevent quadratic token growth
      const historyForApi = this.conversationHistory.length > this.MAX_CONVERSATION_HISTORY
        ? this.conversationHistory.slice(-this.MAX_CONVERSATION_HISTORY)
        : this.conversationHistory;

      const aiResponse = await generateGeminiChatResponse(
        systemPrompt,
        historyForApi,
        { maxTokens: 200, temperature: 0.7 }
      );
      this.conversationHistory.push({ role: "ai", text: aiResponse });
      // Trim stored history to prevent memory growth
      while (this.conversationHistory.length > this.MAX_CONVERSATION_HISTORY) {
        this.conversationHistory.shift();
      }
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
      summary = await generateGeminiText(
        `Summarize this sales call in 2-3 sentences. Include: who was reached, main outcome, and any follow-up actions needed.\n\n${transcript}`,
        150
      );
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
    const defaultOpening = `Hi, this is {{agentName}} from {{agentCompany}}. Am I speaking with {{firstName}}?`;
    const opening = this.settings.scripts?.opening || defaultOpening;
    return this.interpolateScript(opening);
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
