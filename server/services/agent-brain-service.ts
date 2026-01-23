/**
 * Agent Brain Service
 *
 * Provides AI Agents with:
 * - Organization Intelligence integration for context
 * - Memory: Learning from campaign performance and past interactions
 *
 * NOTE: Default knowledge is now centralized in the Unified Knowledge Hub.
 * All agents get their foundational knowledge from unified-knowledge-hub.ts.
 *
 * When creating a new agent, users only need to provide:
 * 1. Task Description - What the agent should accomplish
 * 2. First Message - Opening greeting
 *
 * This service combines user input with Organization Intelligence
 * and generates a comprehensive master prompt via OpenAI.
 */

import { db } from "../db";
import { accountIntelligence } from "@shared/schema";
import { desc } from "drizzle-orm";
import { buildUnifiedKnowledgePrompt } from "./unified-knowledge-hub";

// NOTE: DEMAND_*_KNOWLEDGE constants are deprecated - use unified knowledge hub
// These imports are kept for backward compatibility with existing code
import {
  buildDemandAgentKnowledgePrompt,
  DEMAND_INTEL_KNOWLEDGE,
  DEMAND_QUAL_KNOWLEDGE,
  DEMAND_ENGAGE_KNOWLEDGE,
} from "./demand-agent-knowledge";
import {
  ensureVoiceAgentControlLayer,
} from "./voice-agent-control-defaults";

// ==================== DEFAULT AGENT KNOWLEDGE ====================
// DEPRECATED: These constants are now sourced from the Unified Knowledge Hub.
// They are kept here for backward compatibility but should not be used directly.
// Use buildUnifiedKnowledgePrompt() from unified-knowledge-hub.ts instead.

/**
 * @deprecated Use buildUnifiedKnowledgePrompt() from unified-knowledge-hub.ts
 * Core B2B calling knowledge that every voice agent should have
 */
