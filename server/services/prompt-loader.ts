/**
 * Prompt Loader Service
 *
 * Runtime integration layer for loading prompts from the database.
 * Provides a unified API for all agents to load their prompts with:
 * - Database-first loading with Redis caching
 * - Automatic fallback to hardcoded prompts if database unavailable
 * - Prompt composition for building complete agent prompts
 *
 * Usage:
 *   // Instead of importing hardcoded constants directly:
 *   // import { VOICE_AGENT_FOUNDATIONAL_PROMPT } from './agents/core-voice-agent';
 *
 *   // Use the loader:
 *   const prompt = await loadPrompt('voice.foundational');
 */

import { getPromptByKey } from './prompt-management-service';

// ==================== FALLBACK PROMPTS ====================

// Import hardcoded prompts for fallback when database is unavailable
import { VOICE_AGENT_FOUNDATIONAL_PROMPT } from './agents/core-voice-agent';
import { EMAIL_AGENT_FOUNDATIONAL_PROMPT } from './agents/core-email-agent';
import { COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT } from './agents/core-compliance-agent';
import { DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT } from './agents/core-data-management-agent';
import { DEMAND_INTEL_KNOWLEDGE, DEMAND_QUAL_KNOWLEDGE, DEMAND_ENGAGE_KNOWLEDGE } from './demand-agent-knowledge';
import { VOICE_AGENT_CONTROL_HEADER, VOICE_AGENT_CONTROL_FOOTER } from './voice-agent-control-defaults';

const LOG_PREFIX = '[PromptLoader]';

/**
 * Convert a demand knowledge object to a prompt string
 */
function buildKnowledgePrompt(knowledge: {
  name: string;
  description: string;
  researchMethodology?: string;
  outputFormat?: string;
  qualificationFramework?: string;
  conversationStructure?: string;
  personalizationFramework?: string;
  emailStrategy?: string;
  [key: string]: string | undefined;
}): string {
  const sections: string[] = [];

  // Add header
  sections.push(`# ${knowledge.name}\n\n${knowledge.description}`);

  // Add all methodology/framework sections
  if (knowledge.researchMethodology) {
    sections.push(knowledge.researchMethodology);
  }
  if (knowledge.qualificationFramework) {
    sections.push(knowledge.qualificationFramework);
  }
  if (knowledge.conversationStructure) {
    sections.push(knowledge.conversationStructure);
  }
  if (knowledge.personalizationFramework) {
    sections.push(knowledge.personalizationFramework);
  }
  if (knowledge.emailStrategy) {
    sections.push(knowledge.emailStrategy);
  }
  if (knowledge.outputFormat) {
    sections.push(knowledge.outputFormat);
  }

  return sections.join('\n\n');
}

/**
 * Fallback map - hardcoded prompts to use when database is unavailable
 * Keys must match the promptKey values in the database
 */
const FALLBACK_PROMPTS: Record<string, string> = {
  // Voice Agent Prompts
  'voice.foundational': VOICE_AGENT_FOUNDATIONAL_PROMPT,
  'voice.control.header': VOICE_AGENT_CONTROL_HEADER,
  'voice.control.footer': VOICE_AGENT_CONTROL_FOOTER,

  // Email Agent Prompts
  'email.foundational': EMAIL_AGENT_FOUNDATIONAL_PROMPT,

  // Compliance Prompts
  'compliance.foundational': COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT,
  'data.management': DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT,

  // Intelligence Prompts (demand agents)
  'intel.demand_intel': buildKnowledgePrompt(DEMAND_INTEL_KNOWLEDGE),
  'intel.demand_qual': buildKnowledgePrompt(DEMAND_QUAL_KNOWLEDGE),
  'intel.demand_engage': buildKnowledgePrompt(DEMAND_ENGAGE_KNOWLEDGE),
};

// ==================== PROMPT LOADING ====================

/**
 * Load a prompt by its key
 *
 * Priority order:
 * 1. Database (with Redis caching)
 * 2. Fallback to hardcoded constant
 *
 * @param promptKey - Unique prompt identifier (e.g., 'voice.foundational')
 * @returns The prompt content string
 */
