/**
 * Vertex AI Agent Brain Service
 *
 * Replaces OpenAI-based agent brain with Vertex AI Gemini models.
 * Provides:
 * - Master prompt generation using Gemini
 * - Organization intelligence integration
 * - Multi-agent orchestration for demand generation
 * - Learning and memory management
 * 
 * NOTE: Foundational knowledge is now sourced from the Unified Knowledge Hub.
 */

import {
  chat,
  generateJSON,
  generateText,
  reason,
  generateWithFunctions,
  type ChatMessage,
  type GenerationOptions,
  type FunctionDeclaration,
} from "./vertex-client";
import { db } from "../../db";
import { accountIntelligence } from "@shared/schema";
import { desc } from "drizzle-orm";
import {
  buildDemandAgentKnowledgePrompt,
} from "../demand-agent-knowledge";
import {
  ensureVoiceAgentControlLayer,
} from "../voice-agent-control-defaults";
import { AGENT_TYPE_KNOWLEDGE, type OrganizationBrain, getOrganizationBrain } from "../agent-brain-service";
import { buildUnifiedKnowledgePrompt } from "../unified-knowledge-hub";

// ==================== TYPES ====================

export interface VertexAgentCreationInput {
  taskDescription: string;
  firstMessage: string;
  agentType?: "voice" | "text" | "research" | "qa" | "demand_intel" | "demand_qual" | "demand_engage";
  additionalContext?: string;
  useReasoningModel?: boolean;  // Use Gemini Thinking for complex reasoning
  specializationConfig?: {
    researchDepth?: 'shallow' | 'standard' | 'deep';
    targetSignals?: string[];
    bantWeights?: { budget: number; authority: number; need: number; timeframe: number };
    escalationThreshold?: number;
    personalizationLevel?: 1 | 2 | 3;
    sequenceType?: 'cold' | 'warm' | 'reengagement';
  };
}

export interface VertexGeneratedAgentPrompt {
  masterPrompt: string;
  optimizedFirstMessage: string;
  reasoning: string;
  knowledgeSources: string[];
  thinkingProcess?: string;  // Chain-of-thought from reasoning model
}

// ==================== PROMPT GENERATION ====================

/**
 * Build context for Vertex AI to generate master prompt
 */