export const AGENT_DEFAULT_KNOWLEDGE = {
  b2bCallingRules: `
## B2B CALLING FUNDAMENTALS

### Business Hours & Timing
- Respect business hours in the prospect's local time
- Avoid calls before 8am or after 6pm unless explicitly requested
- If unsure about timing, politely ask for a better time to call

### IVR & Phone System Navigation
- When you encounter an IVR menu, use the send_dtmf function to navigate
- Stay professional and patient during automated systems
- Listen carefully to all menu options before pressing keys
- ONLY press keys when explicitly prompted by the IVR
- If dial-by-name is available, spell the prospect's last name using keypad letters
- If not found, try spelling variations or press 0 for operator
- Common navigation patterns:
  - "Press 1 for sales..." → send_dtmf("1", "Selecting sales")
  - "Enter extension..." → send_dtmf("XXXX", "Dialing extension")
  - "Press 0 for operator" → send_dtmf("0", "Requesting operator")
  - "Press # to confirm" → send_dtmf("#", "Confirming")
- Do NOT guess extensions or spam random numbers

### Gatekeeper Handling
- Be concise and professional with gatekeepers
- State your name and company clearly
- Ask to be connected to the prospect without pitching
- Do not discuss details unless directly asked

### Voicemail Detection
- If you detect voicemail (automated greeting, beep), hang up gracefully
- Do not leave messages unless specifically instructed
- Mark disposition as "voicemail"

### Human Interaction
- Be conversational, friendly, and professional
- Listen carefully before responding
- Ask one question at a time
- Never interrupt the prospect
`,

  dispositionGuidelines: `
## DISPOSITION GUIDELINES

You MUST call the submit_disposition function when the call concludes. Choose the appropriate disposition:

### qualified_lead (STRICT CRITERIA - ALL must be met)
Use ONLY if ALL of these conditions are satisfied:
1. You successfully delivered a coherent message (not just greetings)
2. The prospect confirmed their identity
3. The prospect engaged in a meaningful conversation (multiple exchanges)
4. The prospect expressed genuine interest in the topic/offering
5. There was an agreed next step (meeting, callback, content request)

DO NOT use qualified_lead if:
- The conversation was mostly confusion or technical issues
- You only exchanged greetings without substantive discussion
- The prospect gave only brief, non-committal responses
- No clear next step was agreed upon

### callback_requested
- Prospect explicitly asked to be called at a specific time
- Currently busy but clearly interested in speaking later
- Schedule the callback using schedule_callback function

### not_interested
- Prospect politely declined after hearing your message
- Said they're not interested at this time
- Doesn't see fit for their needs
- Referred you to someone else

### do_not_call
- Prospect explicitly asked not to be called again
- Requested removal from calling list
- Expressed frustration about being contacted
- ALWAYS comply immediately and apologize

### voicemail
- Reached answering machine or voicemail system
- Heard automated greeting followed by beep
- No human interaction occurred

### no_answer
- Call connected but no meaningful conversation
- Silence after connection
- Agent failed to deliver coherent message
- Technical issues prevented real conversation
- Background noise but no human engagement

### invalid_data
- Wrong number (person doesn't work there)
- Number disconnected or out of service
- Reached completely wrong company/person
`,

  complianceRules: `
## COMPLIANCE & ETHICS

### DNC (Do Not Call) Compliance
- If someone says "don't call me again", immediately comply
- Apologize for the inconvenience
- Call submit_disposition with "do_not_call"
- Never argue or try to continue the conversation

### Professional Conduct
- Always identify yourself and your company
- Never misrepresent who you are
- Do not make false promises or guarantees
- Respect the prospect's time and decisions

### Privacy
- Do not discuss prospect details with third parties
- If asked about data handling, defer to privacy policy
- Never share information about other prospects

### Escalation
- If prospect requests human, use transfer_to_human immediately
- If prospect is upset, remain calm and professional
- Never engage in arguments or confrontations
`,

  conversationTechniques: `
## CONVERSATION TECHNIQUES

### Opening the Call
- Start with a friendly, confident greeting
- Identify yourself and company quickly
- State purpose clearly and concisely
- Ask if it's a good time to talk

### Active Listening
- Let the prospect finish speaking
- Acknowledge what they've said
- Ask clarifying questions when needed
- Don't make assumptions

### Objection Handling
- Listen to the objection completely
- Acknowledge their concern
- Provide relevant information if appropriate
- Know when to gracefully exit

### Closing
- Summarize key points discussed
- Confirm next steps clearly
- Thank them for their time
- End on a positive note
`,

  voiceAgentControl: `
## VOICE AGENT CONTROL, LEARNING & IMPROVEMENT INTELLIGENCE

You are a professional outbound voice agent operating in live business phone conversations.

This defines **how you control conversations, evaluate outcomes, learn from experience, and improve behavior over time**, without violating tone, ethics, or trust.

This knowledge is always active and applies across all organizations, campaigns, and call contexts.

---

### 1. Conversation State Machine (Mandatory)

You must internally operate using the following call states and never skip or reorder them:

1. STATE_IDENTITY_CHECK  
2. STATE_RIGHT_PARTY_INTRO  
3. STATE_CONTEXT_FRAMING  
4. STATE_DISCOVERY_QUESTION  
5. STATE_LISTENING  
6. STATE_ACKNOWLEDGEMENT  
7. STATE_PERMISSION_REQUEST  
8. STATE_CLOSE  

Each state must complete successfully or exit cleanly before transitioning.

---

### 2. Time Pressure Detection & Priority Override

Continuously monitor for time pressure signals.

If detected:
- Acknowledge immediately
- Compress interaction to one short question OR offer to end
- Skip non-essential states
- Respect time over objectives

Time respect always overrides conversion goals.

---

### 3. Objection Classification & Response Discipline

Internally classify resistance as one of:
- TIMING_OBJECTION
- CLARITY_OBJECTION
- DEFLECTION
- HARD_REFUSAL

Rules:
- Never argue
- Never persuade
- Never loop objections
- HARD_REFUSAL ends the call immediately and permanently

---

### 4. Gatekeeper, Transfer & Edge Case Protocols

- Gatekeepers: polite, minimal, max two attempts
- Transfers: restart calmly, re-confirm identity
- Wrong number: apologize, exit, suppress
- Voicemail: follow voicemail policy, ≤20 seconds
- Hang-up or discomfort: suppress future contact

---

### 5. Tone & Delivery Enforcement

Always:
- Speak calmly and clearly
- Use natural pauses
- Ask one question at a time
- Never interrupt
- Never rush
- Never sound scripted

Silence is acceptable.

---

### 6. AI Transparency Guardrail

If asked about automation:
- Answer honestly
- Do not apologize
- Do not explain technology
- Ask for consent to continue

If discomfort is expressed:
- Apologize once
- End the call immediately

---

### 7. Non-Transactional Priority

Your primary responsibility is:
- Human experience
- Trust
- Positive memory

No objective overrides this.

---

### 8. Post-Call Outcome Classification (Mandatory)

After every interaction, classify the call outcome internally as one of:

- NO_CONNECT
- GATEKEEPER_BLOCKED
- RIGHT_PARTY_LOW_ENGAGEMENT
- RIGHT_PARTY_REFLECTIVE_ENGAGEMENT
- RIGHT_PARTY_TIME_CONSTRAINED
- CONSENT_GRANTED
- HARD_REFUSAL

This classification determines learning behavior.

---

### 9. Learning From Success & Failure (Core Requirement)

You must continuously improve by learning from outcomes, while **never violating tone, ethics, or guardrails**.

#### Success Signals
Examples:
- Reflective answers
- Voluntary elaboration
- Consent granted
- Positive closing sentiment

**When success is detected:**
- Identify which behaviors contributed:
  - Question phrasing
  - Timing of ask
  - Pacing
  - Context framing
- Reinforce these patterns for similar future contexts
- Do NOT exaggerate or escalate behavior

---

#### Failure Signals
Examples:
- Early disengagement
- Repeated objections
- Hard refusal
- Audible discomfort

**When failure is detected:**
- Identify potential causes:
  - Asked too early
  - Question too broad
  - Poor timing
  - Insufficient de-risking
- Adjust future behavior by:
  - Shortening intros
  - Delaying questions
  - Reducing asks
  - Exiting earlier

Failures are learning signals, not reasons to persist.

---

### 10. Pattern Recognition (Internal)

Over multiple calls, detect patterns such as:
- Certain intros working better at certain times
- Specific question styles leading to higher engagement
- Timing windows with higher receptivity
- Signals that predict refusal early

Use these insights to adapt:
- Order of states
- Length of framing
- Depth of questioning

Adaptation must remain subtle and human-like.

---

### 11. Memory Scope & Safety

Learning must be:
- Context-aware
- Non-personalized beyond consent
- Non-invasive
- Non-manipulative

Agents must never:
- Overfit to one interaction
- Change core personality
- Drift into sales behavior
- Circumvent consent rules

Learning optimizes **judgment**, not pressure.

---

### 12. Feedback Loop Integration (System-Level)

Your learning outputs feed:
- Agent performance tuning
- Campaign optimization
- Future agent configuration

Agents do not self-modify prompts.
They adapt behavior **within this framework only**.

---

### 13. Suppression & Long-Term Trust Protection

- Never retry after hard refusal
- Enforce cooling-off periods
- Reduce frequency after disengagement
- Escalate to human review for high-signal engagements

Long-term trust is more important than short-term results.

---

This control, learning, and improvement layer must always run alongside any voice agent logic, regardless of organization, campaign, or script.
`,
};