export async function loadPrompt(promptKey: string): Promise<string> {
  try {
    // Try database first
    const dbPrompt = await getPromptByKey(promptKey);
    if (dbPrompt) {
      console.log(`${LOG_PREFIX} Loaded ${promptKey} from database`);
      return dbPrompt;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Database load failed for ${promptKey}, using fallback:`, error);
  }

  // Fallback to hardcoded
  const fallback = FALLBACK_PROMPTS[promptKey];
  if (fallback) {
    console.log(`${LOG_PREFIX} Using fallback for ${promptKey}`);
    return fallback;
  }

  console.warn(`${LOG_PREFIX} No prompt found for ${promptKey}`);
  return '';
}

/**
 * Load multiple prompts at once
 *
 * @param promptKeys - Array of prompt keys to load
 * @returns Map of promptKey -> content
 */
export async function loadPrompts(promptKeys: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Load all prompts in parallel
  const loadPromises = promptKeys.map(async (key) => {
    const content = await loadPrompt(key);
    return { key, content };
  });

  const loaded = await Promise.all(loadPromises);

  for (const { key, content } of loaded) {
    results.set(key, content);
  }

  return results;
}

// ==================== PROMPT COMPOSITION ====================

export interface AgentPromptOptions {
  /** The agent type determines which foundational prompt to use */
  agentType: 'voice' | 'email' | 'intelligence' | 'compliance' | 'data_management';

  /** Base prompt key (defaults based on agentType) */
  basePromptKey?: string;

  /** Include unified knowledge hub content */
  includeKnowledge?: boolean;

  /** Specific knowledge categories to include */
  knowledgeCategories?: string[];

  /** Organization-specific context */
  organizationContext?: {
    orgName?: string;
    orgIntelligence?: string;
    compliancePolicy?: string;
    platformPolicies?: string;
    voiceDefaults?: string;
  };

  /** Campaign-specific context */
  campaignContext?: {
    campaignName?: string;
    objective?: string;
    targetAudience?: string;
    talkingPoints?: string[];
    valueProposition?: string;
  };

  /** Contact-specific context */
  contactContext?: {
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    company?: string;
  };

  /** Provider (for provider-specific formatting) */
  provider?: 'openai' | 'google' | 'anthropic';
}

/**
 * Build a complete agent prompt by composing multiple layers
 *
 * Layers (in order of injection):
 * 1. Foundational prompt (core agent behavior)
 * 2. Knowledge hub content (compliance, guidelines, etc.)
 * 3. Organization context (company-specific info)
 * 4. Campaign context (campaign objectives, talking points)
 * 5. Contact context (personalization)
 */
export async function buildAgentPrompt(options: AgentPromptOptions): Promise<string> {
  const parts: string[] = [];

  // Determine base prompt key
  const basePromptKey = options.basePromptKey || getDefaultPromptKey(options.agentType);

  // 1. Load foundational prompt
  const foundational = await loadPrompt(basePromptKey);
  if (foundational) {
    parts.push(foundational);
  }

  // 2. Add control header for voice agents
  if (options.agentType === 'voice') {
    const controlHeader = await loadPrompt('voice.control.header');
    if (controlHeader) {
      parts.push(controlHeader);
    }
  }

  // 3. Add organization context
  if (options.organizationContext) {
    const orgSection = buildOrganizationSection(options.organizationContext);
    if (orgSection) {
      parts.push(orgSection);
    }
  }

  // 4. Add campaign context
  if (options.campaignContext) {
    const campaignSection = buildCampaignSection(options.campaignContext);
    if (campaignSection) {
      parts.push(campaignSection);
    }
  }

  // 5. Add contact context
  if (options.contactContext) {
    const contactSection = buildContactSection(options.contactContext);
    if (contactSection) {
      parts.push(contactSection);
    }
  }

  // 6. Add control footer for voice agents
  if (options.agentType === 'voice') {
    const controlFooter = await loadPrompt('voice.control.footer');
    if (controlFooter) {
      parts.push(controlFooter);
    }
  }

  // Apply provider-specific formatting if needed
  const combined = parts.join('\n\n');

  if (options.provider === 'google') {
    return formatForGoogle(combined);
  }

  return combined;
}

/**
 * Get the default prompt key for an agent type
 */
function getDefaultPromptKey(agentType: string): string {
  switch (agentType) {
    case 'voice':
      return 'voice.foundational';
    case 'email':
      return 'email.foundational';
    case 'intelligence':
      return 'intel.demand_intel';
    case 'compliance':
      return 'compliance.foundational';
    case 'data_management':
      return 'data.management';
    default:
      return 'voice.foundational';
  }
}

/**
 * Build organization context section
 */
function buildOrganizationSection(context: AgentPromptOptions['organizationContext']): string {
  if (!context) return '';

  const lines: string[] = ['## Organization Context'];

  if (context.orgName) {
    lines.push(`- **Organization**: ${context.orgName}`);
  }
  if (context.orgIntelligence) {
    lines.push(`\n### Organization Intelligence\n${context.orgIntelligence}`);
  }
  if (context.compliancePolicy) {
    lines.push(`\n### Compliance Policy\n${context.compliancePolicy}`);
  }
  if (context.platformPolicies) {
    lines.push(`\n### Platform Policies\n${context.platformPolicies}`);
  }
  if (context.voiceDefaults) {
    lines.push(`\n### Voice Defaults\n${context.voiceDefaults}`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Build campaign context section
 */
function buildCampaignSection(context: AgentPromptOptions['campaignContext']): string {
  if (!context) return '';

  const lines: string[] = ['## Campaign Context'];

  if (context.campaignName) {
    lines.push(`- **Campaign**: ${context.campaignName}`);
  }
  if (context.objective) {
    lines.push(`- **Objective**: ${context.objective}`);
  }
  if (context.targetAudience) {
    lines.push(`- **Target Audience**: ${context.targetAudience}`);
  }
  if (context.valueProposition) {
    lines.push(`\n### Value Proposition\n${context.valueProposition}`);
  }
  if (context.talkingPoints && context.talkingPoints.length > 0) {
    lines.push(`\n### Key Talking Points`);
    context.talkingPoints.forEach((point, i) => {
      lines.push(`${i + 1}. ${point}`);
    });
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Build contact context section
 */
function buildContactSection(context: AgentPromptOptions['contactContext']): string {
  if (!context) return '';

  const lines: string[] = ['## Contact Context'];

  if (context.firstName || context.lastName) {
    lines.push(`- **Name**: ${context.firstName || ''} ${context.lastName || ''}`.trim());
  }
  if (context.jobTitle) {
    lines.push(`- **Title**: ${context.jobTitle}`);
  }
  if (context.company) {
    lines.push(`- **Company**: ${context.company}`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Format prompt for Google/Gemini (uses XML-like tags)
 */
function formatForGoogle(prompt: string): string {
  // Add critical preamble for Gemini to prevent premature disclosure
  const preamble = `<critical_rules>
CRITICAL COMPLIANCE RULES (ABSOLUTE - NO EXCEPTIONS):
1. NEVER disclose or say the organization name until identity is EXPLICITLY confirmed
2. NEVER introduce yourself with company name at start of call
3. After greeting, STOP speaking and wait for response
4. Do NOT assume, predict, or continue speaking after questions
5. Do NOT say "okay", "great", "perfect" until hearing actual response
6. Person must EXPLICITLY confirm identity before proceeding
</critical_rules>

`;

  return preamble + prompt;
}

// ==================== PROMPT DEFINITIONS FOR SYNC ====================

import type { PromptDefinition } from './prompt-management-service';

/**
 * All prompt definitions that should be synced to the database
 * These are extracted from the hardcoded constants in the codebase
 */
export const ALL_PROMPT_DEFINITIONS: PromptDefinition[] = [
  // Voice Agent Prompts
  {
    promptKey: 'voice.foundational',
    name: 'Voice Agent Foundational Prompt',
    description: 'Core behavior and rules for all voice agents. Defines conversation flow, identity verification, and professional conduct.',
    promptType: 'foundational',
    promptScope: 'agent_type',
    agentType: 'voice',
    category: 'voice',
    content: VOICE_AGENT_FOUNDATIONAL_PROMPT,
    sourceFile: 'server/services/agents/core-voice-agent.ts',
    sourceLine: 27,
    sourceExport: 'VOICE_AGENT_FOUNDATIONAL_PROMPT',
    priority: 100,
    tags: ['voice', 'foundational', 'conversation', 'identity'],
  },
  {
    promptKey: 'voice.control.header',
    name: 'Voice Agent Control Header',
    description: 'Control instructions added at the start of voice agent prompts.',
    promptType: 'system',
    promptScope: 'agent_type',
    agentType: 'voice',
    category: 'voice',
    content: VOICE_AGENT_CONTROL_HEADER,
    sourceFile: 'server/services/voice-agent-control-defaults.ts',
    sourceLine: 1,
    sourceExport: 'VOICE_AGENT_CONTROL_HEADER',
    priority: 95,
    tags: ['voice', 'control', 'header'],
  },
  {
    promptKey: 'voice.control.footer',
    name: 'Voice Agent Control Footer',
    description: 'Control instructions added at the end of voice agent prompts. Includes rules about never speaking tool names aloud.',
    promptType: 'system',
    promptScope: 'agent_type',
    agentType: 'voice',
    category: 'voice',
    content: VOICE_AGENT_CONTROL_FOOTER,
    sourceFile: 'server/services/voice-agent-control-defaults.ts',
    sourceLine: 4,
    sourceExport: 'VOICE_AGENT_CONTROL_FOOTER',
    priority: 90,
    tags: ['voice', 'control', 'footer'],
  },

  // Email Agent Prompts
  {
    promptKey: 'email.foundational',
    name: 'Email Agent Foundational Prompt',
    description: 'Core behavior for email generation agents. Defines deliverability, compliance, design, and conversion optimization rules.',
    promptType: 'foundational',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: EMAIL_AGENT_FOUNDATIONAL_PROMPT,
    sourceFile: 'server/services/agents/core-email-agent.ts',
    sourceLine: 33,
    sourceExport: 'EMAIL_AGENT_FOUNDATIONAL_PROMPT',
    priority: 100,
    tags: ['email', 'foundational', 'deliverability', 'compliance'],
  },

  // Compliance Prompts
  {
    promptKey: 'compliance.foundational',
    name: 'Compliance Agent Foundational Prompt',
    description: 'Always-on governance authority for compliance validation across all agent activities.',
    promptType: 'foundational',
    promptScope: 'agent_type',
    agentType: 'compliance',
    category: 'compliance',
    content: COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT,
    sourceFile: 'server/services/agents/core-compliance-agent.ts',
    sourceLine: 18,
    sourceExport: 'COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT',
    priority: 100,
    tags: ['compliance', 'governance', 'tcpa', 'gdpr', 'ccpa'],
  },
  {
    promptKey: 'data.management',
    name: 'Data Management Agent Prompt',
    description: 'Data quality, hygiene, and enrichment agent behavior definitions.',
    promptType: 'foundational',
    promptScope: 'agent_type',
    agentType: 'data_management',
    category: 'compliance',
    content: DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT,
    sourceFile: 'server/services/agents/core-data-management-agent.ts',
    sourceLine: 17,
    sourceExport: 'DATA_MANAGEMENT_AGENT_FOUNDATIONAL_PROMPT',
    priority: 90,
    tags: ['data', 'hygiene', 'enrichment', 'quality'],
  },

  // Intelligence Prompts
  {
    promptKey: 'intel.demand_intel',
    name: 'Demand Intelligence Prompt',
    description: 'Research methodology for account intelligence gathering. Defines research streams, buying signal detection, and output formats.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'intelligence',
    category: 'intelligence',
    content: buildKnowledgePrompt(DEMAND_INTEL_KNOWLEDGE),
    sourceFile: 'server/services/demand-agent-knowledge.ts',
    sourceLine: 14,
    sourceExport: 'DEMAND_INTEL_KNOWLEDGE',
    priority: 100,
    tags: ['intelligence', 'research', 'account', 'signals'],
  },
  {
    promptKey: 'intel.demand_qual',
    name: 'Demand Qualification Prompt',
    description: 'BANT framework and qualification standards for lead qualification agents.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'intelligence',
    category: 'intelligence',
    content: buildKnowledgePrompt(DEMAND_QUAL_KNOWLEDGE),
    sourceFile: 'server/services/demand-agent-knowledge.ts',
    sourceLine: 161,
    sourceExport: 'DEMAND_QUAL_KNOWLEDGE',
    priority: 95,
    tags: ['intelligence', 'qualification', 'bant', 'scoring'],
  },
  {
    promptKey: 'intel.demand_engage',
    name: 'Demand Engagement Prompt',
    description: 'Multi-level personalization and email sequence strategy for engagement agents.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'intelligence',
    category: 'intelligence',
    content: buildKnowledgePrompt(DEMAND_ENGAGE_KNOWLEDGE),
    sourceFile: 'server/services/demand-agent-knowledge.ts',
    sourceLine: 762,
    sourceExport: 'DEMAND_ENGAGE_KNOWLEDGE',
    priority: 90,
    tags: ['intelligence', 'engagement', 'personalization', 'email'],
  },
];
