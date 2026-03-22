/**
 * Simulation Engine - True Telephony-Free Conversation Simulation
 * 
 * This engine provides COMPLETE decoupling from the telephony layer.
 * 
 * KEY PRINCIPLES:
 * 1. NO phone numbers required
 * 2. NO SIP/carrier/dialer dependencies
 * 3. NO voicemail detection
 * 4. Creates SimulationSession objects (NOT call objects)
 * 5. Injects simulated human input via personas or scripts
 * 
 * call_mode: "SIMULATION" | "LIVE" is enforced at the service level
 */

import crypto from 'node:crypto';
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  previewStudioSessions,
  previewSimulationTranscripts,
  campaigns,
  accounts,
  contacts,
  virtualAgents,
  type PreviewStudioSession,
} from "@shared/schema";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { getVirtualAgentConfig, mergeAgentSettings } from "./virtual-agent-settings";
import { getOrBuildAccountIntelligence } from "./account-messaging-service";
import { getOrBuildParticipantCallPlan, buildParticipantCallContext } from "./account-call-service";
import { resolveContactVariables } from "./knowledge-assembly-service";
import { interpolateVoiceTemplate } from "./voice-variable-contract";
import { ensureVoiceAgentControlLayer } from "./voice-agent-control-defaults";

// ============================================================================
// TYPES - Simulation-Specific (NO telephony types)
// ============================================================================

export type CallMode = "SIMULATION" | "LIVE";

export interface SimulatedHumanProfile {
  role: string;                    // e.g., "VP Marketing", "IT Director"
  disposition: "friendly" | "neutral" | "skeptical" | "hostile";
  objections: string[];            // e.g., ["Already have a vendor", "No budget"]
  buyingSignals?: string[];        // e.g., ["Looking for alternatives"]
  timeToDecision?: string;         // e.g., "evaluating in Q2"
  communicationStyle: "brief" | "verbose" | "technical" | "executive";
  gatekeeperType?: "assistant" | "receptionist" | "voicemail" | null;
}

export interface SimulationSessionConfig {
  campaignId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
  virtualAgentId?: string | null;
  userId: string;
  workspaceId?: string;
  
  // Simulation-specific config
  humanProfile: SimulatedHumanProfile;
  maxTurns?: number;               // Default: 20
  simulationSpeed?: "realtime" | "fast" | "instant";
  
  // Optional overrides
  customSystemPrompt?: string;
  customFirstMessage?: string;
}

export interface SimulationSession {
  id: string;
  campaignId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
  virtualAgentId?: string | null;
  humanProfile: SimulatedHumanProfile;
  status: "active" | "completed" | "error";
  currentTurn: number;
  maxTurns: number;
  transcript: SimulationTurn[];
  startedAt: Date;
  endedAt?: Date;
  evaluation?: SimulationEvaluation;
  // Custom prompt overrides from Preview Studio
  customSystemPrompt?: string;
  customFirstMessage?: string;
}

export interface SimulationTurn {
  role: "agent" | "human";
  content: string;
  timestamp: Date;
  metadata?: {
    stage?: string;
    intent?: string;
    objectionHandled?: boolean;
    escalationRequested?: boolean;
  };
}

export interface SimulationEvaluation {
  overallScore: number;            // 0-100
  metrics: {
    identityConfirmation: boolean;
    qualificationQuestions: number;
    objectionsHandled: number;
    valuePropositionDelivered: boolean;
    callToActionDelivered: boolean;
    toneProfessional: boolean;
    complianceViolations: string[];
  };
  recommendations: string[];
  conversationStages: string[];
}

export interface ScriptedHumanTurn {
  condition?: string;              // When to use this line (optional)
  response: string;
  metadata?: {
    isObjection?: boolean;
    isQuestion?: boolean;
    isAcceptance?: boolean;
    isRejection?: boolean;
  };
}

// ============================================================================
// DEFAULT PERSONA PROFILES
// ============================================================================