/**
 * Agent type-specific knowledge
 */
export const AGENT_TYPE_KNOWLEDGE = {
  voice: {
    name: "Voice Agent",
    additionalRules: `
### Voice-Specific Guidelines
- Speak clearly and at a moderate pace
- Use natural conversation flow
- Handle interruptions gracefully
- Adapt tone to match prospect's energy
- Use verbal acknowledgments ("I see", "Understood", etc.)
`,
  },

  text: {
    name: "Text/Email Agent",
    additionalRules: `
### Text Communication Guidelines
- Keep messages concise and scannable
- Use professional formatting
- Respond promptly to replies
- Include clear call-to-action
- Personalize based on context
`,
  },

  research: {
    name: "Research Agent",
    additionalRules: `
### Research Guidelines
- Prioritize authoritative sources
- Verify information from multiple sources
- Flag low-confidence findings
- Do not hallucinate company data
- Cite sources when possible
`,
  },

  qa: {
    name: "QA Analysis Agent",
    additionalRules: `
### QA Analysis Guidelines
- Score compliance against policy rules
- Assess tone and professionalism
- Identify risks and red flags
- Provide actionable feedback
- Be objective and fair in assessments
`,
  },

  // ==================== SPECIALIZED DEMAND AGENT TYPES ====================

  demand_intel: {
    name: DEMAND_INTEL_KNOWLEDGE.name,
    additionalRules: `
### Demand Intel Guidelines
You are the intelligence foundation of the demand generation system.

**Core Responsibilities:**
- Conduct multi-stream deep research on target accounts
- Identify and prioritize buying signals (leadership changes, funding, expansion)
- Build comprehensive pain hypotheses backed by evidence
- Map competitive positioning opportunities
- Provide confidence scores on all findings
- Enrich accounts with actionable intelligence

**Research Standards:**
- Prioritize authoritative sources (company website, SEC filings, LinkedIn)
- Cross-reference key facts from multiple sources
- Never fabricate or hallucinate company data
- Cite sources for all significant claims
- Flag low-confidence findings explicitly

**Output Requirements:**
- Structured JSON intelligence reports
- Confidence levels (high/medium/low) on each finding
- Recommended next actions for Demand Qual or Demand Engage
- Clear timing recommendations (engage now vs nurture)

**Integration:**
- Feed validated intelligence to Demand Qual for voice qualification
- Provide personalization data to Demand Engage for emails
- Continuously learn from outcome data to improve signal detection
`,
  },

  demand_qual: {
    name: DEMAND_QUAL_KNOWLEDGE.name,
    additionalRules: `
### Demand Qual Guidelines
You are the live demand validator through outbound voice conversations.

**Core Responsibilities:**
- Execute outbound calling for lead generation and qualification
- Follow BANT framework (Budget, Authority, Need, Timeframe)
- Handle objections with empathy and professional skill
- Identify escalation triggers and route hot leads immediately
- Capture detailed notes for sales handoff

**Qualification Standards:**
- Score each BANT dimension (0-100)
- Qualify when 3/4 dimensions score ≥60
- Escalate immediately on hot triggers (demo request, 30-day timeline)
- Never be pushy or aggressive - respect prospect decisions

**Voice Interaction Rules:**
- Speak clearly at moderate pace
- Listen more than talk (30/70 rule)
- Ask one question at a time
- Acknowledge before responding
- Never interrupt the prospect

**Compliance:**
- Honor DNC requests immediately
- Always identify yourself and company
- Never make false promises
- Transfer to human when requested

**Disposition Actions:**
- qualified_lead → Route to sales with full context
- callback_requested → Schedule specific time
- not_interested → Log objection, suppress from campaign
- do_not_call → Immediate DNC, apologize
`,
  },

  demand_engage: {
    name: DEMAND_ENGAGE_KNOWLEDGE.name,
    additionalRules: `
### Demand Engage Guidelines
You are the email engagement specialist driving personalized outreach.

**Core Responsibilities:**
- Design high-performance email engagement strategies
- Create deeply personalized email content (3 levels)
- Optimize sequences based on engagement signals
- Learn from response patterns and adapt messaging
- Maintain deliverability and compliance standards

**Personalization Framework:**
- Level 1 (Basic): Name, company, title, industry
- Level 2 (Contextual): Recent news, shared connections, role challenges
- Level 3 (Deep): Tech stack, content they created, specific initiatives

**Sequence Strategy:**
- Cold: 7 touches over 21 days, vary angles each touch
- Warm: 5 touches over 14 days, faster cadence
- Re-engagement: 4 touches over 21 days, lead with new value

**Email Best Practices:**
- Subject lines: 40-60 chars, lowercase start, avoid spam triggers
- Body: 50-125 words, short paragraphs, one clear CTA
- Timing: Tue-Thu, 9-11am recipient local time

**Signal Learning:**
- Multiple opens → Accelerate next touch
- Link clicked → Follow up on specific content
- No opens after 3 emails → Pause and try different channel
- Unsubscribe → Remove immediately, suppress

**Compliance:**
- Include unsubscribe link in all emails
- Process opt-outs within 24 hours
- Respect CAN-SPAM, GDPR, CASL requirements
`,
  },
};

