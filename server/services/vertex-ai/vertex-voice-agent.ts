/**
 * Vertex AI Voice Agent Service
 *
 * Voice agent implementation powered by Vertex AI Gemini.
 * Replaces OpenAI-based voice agent with Google Cloud native solution.
 *
 * Features:
 * - Gemini-powered conversation management
 * - Real-time streaming responses
 * - Function calling for dispositions and actions
 * - Integration with Telnyx for telephony
 */

import { EventEmitter } from "events";
import {
  chat,
  streamChat,
  generateWithFunctions,
  type ChatMessage,
  type FunctionDeclaration,
} from "./vertex-client";
import {
  generateVertexMasterPrompt,
  determineDisposition,
  summarizeCall,
  handleObjection,
  type VertexAgentCreationInput,
} from "./vertex-agent-brain";
import { getOrganizationBrain } from "../agent-brain-service";
import {
  buildAccountContextSection,
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
} from "../account-messaging-service";
import {
  buildCallPlanContextSection,
  buildParticipantCallContext,
  getCallMemoryNotes,
  getOrBuildAccountCallBrief,
  getOrBuildParticipantCallPlan,
} from "../account-call-service";
import { ensureVoiceAgentControlLayer } from "../voice-agent-control-defaults";

// ==================== TYPES ====================