function buildVertexPromptContext(
  input: VertexAgentCreationInput,
  orgBrain: OrganizationBrain | null
): string {
  const agentType = input.agentType || "voice";
  const typeKnowledge = AGENT_TYPE_KNOWLEDGE[agentType];
  const isDemandAgent = ['demand_intel', 'demand_qual', 'demand_engage'].includes(agentType);

  let context = `
# AGENT PROMPT GENERATION CONTEXT

## User's Agent Task
${input.taskDescription}

## User's Desired First Message
${input.firstMessage}

${input.additionalContext ? `## Additional Context\n${input.additionalContext}\n` : ""}

## Agent Type: ${typeKnowledge.name}
${typeKnowledge.additionalRules}
`;

  // Inject specialized demand agent knowledge
  if (isDemandAgent) {
    const demandType = agentType as 'demand_intel' | 'demand_qual' | 'demand_engage';
    context += `
## Specialized ${typeKnowledge.name} Knowledge

${buildDemandAgentKnowledgePrompt(demandType)}
`;

    if (input.specializationConfig) {
      context += `
## Specialization Configuration
${JSON.stringify(input.specializationConfig, null, 2)}
`;
    }
  }

  // All foundational knowledge now comes from Unified Knowledge Hub at runtime
  context += `
## Unified Agent Knowledge (Source of Truth)
All foundational agent knowledge is provided by the Unified Knowledge Hub at runtime.
This includes: compliance rules, gatekeeper handling, voicemail detection, dispositioning,
call quality standards, conversation flow, objection handling, tone and pacing guidelines.
`;

  if (orgBrain) {
    context += `
## Organization Intelligence (Agent's Brain)

### Company Identity
- Company: ${orgBrain.identity.companyName}
- Description: ${orgBrain.identity.description}
- Industry: ${orgBrain.identity.industry}
- Value Proposition: ${orgBrain.identity.valueProposition}

### Products & Services
- Core Products: ${orgBrain.offerings.products}
- Use Cases: ${orgBrain.offerings.useCases}
- Problems Solved: ${orgBrain.offerings.problemsSolved}
- Differentiators: ${orgBrain.offerings.differentiators}

### Ideal Customer Profile
- Target Industries: ${orgBrain.icp.targetIndustries}
- Target Personas: ${orgBrain.icp.targetPersonas}
- Common Objections: ${orgBrain.icp.commonObjections}

### Positioning
- One-Liner: ${orgBrain.positioning.oneLiner}
- Competitors: ${orgBrain.positioning.competitors}
- Why Us: ${orgBrain.positioning.whyUs}

### Outreach Intelligence
- Email Angles: ${orgBrain.outreach.emailAngles}
- Call Openers: ${orgBrain.outreach.callOpeners}

${orgBrain.compliance ? `### Compliance Policy\n${orgBrain.compliance}\n` : ""}
${orgBrain.voiceDefaults ? `### Voice & Tone Defaults\n${orgBrain.voiceDefaults}\n` : ""}
`;
  }

  return context;
}

/**
 * Generate master agent prompt using Vertex AI Gemini
 */
export async function generateVertexMasterPrompt(
  input: VertexAgentCreationInput
): Promise<VertexGeneratedAgentPrompt> {
  const agentType = input.agentType || "voice";
  const orgBrain = await getOrganizationBrain();
  const context = buildVertexPromptContext(input, orgBrain);

  const systemPrompt = `You are an expert AI agent prompt engineer specializing in B2B sales and demand generation agents.

Your task is to generate a comprehensive, production-ready system prompt for an AI agent.

The user provides:
1. A simple task description (what the agent should do)
2. A first message (opening greeting)

You must combine this with:
1. The default agent knowledge (B2B calling rules, dispositions, compliance)
2. Organization Intelligence (company info, products, ICP, positioning)
3. Agent type-specific guidelines

Generate a MASTER PROMPT that:
- Is comprehensive but focused on the specific task
- Incorporates company identity and value proposition naturally
- Includes relevant objection handling based on ICP
- Has clear disposition guidelines
- Follows compliance rules
- Uses the appropriate tone and style
- Enables learning from conversation outcomes

Also optimize the first message to be natural and effective for B2B outreach.

Return your response as valid JSON with this structure:
{
  "masterPrompt": "The complete system prompt for the agent...",
  "optimizedFirstMessage": "The refined opening message...",
  "reasoning": "Brief explanation of key decisions made...",
  "knowledgeSources": ["List of knowledge sources incorporated"]
}`;

  try {
    let result: VertexGeneratedAgentPrompt;

    if (input.useReasoningModel) {
      // Use Gemini Thinking for complex reasoning
      const reasoningResult = await reason(`${systemPrompt}\n\n---\n\n${context}`);

      try {
        const parsed = JSON.parse(reasoningResult.answer);
        result = {
          masterPrompt: parsed.masterPrompt || "",
          optimizedFirstMessage: parsed.optimizedFirstMessage || input.firstMessage,
          reasoning: parsed.reasoning || "Generated with Vertex AI Gemini Thinking",
          knowledgeSources: parsed.knowledgeSources || ["Vertex AI", "Organization Intelligence"],
          thinkingProcess: reasoningResult.thinking,
        };
      } catch {
        // Fallback if JSON parsing fails
        result = generateFallbackVertexPrompt(input, orgBrain);
        result.thinkingProcess = reasoningResult.thinking;
      }
    } else {
      // Use standard chat model
      const response = await generateJSON<{
        masterPrompt: string;
        optimizedFirstMessage: string;
        reasoning: string;
        knowledgeSources: string[];
      }>(`${systemPrompt}\n\n---\n\n${context}`, {
        temperature: 0.3,
        maxTokens: 8192,
      });

      result = {
        masterPrompt: response.masterPrompt || "",
        optimizedFirstMessage: response.optimizedFirstMessage || input.firstMessage,
        reasoning: response.reasoning || "Generated with Vertex AI Gemini",
        knowledgeSources: response.knowledgeSources || ["Vertex AI", "Organization Intelligence"],
      };
    }

    // Ensure voice agent control layer for voice/qual agents
    if (agentType === "voice" || agentType === "demand_qual") {
      result.masterPrompt = ensureVoiceAgentControlLayer(result.masterPrompt);
    }

    return result;
  } catch (error) {
    console.error("[VertexAgentBrain] Prompt generation failed:", error);
    return generateFallbackVertexPrompt(input, orgBrain);
  }
}

/**
 * Fallback prompt generation without API call
 */
function generateFallbackVertexPrompt(
  input: VertexAgentCreationInput,
  orgBrain: OrganizationBrain | null
): VertexGeneratedAgentPrompt {
  const agentType = input.agentType || "voice";
  const typeKnowledge = AGENT_TYPE_KNOWLEDGE[agentType];
  const includeVoiceControl = agentType === "voice" || agentType === "demand_qual";

  let masterPrompt = `# AI ${typeKnowledge.name} Instructions

## Your Primary Task
${input.taskDescription}

`;

  if (orgBrain) {
    masterPrompt += `## Company You Represent
You are representing ${orgBrain.identity.companyName}.
${orgBrain.identity.description}

Value Proposition: ${orgBrain.positioning.oneLiner}

### What We Offer
${orgBrain.offerings.products}

### Problems We Solve
${orgBrain.offerings.problemsSolved}

### Why Customers Choose Us
${orgBrain.positioning.whyUs}

### Common Objections & How to Handle
${orgBrain.icp.commonObjections}

`;
  }

  // Note: All foundational knowledge is now provided by Unified Knowledge Hub at runtime
  masterPrompt += `
## Core Agent Knowledge
All foundational agent knowledge (compliance, gatekeeper handling, voicemail detection,
call dispositioning, conversation flow, objection handling) is provided by the Unified
Knowledge Hub at runtime. This ensures consistent, centrally-managed agent behavior.

${typeKnowledge.additionalRules}
`;

  if (orgBrain?.compliance) {
    masterPrompt += `\n## Organization Compliance Policy\n${orgBrain.compliance}\n`;
  }

  if (orgBrain?.voiceDefaults) {
    masterPrompt += `\n## Voice & Tone Guidelines\n${orgBrain.voiceDefaults}\n`;
  }

  if (includeVoiceControl) {
    masterPrompt = ensureVoiceAgentControlLayer(masterPrompt);
  }

  const knowledgeSources = ["Default B2B Knowledge", "Disposition Guidelines", "Compliance Rules"];
  if (includeVoiceControl) {
    knowledgeSources.push("Voice Agent Control Intelligence");
  }
  if (orgBrain) {
    knowledgeSources.push("Organization Intelligence");
  }

  return {
    masterPrompt,
    optimizedFirstMessage: input.firstMessage,
    reasoning: "Generated using template-based fallback (Vertex AI unavailable)",
    knowledgeSources,
  };
}