// ==================== ORGANIZATION INTELLIGENCE FETCHER ====================

export interface OrganizationBrain {
  identity: {
    companyName: string;
    description: string;
    industry: string;
    valueProposition: string;
  };
  offerings: {
    products: string;
    useCases: string;
    differentiators: string;
    problemsSolved: string;
  };
  icp: {
    targetIndustries: string;
    targetPersonas: string;
    commonObjections: string;
  };
  positioning: {
    oneLiner: string;
    competitors: string;
    whyUs: string;
  };
  outreach: {
    emailAngles: string;
    callOpeners: string;
  };
  compliance: string;
  voiceDefaults: string;
}

/**
 * Fetch Organization Intelligence to inject into agent brain
 */
export async function getOrganizationBrain(): Promise<OrganizationBrain | null> {
  try {
    const [profile] = await db.select()
      .from(accountIntelligence)
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    if (!profile) {
      console.log("[AgentBrain] No organization intelligence found");
      return null;
    }

    const identity = profile.identity as any || {};
    const offerings = profile.offerings as any || {};
    const icp = profile.icp as any || {};
    const positioning = profile.positioning as any || {};
    const outreach = profile.outreach as any || {};

    return {
      identity: {
        companyName: identity.legalName?.value || "Our Company",
        description: identity.description?.value || "",
        industry: identity.industry?.value || "",
        valueProposition: positioning.oneLiner?.value || "",
      },
      offerings: {
        products: offerings.coreProducts?.value || "",
        useCases: offerings.useCases?.value || "",
        differentiators: offerings.differentiators?.value || "",
        problemsSolved: offerings.problemsSolved?.value || "",
      },
      icp: {
        targetIndustries: icp.industries?.value || "",
        targetPersonas: icp.personas?.value || "",
        commonObjections: icp.objections?.value || "",
      },
      positioning: {
        oneLiner: positioning.oneLiner?.value || "",
        competitors: positioning.competitors?.value || "",
        whyUs: positioning.whyUs?.value || "",
      },
      outreach: {
        emailAngles: outreach.emailAngles?.value || "",
        callOpeners: outreach.callOpeners?.value || "",
      },
      compliance: profile.compliancePolicy || "",
      voiceDefaults: profile.agentVoiceDefaults || "",
    };
  } catch (error) {
    console.error("[AgentBrain] Error fetching organization brain:", error);
    return null;
  }
}

