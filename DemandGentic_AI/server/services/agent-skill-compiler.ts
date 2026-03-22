/**
 * Agent Skill Compiler
 *
 * Compiles skill definitions + user inputs + org intelligence
 * into complete, production-ready voice agent system prompts.
 *
 * NO PROMPT WRITING REQUIRED BY USERS.
 */

import {
  VISION_MISSION_GOVERNANCE_LAYER,
  UNIVERSAL_VOICE_AGENT_BRAIN,
  AgentSkill,
  getSkillById,
  type SkillInput
} from './agent-skills';
import { getOrganizationBrain, type OrganizationBrain } from './agent-brain-service';
import { CANONICAL_DEFAULT_OPENING_MESSAGE } from './voice-agent-control-defaults';

export interface SkillCompilationInput {
  agentName: string;
  skillId: string;
  skillInputValues: Record; // User-provided values for skill inputs
  organizationName?: string;
}

export interface CompiledAgentPrompt {
  systemPrompt: string;
  firstMessage: string;
  skillMetadata: {
    skillName: string;
    category: string;
    successMetrics: string[];
    callFlowStages: string[];
  };
  compiledAt: Date;
  sources: string[];
}

/**
 * Compile a skill into a complete agent system prompt
 */
export async function compileSkillToPrompt(
  input: SkillCompilationInput
): Promise {
  // Get the skill definition
  const skill = getSkillById(input.skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${input.skillId}`);
  }

  // Get organization intelligence
  const orgBrain = await getOrganizationBrain();

  // Build the complete system prompt
  const systemPrompt = buildSystemPrompt(
    input.agentName,
    skill,
    input.skillInputValues,
    orgBrain,
    input.organizationName
  );

  // Build the first message
  const firstMessage = buildFirstMessage(
    input.agentName,
    skill,
    input.skillInputValues,
    orgBrain,
    input.organizationName
  );

  // Track sources used
  const sources = [
    'Universal Voice Agent Brain',
    `Skill: ${skill.name}`,
  ];
  if (orgBrain) {
    sources.push('Organization Intelligence');
  }
  if (Object.keys(input.skillInputValues).length > 0) {
    sources.push('User Context & Inputs');
  }

  return {
    systemPrompt,
    firstMessage,
    skillMetadata: {
      skillName: skill.name,
      category: skill.category,
      successMetrics: skill.successMetrics,
      callFlowStages: skill.callFlowStages,
    },
    compiledAt: new Date(),
    sources,
  };
}

/**
 * Build complete system prompt by layering:
 * 0. Vision & Mission Governance (HIGHEST PRIORITY)
 * 1. Universal Brain
 * 2. Skill Intelligence
 * 3. Organization Context
 * 4. User Inputs
 */
function buildSystemPrompt(
  agentName: string,
  skill: AgentSkill,
  skillInputs: Record,
  orgBrain: OrganizationBrain | null,
  organizationName?: string
): string {
  const sections: string[] = [];

  // Section 0: Vision & Mission Governance Layer (ALWAYS FIRST)
  sections.push(VISION_MISSION_GOVERNANCE_LAYER);

  // Section 1: Identity & Role
  sections.push(`# AGENT IDENTITY

You are ${agentName}, a professional B2B voice agent specializing in ${skill.name.toLowerCase()}.
${organizationName ? `You represent ${organizationName}.` : ''}

Your skill: ${skill.description}

Your mission: ${skill.userFacingDescription}

**Remember:** All your actions must pass through the Layer 0 Vision & Mission filter before execution.
`);

  // Section 2: Universal Brain (ALWAYS INCLUDED)
  sections.push(UNIVERSAL_VOICE_AGENT_BRAIN);

  // Section 3: Skill-Specific Intelligence
  sections.push(`
# SPECIALIZED SKILL INTELLIGENCE

${skill.skillIntelligence}
`);

  // Section 4: Context from User Inputs
  if (Object.keys(skillInputs).length > 0) {
    sections.push(buildContextSection(skill, skillInputs));
  }

  // Section 5: Organization Intelligence
  if (orgBrain) {
    sections.push(buildOrganizationSection(orgBrain));
  }

  // Section 6: Success Criteria & Metrics
  sections.push(`
# SUCCESS CRITERIA & MISSION-ALIGNMENT METRICS

## Your Performance Metrics
${skill.successMetrics.map(m => `- ${m}`).join('\n')}

## Mission-Alignment Metrics (HIGHEST PRIORITY)
- **Mission-Aligned Actions Rate:** >95% of actions must pass Vision/Mission filter
- **Tactic Override Rate:** Track when you modify/suppress tactics due to mission conflicts
- **Long-Term Value Score:** Optimize for relationship quality, not just conversion
- **Brand Trust Index:** Low opt-out rates (8/10)
- **Sales Quality Score:** High qualified-to-conversion rates (>40%)

## Call Flow Checklist
You must progress through these stages on every call:
${skill.callFlowStages.map((stage, idx) => `${idx + 1}. ${stage}`).join('\n')}

## Quality Standards
- **Mission-First:** Every action must align with organization's Vision/Mission
- **Professionalism:** Maintain executive-level communication at all times
- **Compliance:** Zero tolerance for violations - honor all opt-outs immediately
- **Value-First:** Lead with insights and value, never with sales pressure
- **Efficiency:** Respect their time - be concise and purposeful
- **Personalization:** Adapt your approach based on their role, industry, and responses
- **Outcome-Driven:** Every call must end with a clear classification and next action
- **Brand Stewardship:** Protect the organization's reputation above all metrics

## Required Output Per Call
At the end of every call, you must log:
1. **Transcript:** Full conversation record
2. **Outcome Classification:** qualified_lead, callback_requested, nurture, not_interested, do_not_call, wrong_contact, voicemail
3. **Engagement Score:** 1-10 rating of prospect engagement
4. **Consent Status:** Permissions granted (email follow-up, callback, etc.)
5. **Follow-Up Action:** Next step required
6. **Lead/Meeting Status:** Current stage in pipeline
7. **Structured Insights:** Key learnings from the conversation
8. **Mission-Alignment Flag:**
   - **Aligned:** All actions consistent with Vision/Mission
   - **Neutral:** No conflicts detected
   - **Modified:** Adjusted tactics to align with Vision/Mission
   - **Aborted:** Stopped interaction due to mission conflict
`);

  return sections.join('\n\n---\n\n');
}

/**
 * Build context section from user inputs
 */
function buildContextSection(
  skill: AgentSkill,
  skillInputs: Record
): string {
  let context = '# YOUR CONTEXT & INPUTS\n\n';
  context += 'The following information has been provided to you. Use it to personalize your conversations:\n\n';

  // Map inputs to readable format
  const allInputs = [...skill.requiredInputs, ...skill.optionalInputs];

  for (const input of allInputs) {
    const value = skillInputs[input.key];
    if (value) {
      context += `## ${input.label}\n`;

      if (input.type === 'file') {
        context += `[File uploaded: ${value}]\n`;
        context += `**Instruction:** You must extract key information from this asset and reference it naturally in your conversations. Never hallucinate content not present in the file.\n\n`;
      } else if (input.type === 'textarea') {
        context += `${value}\n\n`;
      } else if (Array.isArray(value)) {
        context += value.map(v => `- ${v}`).join('\n') + '\n\n';
      } else {
        context += `${value}\n\n`;
      }
    }
  }

  return context;
}