export const DEFAULT_PERSONAS: Record = {
  "friendly_dm": {
    role: "VP of Marketing",
    disposition: "friendly",
    objections: [],
    buyingSignals: ["open to learning", "actively looking"],
    communicationStyle: "executive",
    gatekeeperType: null,
  },
  "skeptical_dm": {
    role: "Director of Technology",
    disposition: "skeptical",
    objections: ["We already have a solution", "Timing isn't right"],
    communicationStyle: "technical",
    gatekeeperType: null,
  },
  "hostile_dm": {
    role: "CFO",
    disposition: "hostile",
    objections: ["No budget", "Don't call again", "We're not interested"],
    communicationStyle: "brief",
    gatekeeperType: null,
  },
  "busy_executive": {
    role: "CEO",
    disposition: "neutral",
    objections: ["I only have 30 seconds", "Send me an email"],
    communicationStyle: "brief",
    gatekeeperType: null,
  },
  "gatekeeper_assistant": {
    role: "Executive Assistant",
    disposition: "neutral",
    objections: ["They're in a meeting", "What is this regarding?"],
    communicationStyle: "brief",
    gatekeeperType: "assistant",
  },
  "gatekeeper_receptionist": {
    role: "Receptionist",
    disposition: "neutral",
    objections: ["I'll transfer you", "They're not available"],
    communicationStyle: "brief",
    gatekeeperType: "receptionist",
  },
  "voicemail_scenario": {
    role: "Voicemail",
    disposition: "neutral",
    objections: [],
    communicationStyle: "brief",
    gatekeeperType: "voicemail",
  },
};

// ============================================================================
// HELPERS
// ============================================================================