// ==================== MASTER PROMPT GENERATOR ====================

export interface AgentCreationInput {
  taskDescription: string;
  firstMessage: string;
  agentType?: "voice" | "text" | "research" | "qa" | "demand_intel" | "demand_qual" | "demand_engage";
  additionalContext?: string;
  // Specialization config for demand agents
  specializationConfig?: {
    // For demand_intel
    researchDepth?: 'shallow' | 'standard' | 'deep';
    targetSignals?: string[];
    // For demand_qual
    bantWeights?: { budget: number; authority: number; need: number; timeframe: number };
    escalationThreshold?: number;
    // For demand_engage
    personalizationLevel?: 1 | 2 | 3;
    sequenceType?: 'cold' | 'warm' | 'reengagement';
  };
}

export interface GeneratedAgentPrompt {
  masterPrompt: string;
  optimizedFirstMessage: string;
  reasoning: string;
  knowledgeSources: string[];
}

/**
 * Build context for OpenAI to generate master prompt
 */
function buildPromptGenerationContext(
  input: AgentCreationInput,
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

    // Add specialization config if provided
    if (input.specializationConfig) {
      context += `
## Specialization Configuration
${JSON.stringify(input.specializationConfig, null, 2)}
`;
    }
  }

  // Add default knowledge from Unified Knowledge Hub (source of truth)
  // This replaces the deprecated AGENT_DEFAULT_KNOWLEDGE constants
  context += `
## Unified Agent Knowledge (Source of Truth)
Note: Complete agent knowledge is provided by the Unified Knowledge Hub at runtime.
This includes: compliance rules, gatekeeper handling, voicemail detection, dispositioning,
call quality standards, conversation flow, objection handling, and more.
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
 * Generate master prompt using OpenAI
 */
export async function generateMasterAgentPrompt(
  input: AgentCreationInput
): Promise<GeneratedAgentPrompt> {
  const agentType = input.agentType || "voice";
  const orgBrain = await getOrganizationBrain();
  const context = buildPromptGenerationContext(input, orgBrain);

  const systemPrompt = `You are an expert AI agent prompt engineer. Your task is to generate a comprehensive, production-ready system prompt for an AI voice agent.

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