// ==================== CONVERSATION MANAGEMENT ====================

export interface ConversationContext {
  systemPrompt: string;
  messages: ChatMessage[];
  functions?: FunctionDeclaration[];
}

/**
 * Generate agent response for a conversation turn
 */
export async function generateAgentResponse(
  context: ConversationContext,
  options: GenerationOptions = {}
): Promise<{ response: string; functionCalls?: { name: string; args: Record<string, any> }[] }> {
  if (context.functions && context.functions.length > 0) {
    const result = await generateWithFunctions(
      context.systemPrompt,
      context.messages[context.messages.length - 1].content,
      context.functions,
      options
    );
    return {
      response: result.text,
      functionCalls: result.functionCalls,
    };
  }

  const response = await chat(context.systemPrompt, context.messages, options);
  return { response };
}

// ==================== DISPOSITION DETERMINATION ====================

/**
 * Determine call disposition from transcript using Vertex AI
 */
export async function determineDisposition(
  transcript: string,
  context: { contactName: string; companyName: string }
): Promise<{
  disposition: "qualified_lead" | "not_interested" | "do_not_call" | "callback_requested" | "voicemail" | "no_answer" | "invalid_data";
  confidence: number;
  reasoning: string;
  nextAction?: string;
}> {
  const prompt = `Analyze this call transcript and determine the appropriate disposition.

Contact: ${context.contactName} at ${context.companyName}

Transcript:
${transcript}

STRICT QUALIFICATION CRITERIA - A "qualified_lead" MUST meet ALL of these:
1. The agent successfully delivered a coherent message (not just greetings/confusion)
2. The prospect confirmed their identity
3. The prospect engaged in a meaningful conversation (not just brief responses)
4. The prospect expressed genuine interest in the topic/offering
5. There was an agreed next step (meeting, callback, content request, etc.)

If ANY of these are missing, the disposition CANNOT be "qualified_lead".

Determine the disposition based on these criteria:
- qualified_lead: ALL 5 qualification criteria above are met
- callback_requested: Prospect asked to be called at a specific time
- not_interested: Prospect politely declined or showed no interest
- do_not_call: Prospect explicitly asked not to be called again (DNC request)
- voicemail: Reached answering machine or voicemail
- no_answer: Call connected but no meaningful conversation occurred
- invalid_data: Wrong number, disconnected, or wrong person reached

IMPORTANT: If the agent failed to deliver a coherent message or there was no real conversation, use "no_answer" NOT "qualified_lead".

Return JSON with:
{
  "disposition": "one of the above dispositions",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of which criteria were met/not met",
  "nextAction": "recommended next step if applicable"
}`;

  try {
    return await generateJSON<{
      disposition: "qualified_lead" | "not_interested" | "do_not_call" | "callback_requested" | "voicemail" | "no_answer" | "invalid_data";
      confidence: number;
      reasoning: string;
      nextAction?: string;
    }>(prompt, { temperature: 0.1 });
  } catch (error) {
    console.error("[VertexAgentBrain] Disposition determination failed:", error);
    return {
      disposition: "no_answer",
      confidence: 0.5,
      reasoning: "Failed to determine disposition automatically",
    };
  }
}