const GEMINI_MODELS = ["gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash"] as const;
const DEFAULT_MODEL = GEMINI_MODELS[0]; // gemini-2.0-flash-lite — highest free-tier quota

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry a Gemini call with exponential backoff on 429/503. */
async function retryGemini(fn: () => Promise, maxRetries = 3): Promise {
  let lastErr: unknown;
  for (let attempt = 0; attempt  {
    console.log("[SimulationEngine] Creating simulation session (NO TELEPHONY)");
    console.log("[SimulationEngine] Campaign:", config.campaignId);
    console.log("[SimulationEngine] Human Profile:", config.humanProfile.role, "-", config.humanProfile.disposition);
    
    // Create database session (skip if no campaignId — NOT NULL constraint)
    let sessionId: string;
    if (config.campaignId) {
      const [dbSession] = await db.insert(previewStudioSessions).values({
        workspaceId: config.workspaceId,
        campaignId: config.campaignId,
        accountId: config.accountId,
        contactId: config.contactId,
        userId: config.userId,
        virtualAgentId: config.virtualAgentId,
        sessionType: 'simulation',
        status: 'active',
        metadata: {
          mode: 'SIMULATION' as CallMode,
          humanProfile: config.humanProfile,
          maxTurns: config.maxTurns || 20,
          simulationSpeed: config.simulationSpeed || 'fast',
          customSystemPrompt: config.customSystemPrompt,
          customFirstMessage: config.customFirstMessage,
        },
      }).returning();
      sessionId = dbSession.id;
    } else {
      // In-memory session for training dashboard simulations without a real campaign
      sessionId = crypto.randomUUID();
      console.log("[SimulationEngine] No campaignId — using in-memory session:", sessionId);
    }
    
    const session: SimulationSession = {
      id: sessionId,
      campaignId: config.campaignId,
      accountId: config.accountId,
      contactId: config.contactId,
      virtualAgentId: config.virtualAgentId,
      humanProfile: config.humanProfile,
      status: "active",
      currentTurn: 0,
      maxTurns: config.maxTurns || 20,
      transcript: [],
      startedAt: new Date(),
      // Store custom prompts from Preview Studio
      customSystemPrompt: config.customSystemPrompt,
      customFirstMessage: config.customFirstMessage,
    };
    
    return session;
  }
  
  /**
   * Build the agent's system prompt from context - NO phone/dialer references
   */
  async buildAgentContext(session: SimulationSession): Promise {
    let systemPrompt = "";
    let firstMessage = "Hi, may I speak with {{contact.full_name}}, the {{contact.job_title}} at {{account.name}}?";
    let agentName = "AI Agent";
    
    // Variable context for template substitution
    const variableContext: {
      agentName?: string;
      orgName?: string;
      accountName?: string;
      contactFullName?: string;
      contactFirstName?: string;
      contactJobTitle?: string;
      contactEmail?: string;
    } = {};
    
    // PRIORITY 1: Use custom prompts from Preview Studio if provided
    if (session.customSystemPrompt) {
      console.log("[SimulationEngine] Using custom system prompt from Preview Studio (", session.customSystemPrompt.length, "chars)");
      systemPrompt = session.customSystemPrompt;
    }
    if (session.customFirstMessage) {
      console.log("[SimulationEngine] Using custom first message from Preview Studio");
      firstMessage = session.customFirstMessage;
    }
    
    // PRIORITY 2: If no custom prompt, get from virtual agent config
    if (!systemPrompt && session.virtualAgentId) {
      const agentConfig = await getVirtualAgentConfig(session.virtualAgentId);
      if (agentConfig) {
        systemPrompt = agentConfig.systemPrompt || "";
        if (!session.customFirstMessage) {
          firstMessage = agentConfig.firstMessage || firstMessage;
        }
        agentName = "Virtual Agent";
      }
    }
    
    // Get campaign context
    if (session.campaignId) {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, session.campaignId))
        .limit(1);
      
      if (campaign) {
        agentName = campaign.name || agentName;
      }
    }
    variableContext.agentName = agentName;
    
    // Get account data for variable substitution
    if (session.accountId) {
      try {
        const [account] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.id, session.accountId))
          .limit(1);
        
        if (account) {
          variableContext.accountName = account.name || undefined;
        }
        
        const accountIntel = await getOrBuildAccountIntelligence(session.accountId);
        if (accountIntel?.payloadJson) {
          systemPrompt += `\n\n## ACCOUNT CONTEXT\n${JSON.stringify(accountIntel.payloadJson, null, 2)}`;
        }
      } catch (e) {
        console.warn("[SimulationEngine] Could not load account intelligence:", e);
      }
    }
    
    // Get contact context for variable substitution
    if (session.contactId) {
      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, session.contactId))
        .limit(1);
      
      if (contact) {
        const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
        variableContext.contactFullName = fullName || undefined;
        variableContext.contactFirstName = contact.firstName || undefined;
        variableContext.contactJobTitle = contact.jobTitle || undefined;
        variableContext.contactEmail = contact.email || undefined;
        
        systemPrompt += `\n\n## CONTACT CONTEXT\nName: ${fullName}\nTitle: ${contact.jobTitle || 'Unknown'}\nEmail: ${contact.email || 'Unknown'}`;
      }
    }
    
    // Resolve template variables in system prompt and first message
    console.log("[SimulationEngine] Resolving template variables with context:", variableContext);
    
    // Build voice template values dict for interpolateVoiceTemplate (handles aliases)
    const voiceTemplateValues: Record = {
      'agent.name': variableContext.agentName || '',
      'org.name': variableContext.orgName || '',
      'account.name': variableContext.accountName || '',
      'contact.full_name': variableContext.contactFullName || '',
      'contact.first_name': variableContext.contactFirstName || '',
      'contact.job_title': variableContext.contactJobTitle || '',
      'contact.email': variableContext.contactEmail || '',
    };
    
    // Use both interpolation methods (interpolateVoiceTemplate handles more aliases like ContactFullName, JobTitle, etc.)
    systemPrompt = interpolateVoiceTemplate(systemPrompt, voiceTemplateValues);
    systemPrompt = resolveContactVariables(systemPrompt, variableContext);
    
    // Apply voice agent control layer with call flow instructions (includes "who is calling" handling)
    systemPrompt = ensureVoiceAgentControlLayer(systemPrompt, true);
    console.log("[SimulationEngine] Applied voice agent control layer to system prompt");
    
    firstMessage = interpolateVoiceTemplate(firstMessage, voiceTemplateValues);
    firstMessage = resolveContactVariables(firstMessage, variableContext);
    
    console.log("[SimulationEngine] First message after substitution:", firstMessage);
    
    return { systemPrompt, firstMessage, agentName };
  }
  
  /**
   * Generate simulated human response based on persona
   */
  async generateHumanResponse(
    session: SimulationSession,
    agentMessage: string
  ): Promise {
    const profile = session.humanProfile;
    const turnNumber = session.currentTurn;
    
    // Build persona prompt for the simulated human
    const personaPrompt = `You are simulating a phone call recipient with the following characteristics:
    
ROLE: ${profile.role}
DISPOSITION: ${profile.disposition}
COMMUNICATION STYLE: ${profile.communicationStyle}
${profile.gatekeeperType ? `GATEKEEPER TYPE: ${profile.gatekeeperType}` : ''}
${profile.objections.length > 0 ? `OBJECTIONS TO RAISE: ${profile.objections.join(", ")}` : ''}
${profile.buyingSignals?.length ? `BUYING SIGNALS (if conversation goes well): ${profile.buyingSignals.join(", ")}` : ''}

CURRENT TURN: ${turnNumber + 1}

CONVERSATION SO FAR:
${session.transcript.map(t => `${t.role.toUpperCase()}: ${t.content}`).join("\n")}

AGENT JUST SAID: "${agentMessage}"

Generate a realistic response as this persona. Keep it natural and conversational.
${profile.disposition === 'hostile' ? 'Be dismissive and try to end the call.' : ''}
${profile.disposition === 'friendly' ? 'Be open and interested in learning more.' : ''}
${profile.disposition === 'skeptical' ? 'Ask challenging questions and express doubt.' : ''}
${profile.gatekeeperType === 'voicemail' ? 'This is a voicemail greeting. Play the beep and let the agent leave a message.' : ''}

Respond ONLY with the human's spoken words. No stage directions or descriptions.`;

    try {
      if (this.provider === "gemini" && this.gemini) {
        const gemini = this.gemini;
        const responseText = await retryGemini(async () => {
          const model = gemini.getGenerativeModel({ model: DEFAULT_MODEL });
          const result = await model.generateContent(personaPrompt);
          return result.response.text();
        });
        return responseText;
      } else if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: "deepseek-chat",
          messages: [{ role: "user", content: personaPrompt }],
          max_tokens: 150,
        });
        return completion.choices[0]?.message?.content || "I'm sorry, I can't talk right now.";
      }
    } catch (e) {
      console.error("[SimulationEngine] Error generating human response:", e);
    }
    
    // Fallback responses based on disposition
    const fallbacks: Record = {
      friendly: ["That sounds interesting, tell me more.", "I'd like to hear more about that.", "How does that work?"],
      neutral: ["Okay, go ahead.", "I'm listening.", "What exactly are you offering?"],
      skeptical: ["I'm not sure that's relevant to us.", "We've heard this before.", "What makes you different?"],
      hostile: ["I'm not interested.", "Please take us off your list.", "I don't have time for this."],
    };
    
    const options = fallbacks[profile.disposition] || fallbacks.neutral;
    return options[Math.floor(Math.random() * options.length)];
  }
  
  /**
   * Generate agent response using the assembled prompt
   */
  async generateAgentResponse(
    session: SimulationSession,
    context: { systemPrompt: string; firstMessage: string },
    humanMessage?: string
  ): Promise {
    // First turn - use first message
    if (session.currentTurn === 0 && !humanMessage) {
      return context.firstMessage;
    }
    
    const messages = session.transcript.map(t => ({
      role: t.role === "agent" ? "assistant" as const : "user" as const,
      content: t.content,
    }));
    
    if (humanMessage) {
      messages.push({ role: "user", content: humanMessage });
    }
    
    try {
      if (this.provider === "gemini" && this.gemini) {
        console.log("[SimulationEngine] Using", DEFAULT_MODEL, "for agent response, session:", session.id);
        const gemini = this.gemini;
        
        // Gemini requires first message to be from 'user', not 'model'
        // Filter history to ensure proper format - skip leading agent messages for history
        let historyMessages = messages.slice(0, -1);
        
        // Find first user message and start history from there
        const firstUserIndex = historyMessages.findIndex(m => m.role === "user");
        if (firstUserIndex > 0) {
          historyMessages = historyMessages.slice(firstUserIndex);
        } else if (firstUserIndex === -1) {
          // No user messages in history yet, start fresh
          historyMessages = [];
        }
        
        console.log("[SimulationEngine] Chat history length:", historyMessages.length, "Human message:", humanMessage?.substring(0, 50));
        const msgToSend = humanMessage || "Hello";
        const historyForChat = historyMessages.map(m => ({
          role: m.role === "assistant" ? "model" as const : "user" as const,
          parts: [{ text: m.content }],
        }));
        
        const responseText = await retryGemini(async () => {
          const model = gemini.getGenerativeModel({ 
            model: DEFAULT_MODEL,
            systemInstruction: context.systemPrompt,
          });
          const chat = model.startChat({ history: historyForChat });
          const result = await chat.sendMessage(msgToSend);
          return result.response.text();
        });
        console.log("[SimulationEngine] Gemini response:", responseText.substring(0, 100));
        return responseText;
      } else if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: context.systemPrompt },
            ...messages,
          ],
          max_tokens: 300,
        });
        return completion.choices[0]?.message?.content || "I apologize, could you repeat that?";
      }
    } catch (e) {
      console.error("[SimulationEngine] Error generating agent response:", e);
      console.error("[SimulationEngine] Provider:", this.provider, "Gemini available:", !!this.gemini, "OpenAI available:", !!this.openai);
      console.error("[SimulationEngine] Session ID:", session.id, "Current turn:", session.currentTurn);
    }
    
    return "I apologize, I'm having trouble processing. Could you please repeat that?";
  }
  
  /**
   * Run a single turn of the simulation
   */
  async runTurn(session: SimulationSession, humanInput?: string): Promise {
    const context = await this.buildAgentContext(session);
    
    // If human input provided, add it first
    if (humanInput) {
      const humanTurn: SimulationTurn = {
        role: "human",
        content: humanInput,
        timestamp: new Date(),
      };
      session.transcript.push(humanTurn);
      session.currentTurn++;
      
      // Store in database (non-fatal for in-memory sessions)
      try {
        await db.insert(previewSimulationTranscripts).values({
          sessionId: session.id,
          role: "user",
          content: humanInput,
          timestampMs: Date.now() - session.startedAt.getTime(),
        });
      } catch { /* skip if session not in DB */ }
    }
    
    // Generate agent response
    const agentResponse = await this.generateAgentResponse(session, context, humanInput);
    const agentTurn: SimulationTurn = {
      role: "agent",
      content: agentResponse,
      timestamp: new Date(),
    };
    session.transcript.push(agentTurn);
    session.currentTurn++;
    
    // Store in database (non-fatal for in-memory sessions)
    try {
      await db.insert(previewSimulationTranscripts).values({
        sessionId: session.id,
        role: "assistant",
        content: agentResponse,
        timestampMs: Date.now() - session.startedAt.getTime(),
      });
    } catch { /* skip if session not in DB */ }
    
    return agentTurn;
  }
  
  /**
   * Run full automated simulation (agent vs persona)
   */
  async runFullSimulation(session: SimulationSession): Promise {
    const context = await this.buildAgentContext(session);
    
    console.log("[SimulationEngine] Starting full simulation");
    console.log("[SimulationEngine] Max turns:", session.maxTurns);
    
    // Agent opens
    const openingMessage = context.firstMessage;
    const agentOpening: SimulationTurn = {
      role: "agent",
      content: openingMessage,
      timestamp: new Date(),
      metadata: { stage: "opening" },
    };
    session.transcript.push(agentOpening);
    session.currentTurn++;
    
    try {
      await db.insert(previewSimulationTranscripts).values({
        sessionId: session.id,
        role: "assistant",
        content: openingMessage,
        timestampMs: 0,
      });
    } catch { /* skip if session not in DB */ }
    
    // Run conversation loop
    while (session.currentTurn  1) await sleep(1200);
      
      // Generate human response
      const humanResponse = await this.generateHumanResponse(
        session,
        session.transcript[session.transcript.length - 1].content
      );
      
      const humanTurn: SimulationTurn = {
        role: "human",
        content: humanResponse,
        timestamp: new Date(),
      };
      session.transcript.push(humanTurn);
      session.currentTurn++;
      
      try {
        await db.insert(previewSimulationTranscripts).values({
          sessionId: session.id,
          role: "user",
          content: humanResponse,
          timestampMs: Date.now() - session.startedAt.getTime(),
        });
      } catch { /* skip if session not in DB */ }
      
      // Check for conversation ending signals
      if (this.shouldEndConversation(humanResponse, session.humanProfile)) {
        console.log("[SimulationEngine] Conversation ending signal detected");
        break;
      }
      
      // Generate agent response
      const agentResponse = await this.generateAgentResponse(session, context, humanResponse);
      const agentTurn: SimulationTurn = {
        role: "agent",
        content: agentResponse,
        timestamp: new Date(),
      };
      session.transcript.push(agentTurn);
      session.currentTurn++;
      
      try {
        await db.insert(previewSimulationTranscripts).values({
          sessionId: session.id,
          role: "assistant",
          content: agentResponse,
          timestampMs: Date.now() - session.startedAt.getTime(),
        });
      } catch { /* skip if session not in DB */ }
    }
    
    // Complete session
    session.status = "completed";
    session.endedAt = new Date();
    
    try {
      await db.update(previewStudioSessions)
        .set({ status: "completed", endedAt: session.endedAt })
        .where(eq(previewStudioSessions.id, session.id));
    } catch { /* skip if session not in DB */ }
    
    // Generate evaluation
    session.evaluation = await this.evaluateSimulation(session);
    
    console.log("[SimulationEngine] Simulation completed. Turns:", session.transcript.length);
    console.log("[SimulationEngine] Overall score:", session.evaluation.overallScore);
    
    return session;
  }
  
  /**
   * Check if conversation should end based on human response
   */
  private shouldEndConversation(response: string, profile: SimulatedHumanProfile): boolean {
    const lowerResponse = response.toLowerCase();
    
    // Explicit endings
    const endingPhrases = [
      "goodbye", "bye", "hang up", "not interested",
      "remove us", "take us off", "don't call again",
      "have a nice day", "thank you goodbye",
    ];
    
    if (endingPhrases.some(phrase => lowerResponse.includes(phrase))) {
      return true;
    }
    
    // Voicemail scenario - end after beep/message
    if (profile.gatekeeperType === "voicemail" && lowerResponse.includes("beep")) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Evaluate the simulation performance
   */
  async evaluateSimulation(session: SimulationSession): Promise {
    const agentTurns = session.transcript.filter(t => t.role === "agent");
    const humanTurns = session.transcript.filter(t => t.role === "human");
    
    // Basic metrics
    const metrics = {
      identityConfirmation: agentTurns.some(t => 
        t.content.toLowerCase().includes("may i speak with") ||
        t.content.toLowerCase().includes("is this")
      ),
      qualificationQuestions: agentTurns.filter(t =>
        t.content.includes("?") && (
          t.content.toLowerCase().includes("currently") ||
          t.content.toLowerCase().includes("challenge") ||
          t.content.toLowerCase().includes("looking")
        )
      ).length,
      objectionsHandled: humanTurns.filter((h, i) => {
        const isObjection = session.humanProfile.objections.some(obj => 
          h.content.toLowerCase().includes(obj.toLowerCase().split(" ")[0])
        );
        // Check if agent responded after
        return isObjection && agentTurns[i + 1];
      }).length,
      valuePropositionDelivered: agentTurns.some(t =>
        t.content.toLowerCase().includes("help") ||
        t.content.toLowerCase().includes("solution") ||
        t.content.toLowerCase().includes("benefit")
      ),
      callToActionDelivered: agentTurns.some(t =>
        t.content.toLowerCase().includes("schedule") ||
        t.content.toLowerCase().includes("meeting") ||
        t.content.toLowerCase().includes("next step") ||
        t.content.toLowerCase().includes("follow up")
      ),
      toneProfessional: !agentTurns.some(t =>
        t.content.toLowerCase().includes("um") ||
        t.content.toLowerCase().includes("like,") ||
        t.content.toLowerCase().includes("you know")
      ),
      complianceViolations: [] as string[],
    };
    
    // Calculate overall score
    let score = 50; // Base score
    if (metrics.identityConfirmation) score += 10;
    if (metrics.qualificationQuestions >= 2) score += 15;
    if (metrics.objectionsHandled > 0) score += 10;
    if (metrics.valuePropositionDelivered) score += 10;
    if (metrics.callToActionDelivered) score += 10;
    if (metrics.toneProfessional) score += 5;
    if (metrics.complianceViolations.length > 0) score -= 20;
    
    // Detect conversation stages
    const stages: string[] = ["opening"];
    if (metrics.identityConfirmation) stages.push("identity_confirmation");
    if (metrics.qualificationQuestions > 0) stages.push("qualification");
    if (metrics.objectionsHandled > 0) stages.push("objection_handling");
    if (metrics.valuePropositionDelivered) stages.push("value_proposition");
    if (metrics.callToActionDelivered) stages.push("call_to_action");
    stages.push("closing");
    
    // Generate recommendations
    const recommendations: string[] = [];
    if (!metrics.identityConfirmation) {
      recommendations.push("Agent should confirm speaking with the right person early in the call");
    }
    if (metrics.qualificationQuestions  {
    const [dbSession] = await db
      .select()
      .from(previewStudioSessions)
      .where(eq(previewStudioSessions.id, sessionId))
      .limit(1);
    
    if (!dbSession) return null;
    
    const transcripts = await db
      .select()
      .from(previewSimulationTranscripts)
      .where(eq(previewSimulationTranscripts.sessionId, sessionId))
      .orderBy(previewSimulationTranscripts.timestampMs);
    
    const metadata = (dbSession.metadata || {}) as Record;
    
    return {
      id: dbSession.id,
      campaignId: dbSession.campaignId!,
      accountId: dbSession.accountId!,
      contactId: dbSession.contactId,
      virtualAgentId: dbSession.virtualAgentId,
      humanProfile: (metadata.humanProfile as SimulatedHumanProfile) || DEFAULT_PERSONAS.neutral_dm,
      status: dbSession.status as "active" | "completed" | "error",
      currentTurn: transcripts.length,
      maxTurns: (metadata.maxTurns as number) || 20,
      transcript: transcripts.map(t => ({
        role: t.role === "assistant" ? "agent" as const : "human" as const,
        content: t.content,
        timestamp: t.createdAt,
      })),
      startedAt: dbSession.createdAt,
      endedAt: dbSession.endedAt ?? undefined,
      // Restore custom prompts from metadata
      customSystemPrompt: metadata.customSystemPrompt as string | undefined,
      customFirstMessage: metadata.customFirstMessage as string | undefined,
    };
  }
}

// Export singleton instance
export const simulationEngine = new SimulationEngine();