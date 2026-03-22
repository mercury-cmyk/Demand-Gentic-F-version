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
import { VOICE_AGENT_FOUNDATIONAL_PROMPT } from './agents';

// ==================== FALLBACK PROMPTS ====================

// Import hardcoded prompts for fallback when database is unavailable
// All foundational prompts now come through unified agents (single source of truth)
import { unifiedVoiceAgent } from './agents/unified/unified-voice-agent';
import { unifiedEmailAgent } from './agents/unified/unified-email-agent';
import { unifiedQAAgent } from './agents/unified/unified-qa-agent';
import { unifiedMemoryAgent } from './agents/unified/unified-memory-agent';
import { DEMAND_INTEL_KNOWLEDGE, DEMAND_QUAL_KNOWLEDGE, DEMAND_ENGAGE_KNOWLEDGE } from './demand-agent-knowledge';
import { VOICE_AGENT_CONTROL_HEADER, VOICE_AGENT_CONTROL_FOOTER } from './voice-agent-control-defaults';

// Import centralized email prompts
import {
  EMAIL_GENERATION_PROMPT,
  EMAIL_IMPROVEMENT_PROMPT,
  EMAIL_ANALYSIS_PROMPT,
  EMAIL_REWRITE_PROMPT,
  SUBJECT_VARIANTS_PROMPT,
  SPAM_DETECTION_PROMPT,
  DELIVERABILITY_OPTIMIZATION_PROMPT,
  TEMPLATE_VALIDATION_PROMPT,
  CAMPAIGN_TYPE_EMAIL_PROMPT,
  PERSONALIZATION_ENHANCEMENT_PROMPT,
  SEQUENCE_OPTIMIZATION_PROMPT,
  COMPLIANCE_CHECK_PROMPT,
  AB_TEST_VARIANT_PROMPT,
} from './email-prompts';

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
const FALLBACK_PROMPTS: Record = {
  // Voice Agent Prompts — sourced from unified voice agent (single source of truth)
  'voice.foundational': unifiedVoiceAgent.assembleFoundationalPrompt(),
  'voice.control.header': VOICE_AGENT_CONTROL_HEADER,
  'voice.control.footer': VOICE_AGENT_CONTROL_FOOTER,

  // Email Agent Prompts — sourced from unified email agent
  'email.foundational': unifiedEmailAgent.assembleFoundationalPrompt(),

  // Compliance Prompts — sourced from unified QA agent (compliance → qa mapping)
  'compliance.foundational': unifiedQAAgent.assembleFoundationalPrompt(),
  // Data Management — sourced from unified memory agent (data-management → memory mapping)
  'data.management': unifiedMemoryAgent.assembleFoundationalPrompt(),

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
export async function loadPrompt(promptKey: string): Promise {
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

  // Dynamic fallback for unified foundational prompts so runtime reflects
  // latest in-process section edits from the unified agent architecture UI.
  if (promptKey === 'voice.foundational') {
    const { isUnifiedVoiceArchitectureEnabled } = await import('./agents/unified/architecture-mode');
    const useUnified = isUnifiedVoiceArchitectureEnabled();
    console.log(`${LOG_PREFIX} Using dynamic ${useUnified ? 'unified' : 'legacy'} fallback for ${promptKey}`);
    return useUnified ? unifiedVoiceAgent.assembleFoundationalPrompt() : VOICE_AGENT_FOUNDATIONAL_PROMPT;
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
export async function loadPrompts(promptKeys: string[]): Promise> {
  const results = new Map();

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
export async function buildAgentPrompt(options: AgentPromptOptions): Promise {
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
  const preamble = `
CRITICAL COMPLIANCE RULES (ABSOLUTE - NO EXCEPTIONS):
1. NEVER disclose or say the organization name until identity is EXPLICITLY confirmed
2. NEVER introduce yourself with company name at start of call
3. After greeting, STOP speaking and wait for response
4. Do NOT assume, predict, or continue speaking after questions
5. Do NOT say "okay", "great", "perfect" until hearing actual response
6. Person must EXPLICITLY confirm identity before proceeding


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
    content: unifiedVoiceAgent.assembleFoundationalPrompt(),
    sourceFile: 'server/services/agents/unified/unified-voice-agent.ts',
    sourceLine: 1,
    sourceExport: 'unifiedVoiceAgent',
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
    content: unifiedEmailAgent.assembleFoundationalPrompt(),
    sourceFile: 'server/services/agents/unified/unified-email-agent.ts',
    sourceLine: 1,
    sourceExport: 'unifiedEmailAgent',
    priority: 100,
    tags: ['email', 'foundational', 'deliverability', 'compliance'],
  },
  {
    promptKey: 'email.generation',
    name: 'Email Generation Prompt',
    description: 'DeepSeek system prompt for generating B2B demand generation emails with problem-led, insight-driven content.',
    promptType: 'system',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: EMAIL_GENERATION_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 25,
    sourceExport: 'EMAIL_GENERATION_PROMPT',
    priority: 95,
    tags: ['email', 'generation', 'deepseek', 'b2b'],
  },
  {
    promptKey: 'email.improvement',
    name: 'Email Improvement Prompt',
    description: 'System prompt for improving existing email content while preserving HTML structure and branding.',
    promptType: 'system',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: EMAIL_IMPROVEMENT_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 50,
    sourceExport: 'EMAIL_IMPROVEMENT_PROMPT',
    priority: 94,
    tags: ['email', 'improvement', 'optimization'],
  },
  {
    promptKey: 'email.analysis',
    name: 'Email Analysis Prompt',
    description: 'OpenAI system prompt for analyzing email effectiveness, tone, clarity, and professionalism.',
    promptType: 'system',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: EMAIL_ANALYSIS_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 70,
    sourceExport: 'EMAIL_ANALYSIS_PROMPT',
    priority: 93,
    tags: ['email', 'analysis', 'openai', 'quality'],
  },
  {
    promptKey: 'email.rewrite',
    name: 'Email Rewrite Prompt',
    description: 'System prompt for rewriting emails with specific improvements while maintaining original intent.',
    promptType: 'system',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: EMAIL_REWRITE_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 85,
    sourceExport: 'EMAIL_REWRITE_PROMPT',
    priority: 92,
    tags: ['email', 'rewrite', 'optimization'],
  },
  {
    promptKey: 'email.subject_variants',
    name: 'Subject Line Variants Prompt',
    description: 'System prompt for generating A/B test subject line variants with different psychological approaches.',
    promptType: 'system',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: SUBJECT_VARIANTS_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 100,
    sourceExport: 'SUBJECT_VARIANTS_PROMPT',
    priority: 91,
    tags: ['email', 'subject', 'ab-testing', 'variants'],
  },
  {
    promptKey: 'email.spam_detection',
    name: 'Spam Detection Prompt',
    description: 'System prompt for analyzing emails for spam trigger content, compliance issues, and technical problems.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: SPAM_DETECTION_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 125,
    sourceExport: 'SPAM_DETECTION_PROMPT',
    priority: 90,
    tags: ['email', 'spam', 'deliverability', 'compliance'],
  },
  {
    promptKey: 'email.deliverability',
    name: 'Deliverability Optimization Prompt',
    description: 'System prompt for analyzing and improving email deliverability and inbox placement rates.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: DELIVERABILITY_OPTIMIZATION_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 180,
    sourceExport: 'DELIVERABILITY_OPTIMIZATION_PROMPT',
    priority: 89,
    tags: ['email', 'deliverability', 'inbox', 'optimization'],
  },
  {
    promptKey: 'email.template_validation',
    name: 'Template Validation Prompt',
    description: 'System prompt for validating HTML email templates against structure, styling, and compliance standards.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: TEMPLATE_VALIDATION_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 220,
    sourceExport: 'TEMPLATE_VALIDATION_PROMPT',
    priority: 88,
    tags: ['email', 'template', 'validation', 'html'],
  },
  {
    promptKey: 'email.campaign_type',
    name: 'Campaign Type Email Prompt',
    description: 'System prompt for generating emails optimized for specific campaign types (webinar, content syndication, SQL, etc.).',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: CAMPAIGN_TYPE_EMAIL_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 280,
    sourceExport: 'CAMPAIGN_TYPE_EMAIL_PROMPT',
    priority: 87,
    tags: ['email', 'campaign', 'webinar', 'content', 'sql'],
  },
  {
    promptKey: 'email.personalization',
    name: 'Personalization Enhancement Prompt',
    description: 'System prompt for adding intelligent personalization tokens and fallbacks to email content.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: PERSONALIZATION_ENHANCEMENT_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 330,
    sourceExport: 'PERSONALIZATION_ENHANCEMENT_PROMPT',
    priority: 86,
    tags: ['email', 'personalization', 'merge-fields', 'tokens'],
  },
  {
    promptKey: 'email.sequence_optimization',
    name: 'Sequence Optimization Prompt',
    description: 'System prompt for designing and optimizing multi-touch email sequences for maximum conversion.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: SEQUENCE_OPTIMIZATION_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 380,
    sourceExport: 'SEQUENCE_OPTIMIZATION_PROMPT',
    priority: 85,
    tags: ['email', 'sequence', 'nurture', 'cadence'],
  },
  {
    promptKey: 'email.compliance_check',
    name: 'Email Compliance Check Prompt',
    description: 'System prompt for validating email compliance with CAN-SPAM, GDPR, CCPA, and CASL regulations.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: COMPLIANCE_CHECK_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 440,
    sourceExport: 'COMPLIANCE_CHECK_PROMPT',
    priority: 84,
    tags: ['email', 'compliance', 'gdpr', 'can-spam', 'ccpa'],
  },
  {
    promptKey: 'email.ab_test_variants',
    name: 'A/B Test Variant Generation Prompt',
    description: 'System prompt for generating statistically meaningful A/B test variants for email optimization.',
    promptType: 'specialized',
    promptScope: 'agent_type',
    agentType: 'email',
    category: 'email',
    content: AB_TEST_VARIANT_PROMPT,
    sourceFile: 'server/services/email-prompts.ts',
    sourceLine: 500,
    sourceExport: 'AB_TEST_VARIANT_PROMPT',
    priority: 83,
    tags: ['email', 'ab-testing', 'optimization', 'variants'],
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
    content: unifiedQAAgent.assembleFoundationalPrompt(),
    sourceFile: 'server/services/agents/unified/unified-qa-agent.ts',
    sourceLine: 1,
    sourceExport: 'unifiedQAAgent',
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
    content: unifiedMemoryAgent.assembleFoundationalPrompt(),
    sourceFile: 'server/services/agents/unified/unified-memory-agent.ts',
    sourceLine: 1,
    sourceExport: 'unifiedMemoryAgent',
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