// ==================== CALL SUMMARIZATION ====================

/**
 * Generate call summary using Vertex AI
 */
export async function summarizeCall(
  transcript: string,
  context: { contactName: string; companyName: string; disposition: string }
): Promise<string> {
  const prompt = `Summarize this sales call in 2-3 sentences.

Contact: ${context.contactName} at ${context.companyName}
Disposition: ${context.disposition}

Transcript:
${transcript}

Include: who was reached, main outcome, and any follow-up actions needed.`;

  try {
    return await generateText(prompt, { temperature: 0.3, maxTokens: 200 });
  } catch (error) {
    console.error("[VertexAgentBrain] Call summarization failed:", error);
    return `Call with ${context.contactName} at ${context.companyName}. Disposition: ${context.disposition}`;
  }
}

// ==================== OBJECTION HANDLING ====================

/**
 * Generate objection response using Vertex AI
 */
export async function handleObjection(
  objection: string,
  context: {
    contactName: string;
    companyName: string;
    conversationHistory: ChatMessage[];
    orgBrain?: OrganizationBrain | null;
  }
): Promise<{
  objectionType: "timing" | "budget" | "authority" | "need" | "competition" | "trust" | "other";
  response: string;
  shouldEscalate: boolean;
}> {
  const orgContext = context.orgBrain ? `
Company: ${context.orgBrain.identity.companyName}
Value Proposition: ${context.orgBrain.positioning.oneLiner}
Common Objections: ${context.orgBrain.icp.commonObjections}
Why Us: ${context.orgBrain.positioning.whyUs}
` : "";

  const prompt = `Analyze this objection and generate an appropriate response.

Objection: "${objection}"
Contact: ${context.contactName} at ${context.companyName}

${orgContext}

Recent conversation:
${context.conversationHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n")}

Return JSON:
{
  "objectionType": "timing|budget|authority|need|competition|trust|other",
  "response": "empathetic, professional response (1-2 sentences)",
  "shouldEscalate": true/false if human handoff needed
}`;

  try {
    return await generateJSON<{
      objectionType: "timing" | "budget" | "authority" | "need" | "competition" | "trust" | "other";
      response: string;
      shouldEscalate: boolean;
    }>(prompt, { temperature: 0.5 });
  } catch (error) {
    console.error("[VertexAgentBrain] Objection handling failed:", error);
    return {
      objectionType: "other",
      response: "I understand your concern. Would it be helpful if I connected you with a specialist who can address this in more detail?",
      shouldEscalate: true,
    };
  }
}

// ==================== LEARNING & IMPROVEMENT ====================

/**
 * Analyze call outcomes to extract learning insights
 */
export async function analyzeCallOutcome(
  callData: {
    transcript: string;
    disposition: string;
    duration: number;
    contactContext: { title?: string; industry?: string };
  }
): Promise<{
  successFactors: string[];
  improvementAreas: string[];
  patternInsights: string[];
  recommendedAdjustments: string[];
}> {
  const prompt = `Analyze this call outcome for learning insights.

Transcript:
${callData.transcript}

Outcome: ${callData.disposition}
Duration: ${callData.duration} seconds
Contact: ${callData.contactContext.title || "Unknown"} in ${callData.contactContext.industry || "Unknown industry"}

Identify:
1. What contributed to the outcome (success factors)
2. Areas that could be improved
3. Patterns that might apply to similar calls
4. Specific adjustments to recommend

Return JSON:
{
  "successFactors": ["list of what worked well"],
  "improvementAreas": ["list of areas to improve"],
  "patternInsights": ["patterns observed"],
  "recommendedAdjustments": ["specific recommendations"]
}`;

  try {
    return await generateJSON<{
      successFactors: string[];
      improvementAreas: string[];
      patternInsights: string[];
      recommendedAdjustments: string[];
    }>(prompt, { temperature: 0.4 });
  } catch (error) {
    console.error("[VertexAgentBrain] Call analysis failed:", error);
    return {
      successFactors: [],
      improvementAreas: [],
      patternInsights: [],
      recommendedAdjustments: [],
    };
  }
}

export default {
  generateVertexMasterPrompt,
  generateAgentResponse,
  determineDisposition,
  summarizeCall,
  handleObjection,
  analyzeCallOutcome,
};