export interface VertexAgentSettings {
  persona: {
    name: string;
    companyName: string;
    role: string;
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

export interface VertexCallContext {
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
  virtualAgentId?: string;
}

type ConversationPhase = "opening" | "gatekeeper" | "pitch" | "objection_handling" | "closing" | "handoff";

export interface VertexVoiceAgentEvents {
  "conversation:started": (callId: string) => void;
  "conversation:phase": (phase: ConversationPhase) => void;
  "transcript:ai": (text: string) => void;
  "transcript:human": (text: string) => void;
  "handoff:triggered": (reason: string) => void;
  "function:called": (name: string, args: Record<string, any>) => void;
  "call:completed": (disposition: string, summary: string) => void;
  "error": (error: Error) => void;
}

// ==================== FUNCTION DECLARATIONS ====================

const AGENT_FUNCTIONS: FunctionDeclaration[] = [
  {
    name: "submit_disposition",
    description: "Submit the final disposition for this call. Call this when the conversation has concluded.",
    parameters: {
      type: "object",
      properties: {
        disposition: {
          type: "string",
          description: "The call outcome",
          enum: ["qualified_lead", "not_interested", "do_not_call", "callback_requested", "voicemail", "no_answer", "invalid_data"],
        },
        notes: {
          type: "string",
          description: "Any relevant notes about the call",
        },
      },
      required: ["disposition"],
    },
  },
  {
    name: "schedule_callback",
    description: "Schedule a callback with the prospect at a specific time",
    parameters: {
      type: "object",
      properties: {
        dateTime: {
          type: "string",
          description: "The date and time for the callback (ISO 8601 format)",
        },
        notes: {
          type: "string",
          description: "Notes about why the callback was scheduled",
        },
      },
      required: ["dateTime"],
    },
  },
  {
    name: "transfer_to_human",
    description: "Transfer the call to a human agent",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "The reason for the transfer",
        },
        urgency: {
          type: "string",
          description: "Urgency level",
          enum: ["low", "medium", "high"],
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "log_key_info",
    description: "Log important information shared by the prospect",
    parameters: {
      type: "object",
      properties: {
        infoType: {
          type: "string",
          description: "Type of information",
          enum: ["budget", "timeline", "decision_maker", "pain_point", "competitor", "other"],
        },
        details: {
          type: "string",
          description: "The specific information to log",
        },
      },
      required: ["infoType", "details"],
    },
  },
];

// ==================== VERTEX VOICE AGENT CLASS ====================

export class VertexVoiceAgent extends EventEmitter {
  private settings: VertexAgentSettings;
  private context: VertexCallContext;
  private currentPhase: ConversationPhase = "opening";
  private gatekeeperAttempts = 0;
  private conversationHistory: ChatMessage[] = [];
  private callId: string;
  private systemPrompt: string = "";
  private loggedInfo: { infoType: string; details: string }[] = [];

  constructor(settings: VertexAgentSettings, context: VertexCallContext) {
    super();
    this.settings = settings;
    this.context = context;
    this.callId = `vertex-call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
      // Build account context
      const accountIntelligenceRecord = await getOrBuildAccountIntelligence(accountId);
      const accountMessagingBriefRecord = await getOrBuildAccountMessagingBrief({
        accountId: accountId,
        campaignId: this.context.campaignId || null,
        intelligenceRecord: accountIntelligenceRecord,
      });
      accountContextSection = buildAccountContextSection(
        accountIntelligenceRecord.payloadJson as AccountIntelligencePayload,
        accountMessagingBriefRecord.payloadJson as AccountMessagingBriefPayload
      );

      // Build call plan context
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

    // Build persona and scripts
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
Transfer the call to a human agent using the transfer_to_human function if any of these occur:
${this.settings.handoff.triggers.map((t) => `- ${t}`).join("\n")}
Say: "That's a great point. Let me connect you with one of our specialists who can better assist you."`
      : "";

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

FUNCTION CALLING:
- Use submit_disposition when the call concludes to record the outcome
- Use schedule_callback if the prospect wants to talk at a specific time
- Use transfer_to_human if handoff conditions are met
- Use log_key_info to capture important details shared by the prospect

IMPORTANT:
- Always identify yourself at the start
- Be truthful and don't make claims you can't back up
- If you don't understand something, ask for clarification
- Log any key information the prospect shares for follow-up`;

    return ensureVoiceAgentControlLayer(
      `${basePrompt}\n\n---\n\n${accountContextSection}\n\n---\n\n${callPlanContextSection}`
    );
  }

  async startConversation(): Promise<void> {
    try {
      this.systemPrompt = await this.buildSystemPrompt();
      this.emit("conversation:started", this.callId);
      this.emit("conversation:phase", "opening");
    } catch (error) {
      this.emit("error", error as Error);
      throw error;
    }
  }

  async generateResponse(humanText: string): Promise<string> {
    this.conversationHistory.push({ role: "user", content: humanText });
    this.emit("transcript:human", humanText);

    // Detect gatekeeper
    const isGatekeeper = this.detectGatekeeper(humanText);
    if (isGatekeeper && this.currentPhase === "opening") {
      this.currentPhase = "gatekeeper";
      this.gatekeeperAttempts++;
      this.emit("conversation:phase", "gatekeeper");
    }

    // Check for handoff triggers
    const shouldHandoff = this.checkHandoffTriggers(humanText);
    if (shouldHandoff) {
      this.currentPhase = "handoff";
      this.emit("conversation:phase", "handoff");
      this.emit("handoff:triggered", shouldHandoff);
      return `That's a great point about ${shouldHandoff}. Let me connect you with one of our specialists who can better assist you with that.`;
    }

    try {
      // Generate response with function calling support
      const result = await generateWithFunctions(
        this.systemPrompt,
        humanText,
        AGENT_FUNCTIONS,
        {
          temperature: 0.7,
          maxTokens: 300,
        }
      );

      // Handle function calls
      for (const fc of result.functionCalls) {
        this.emit("function:called", fc.name, fc.args);
        await this.handleFunctionCall(fc.name, fc.args);
      }

      const aiResponse = result.text || "";
      this.conversationHistory.push({ role: "model", content: aiResponse });
      this.emit("transcript:ai", aiResponse);

      // Update phase based on conversation
      this.updatePhaseFromResponse(humanText, aiResponse);

      return aiResponse;
    } catch (error) {
      this.emit("error", error as Error);
      throw error;
    }
  }

  async *generateStreamingResponse(humanText: string): AsyncGenerator<string> {
    this.conversationHistory.push({ role: "user", content: humanText });
    this.emit("transcript:human", humanText);

    try {
      let fullResponse = "";

      for await (const chunk of streamChat(this.systemPrompt, this.conversationHistory, {
        temperature: 0.7,
        maxTokens: 300,
      })) {
        fullResponse += chunk;
        yield chunk;
      }

      this.conversationHistory.push({ role: "model", content: fullResponse });
      this.emit("transcript:ai", fullResponse);
    } catch (error) {
      this.emit("error", error as Error);
      throw error;
    }
  }

  private async handleFunctionCall(name: string, args: Record<string, any>): Promise<void> {
    switch (name) {
      case "submit_disposition":
        console.log(`[VertexVoiceAgent] Disposition submitted: ${args.disposition}`);
        break;

      case "schedule_callback":
        console.log(`[VertexVoiceAgent] Callback scheduled: ${args.dateTime}`);
        break;

      case "transfer_to_human":
        console.log(`[VertexVoiceAgent] Transfer requested: ${args.reason}`);
        this.currentPhase = "handoff";
        this.emit("conversation:phase", "handoff");
        this.emit("handoff:triggered", args.reason);
        break;

      case "log_key_info":
        console.log(`[VertexVoiceAgent] Info logged: ${args.infoType} - ${args.details}`);
        this.loggedInfo.push({ infoType: args.infoType, details: args.details });
        break;
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

  async endConversation(disposition?: string): Promise<{ summary: string; transcript: string; disposition: string }> {
    const transcript = this.conversationHistory
      .map((m) => `${m.role === "model" ? "Agent" : "Prospect"}: ${m.content}`)
      .join("\n");

    // Auto-determine disposition if not provided
    let finalDisposition = disposition;
    if (!finalDisposition) {
      const dispositionResult = await determineDisposition(transcript, {
        contactName: `${this.context.contactFirstName} ${this.context.contactLastName}`,
        companyName: this.context.companyName,
      });
      finalDisposition = dispositionResult.disposition;
    }

    // Generate summary
    const summary = await summarizeCall(transcript, {
      contactName: `${this.context.contactFirstName} ${this.context.contactLastName}`,
      companyName: this.context.companyName,
      disposition: finalDisposition,
    });

    this.emit("call:completed", finalDisposition, summary);

    return { summary, transcript, disposition: finalDisposition };
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

  getLoggedInfo(): { infoType: string; details: string }[] {
    return this.loggedInfo;
  }

  getConversationHistory(): ChatMessage[] {
    return this.conversationHistory;
  }
}

// ==================== FACTORY FUNCTION ====================

export function createVertexVoiceAgent(
  settings: VertexAgentSettings,
  context: VertexCallContext
): VertexVoiceAgent {
  return new VertexVoiceAgent(settings, context);
}

export default {
  VertexVoiceAgent,
  createVertexVoiceAgent,
};