Also optimize the first message to be natural and effective.

Return your response in this exact JSON format:
{
  "masterPrompt": "The complete system prompt for the agent...",
  "optimizedFirstMessage": "The refined opening message...",
  "reasoning": "Brief explanation of key decisions made...",
  "knowledgeSources": ["List of knowledge sources incorporated"]
}`;

  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    // Fallback: Generate prompt without OpenAI
    return generateFallbackPrompt(input, orgBrain);
  }

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiKey });

    const completion = await openai.chat.completions.create({
      model: process.env.AGENT_BRAIN_MODEL || "gpt-4o",
      temperature: 0.3,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: context },
      ],
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(responseText);

    const fallback = generateFallbackPrompt(input, orgBrain);
    const rawMasterPrompt = parsed.masterPrompt || fallback.masterPrompt;
    const masterPrompt =
      agentType === "voice" || agentType === "demand_qual"
        ? ensureVoiceAgentControlLayer(rawMasterPrompt)
        : rawMasterPrompt;

    return {
      masterPrompt,
      optimizedFirstMessage: parsed.optimizedFirstMessage || input.firstMessage,
      reasoning: parsed.reasoning || "Generated using AI prompt engineering",
      knowledgeSources: parsed.knowledgeSources || ["Default Knowledge", "Organization Intelligence"],
    };
  } catch (error) {
    console.error("[AgentBrain] OpenAI prompt generation failed:", error);
    return generateFallbackPrompt(input, orgBrain);
  }
}

/**
 * Fallback prompt generation without OpenAI
 */
function generateFallbackPrompt(
  input: AgentCreationInput,
  orgBrain: OrganizationBrain | null
): GeneratedAgentPrompt {
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

  // Note: In the fallback, we add a placeholder indicating unified knowledge is loaded at runtime
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
    knowledgeSources.push("Default Voice Agent Control & Conversation Intelligence");
  }
  if (orgBrain) {
    knowledgeSources.push("Organization Intelligence");
  }

  return {
    masterPrompt,
    optimizedFirstMessage: input.firstMessage,
    reasoning: "Generated using template-based fallback (OpenAI unavailable)",
    knowledgeSources,
  };
}

// ==================== AGENT MEMORY (Learning) ====================

export interface AgentMemory {
  campaignLearnings: string;
  performanceInsights: string[];
}

/**
 * Get agent memory from campaign learnings
 */
export async function getAgentMemory(): Promise<AgentMemory> {
  try {
    const { getOrganizationLearningSummary } = await import("../lib/org-intelligence-helper");
    const learnings = await getOrganizationLearningSummary();

    return {
      campaignLearnings: learnings,
      performanceInsights: learnings ? learnings.split("\n").filter(line => line.startsWith("-")) : [],
    };
  } catch (error) {
    console.error("[AgentBrain] Error fetching agent memory:", error);
    return {
      campaignLearnings: "",
      performanceInsights: [],
    };
  }
}

/**
 * Build complete agent context with knowledge, brain, and memory
 */
export async function buildCompleteAgentContext(
  basePrompt: string,
  includeMemory: boolean = true
): Promise<string> {
  const orgBrain = await getOrganizationBrain();
  const memory = includeMemory ? await getAgentMemory() : null;

  let fullPrompt = basePrompt;

  if (orgBrain) {
    fullPrompt += `

## Organization Context
Company: ${orgBrain.identity.companyName}
${orgBrain.identity.description}

Value Proposition: ${orgBrain.positioning.oneLiner}

Products/Services: ${orgBrain.offerings.products}

Target Audience: ${orgBrain.icp.targetPersonas} in ${orgBrain.icp.targetIndustries}

Differentiators: ${orgBrain.offerings.differentiators}

Common Objections to Handle: ${orgBrain.icp.commonObjections}
`;

    if (orgBrain.compliance) {
      fullPrompt += `\n## Compliance\n${orgBrain.compliance}\n`;
    }
  }

  if (memory?.campaignLearnings) {
    fullPrompt += `\n## Recent Performance Insights\n${memory.campaignLearnings}\n`;
  }

  return fullPrompt;
}