/**
 * Build organization intelligence section
 */
function buildOrganizationSection(orgBrain: OrganizationBrain): string {
  return `
# ORGANIZATION INTELLIGENCE & MISSION CONTEXT

## Organization Vision & Mission (DECISION FILTERS)
${orgBrain.identity.valueProposition ? `
**Vision/Mission Statement:**
${orgBrain.identity.valueProposition}

**How this influences your behavior:**
- Use this as your PRIMARY decision filter for all actions
- When tactics conflict with this vision, the vision wins
- Optimize for long-term alignment with this mission, not short-term metrics
- You are a steward of this vision in every conversation
` : `
**Default Mission:** Educate, qualify thoughtfully, and connect the right prospects with the right solutions at the right time.
**Default Vision:** Build long-term, trust-based relationships with customers who genuinely benefit from our solutions.
`}

## Company You Represent
- **Name:** ${orgBrain.identity.companyName}
- **Industry:** ${orgBrain.identity.industry}
- **Description:** ${orgBrain.identity.description}
- **Value Proposition:** ${orgBrain.identity.valueProposition}

## What We Offer
- **Products/Services:** ${orgBrain.offerings.products}
- **Key Use Cases:** ${orgBrain.offerings.useCases}
- **Problems We Solve:** ${orgBrain.offerings.problemsSolved}
- **Differentiators:** ${orgBrain.offerings.differentiators}

## Target Audience
- **Industries:** ${orgBrain.icp.targetIndustries}
- **Personas:** ${orgBrain.icp.targetPersonas}

## Positioning
- **One-Liner:** ${orgBrain.positioning.oneLiner}
- **Competitors:** ${orgBrain.positioning.competitors}
- **Why Us:** ${orgBrain.positioning.whyUs}

## Common Objections & Responses
${orgBrain.icp.commonObjections}

${orgBrain.compliance ? `## Compliance Policy\n${orgBrain.compliance}\n` : ''}
${orgBrain.voiceDefaults ? `## Voice & Tone Guidelines\n${orgBrain.voiceDefaults}\n` : ''}

---

**CRITICAL REMINDER:**
Before every action, ask: "Does this align with our Vision/Mission and build long-term trust?"
If no → modify or abort the action.
`;
}

/**
 * Build dynamic first message based on skill and context
 * 
 * Uses the CANONICAL gatekeeper-first opening message pattern.
 * Variables are validated and interpolated at runtime by the dialer.
 */
function buildFirstMessage(
  agentName: string,
  skill: AgentSkill,
  skillInputs: Record,
  orgBrain: OrganizationBrain | null,
  organizationName?: string
): string {
  // Use the canonical gatekeeper-first opening message
  // Variables will be validated and interpolated at dial time
  // This ensures we never dial without required contact/account data
  return CANONICAL_DEFAULT_OPENING_MESSAGE;
}

/**
 * Validate required inputs are provided
 */
export function validateSkillInputs(
  skillId: string,
  providedInputs: Record
): { valid: boolean; missingInputs: string[]; errors: string[] } {
  const skill = getSkillById(skillId);
  if (!skill) {
    return {
      valid: false,
      missingInputs: [],
      errors: [`Skill not found: ${skillId}`]
    };
  }

  const missingInputs: string[] = [];
  const errors: string[] = [];

  // Check required inputs
  for (const input of skill.requiredInputs) {
    if (!providedInputs[input.key]) {
      missingInputs.push(input.label);
    }

    // Validate input if provided
    if (providedInputs[input.key] && input.validation) {
      const value = providedInputs[input.key];

      if (input.validation.minLength && value.length  input.validation.maxLength) {
        errors.push(`${input.label} must be no more than ${input.validation.maxLength} characters`);
      }

      if (input.validation.pattern) {
        const regex = new RegExp(input.validation.pattern);
        if (!regex.test(value)) {
          errors.push(`${input.label} format is invalid`);
        }
      }
    }
  }

  return {
    valid: missingInputs.length === 0 && errors.length === 0,
    missingInputs,
    errors
  };
}

/**
 * Preview what a compiled prompt will look like (for UI preview)
 */
export async function previewCompiledPrompt(
  input: SkillCompilationInput
): Promise {
  const compiled = await compileSkillToPrompt(input);

  const wordCount = compiled.systemPrompt.split(/\s+/).length;
  const estimatedTokens = Math.ceil(wordCount * 1.3); // Rough estimate

  return {
    preview: compiled.systemPrompt,
    wordCount,
    estimatedTokens
  };
}