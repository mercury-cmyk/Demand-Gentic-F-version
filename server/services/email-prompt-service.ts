/**
 * Email Prompt Service
 * 
 * Centralized service for loading and managing email prompts.
 * Provides database-first loading with Redis caching and hardcoded fallbacks.
 * 
 * All email-related AI functionality MUST use this service to load prompts.
 * This ensures:
 * - Single source of truth for all email prompts
 * - Versioning and audit trail through admin interface
 * - Hot-reloading of prompt changes without deployment
 * - Consistent behavior across all email services
 */

import { getPromptByKey } from './prompt-management-service';
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
import { EMAIL_AGENT_FOUNDATIONAL_PROMPT } from './agents/core-email-agent';

const LOG_PREFIX = '[EmailPromptService]';

// ==================== PROMPT KEY CONSTANTS ====================

/**
 * All email prompt keys - use these constants to avoid typos
 */
export const EMAIL_PROMPT_KEYS = {
  FOUNDATIONAL: 'email.foundational',
  GENERATION: 'email.generation',
  IMPROVEMENT: 'email.improvement',
  ANALYSIS: 'email.analysis',
  REWRITE: 'email.rewrite',
  SUBJECT_VARIANTS: 'email.subject_variants',
  SPAM_DETECTION: 'email.spam_detection',
  DELIVERABILITY: 'email.deliverability',
  TEMPLATE_VALIDATION: 'email.template_validation',
  CAMPAIGN_TYPE: 'email.campaign_type',
  PERSONALIZATION: 'email.personalization',
  SEQUENCE_OPTIMIZATION: 'email.sequence_optimization',
  COMPLIANCE_CHECK: 'email.compliance_check',
  AB_TEST_VARIANTS: 'email.ab_test_variants',
} as const;

export type EmailPromptKey = typeof EMAIL_PROMPT_KEYS[keyof typeof EMAIL_PROMPT_KEYS];

// ==================== FALLBACK MAP ====================

/**
 * Fallback prompts when database is unavailable
 */
const FALLBACK_PROMPTS: Record<EmailPromptKey, string> = {
  [EMAIL_PROMPT_KEYS.FOUNDATIONAL]: EMAIL_AGENT_FOUNDATIONAL_PROMPT,
  [EMAIL_PROMPT_KEYS.GENERATION]: EMAIL_GENERATION_PROMPT,
  [EMAIL_PROMPT_KEYS.IMPROVEMENT]: EMAIL_IMPROVEMENT_PROMPT,
  [EMAIL_PROMPT_KEYS.ANALYSIS]: EMAIL_ANALYSIS_PROMPT,
  [EMAIL_PROMPT_KEYS.REWRITE]: EMAIL_REWRITE_PROMPT,
  [EMAIL_PROMPT_KEYS.SUBJECT_VARIANTS]: SUBJECT_VARIANTS_PROMPT,
  [EMAIL_PROMPT_KEYS.SPAM_DETECTION]: SPAM_DETECTION_PROMPT,
  [EMAIL_PROMPT_KEYS.DELIVERABILITY]: DELIVERABILITY_OPTIMIZATION_PROMPT,
  [EMAIL_PROMPT_KEYS.TEMPLATE_VALIDATION]: TEMPLATE_VALIDATION_PROMPT,
  [EMAIL_PROMPT_KEYS.CAMPAIGN_TYPE]: CAMPAIGN_TYPE_EMAIL_PROMPT,
  [EMAIL_PROMPT_KEYS.PERSONALIZATION]: PERSONALIZATION_ENHANCEMENT_PROMPT,
  [EMAIL_PROMPT_KEYS.SEQUENCE_OPTIMIZATION]: SEQUENCE_OPTIMIZATION_PROMPT,
  [EMAIL_PROMPT_KEYS.COMPLIANCE_CHECK]: COMPLIANCE_CHECK_PROMPT,
  [EMAIL_PROMPT_KEYS.AB_TEST_VARIANTS]: AB_TEST_VARIANT_PROMPT,
};

// ==================== CORE LOADING FUNCTIONS ====================

/**
 * Load a single email prompt from the database with fallback
 * 
 * @param promptKey - The prompt key to load
 * @returns The prompt content
 */
export async function loadEmailPrompt(promptKey: EmailPromptKey): Promise<string> {
  try {
    // Try to load from database (uses Redis cache internally)
    const dbPrompt = await getPromptByKey(promptKey);
    
    if (dbPrompt) {
      console.log(`${LOG_PREFIX} Loaded ${promptKey} from database`);
      return dbPrompt;
    }
    
    // Fall back to hardcoded prompt
    console.log(`${LOG_PREFIX} Using fallback for ${promptKey} (not in database)`);
    return FALLBACK_PROMPTS[promptKey];
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading ${promptKey}, using fallback:`, error);
    return FALLBACK_PROMPTS[promptKey];
  }
}

/**
 * Load multiple email prompts at once
 * 
 * @param promptKeys - Array of prompt keys to load
 * @returns Map of prompt key to content
 */
export async function loadEmailPrompts(
  promptKeys: EmailPromptKey[]
): Promise<Map<EmailPromptKey, string>> {
  const results = new Map<EmailPromptKey, string>();
  
  // Load prompts in parallel for efficiency
  const loadPromises = promptKeys.map(async (key) => {
    const content = await loadEmailPrompt(key);
    return { key, content };
  });
  
  const loaded = await Promise.all(loadPromises);
  
  for (const { key, content } of loaded) {
    results.set(key, content);
  }
  
  return results;
}

// ==================== SPECIALIZED LOADERS ====================

/**
 * Load DeepSeek email generation system prompt with optional account context
 * 
 * @param accountContext - Optional account-specific context to append
 * @returns The complete system prompt
 */
export async function loadDeepSeekEmailSystemPrompt(accountContext?: string): Promise<string> {
  const basePrompt = await loadEmailPrompt(EMAIL_PROMPT_KEYS.GENERATION);
  
  if (accountContext) {
    return `${basePrompt}\n\n${accountContext}\n\nRespond ONLY with valid JSON.`;
  }
  
  return basePrompt;
}

/**
 * Load DeepSeek email improvement system prompt with optional account context
 */
export async function loadDeepSeekEmailImprovementPrompt(accountContext?: string): Promise<string> {
  const basePrompt = await loadEmailPrompt(EMAIL_PROMPT_KEYS.IMPROVEMENT);
  
  if (accountContext) {
    return `${basePrompt}\n\n${accountContext}\n\nAlways respond with valid JSON.`;
  }
  
  return basePrompt;
}

/**
 * Load OpenAI email analysis system prompt
 */
export async function loadOpenAIEmailAnalysisPrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.ANALYSIS);
}

/**
 * Load OpenAI email rewrite system prompt
 */
export async function loadOpenAIEmailRewritePrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.REWRITE);
}

/**
 * Load subject line variants generation prompt
 */
export async function loadSubjectVariantsPrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.SUBJECT_VARIANTS);
}

/**
 * Load spam detection analysis prompt
 */
export async function loadSpamDetectionPrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.SPAM_DETECTION);
}

/**
 * Load deliverability optimization prompt
 */
export async function loadDeliverabilityPrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.DELIVERABILITY);
}

/**
 * Load template validation prompt
 */
export async function loadTemplateValidationPrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.TEMPLATE_VALIDATION);
}

/**
 * Load campaign-type specific email prompt
 */
export async function loadCampaignTypePrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.CAMPAIGN_TYPE);
}

/**
 * Load personalization enhancement prompt
 */
export async function loadPersonalizationPrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.PERSONALIZATION);
}

/**
 * Load sequence optimization prompt
 */
export async function loadSequenceOptimizationPrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.SEQUENCE_OPTIMIZATION);
}

/**
 * Load compliance check prompt
 */
export async function loadComplianceCheckPrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.COMPLIANCE_CHECK);
}

/**
 * Load A/B test variant generation prompt
 */
export async function loadABTestVariantPrompt(): Promise<string> {
  return loadEmailPrompt(EMAIL_PROMPT_KEYS.AB_TEST_VARIANTS);
}

// ==================== COMPOSITE PROMPT BUILDERS ====================

/**
 * Build a complete email generation prompt with foundational context
 * 
 * @param options - Configuration for the prompt
 * @returns Complete system prompt for email generation
 */
export async function buildCompleteEmailGenerationPrompt(options: {
  includeFoundational?: boolean;
  accountContext?: string;
  campaignType?: string;
}): Promise<string> {
  const prompts: string[] = [];
  
  // Optionally include foundational prompt for full context
  if (options.includeFoundational) {
    const foundational = await loadEmailPrompt(EMAIL_PROMPT_KEYS.FOUNDATIONAL);
    prompts.push(foundational);
  }
  
  // Add generation-specific prompt
  const generation = await loadEmailPrompt(EMAIL_PROMPT_KEYS.GENERATION);
  prompts.push(generation);
  
  // Add campaign-type context if specified
  if (options.campaignType) {
    const campaignPrompt = await loadEmailPrompt(EMAIL_PROMPT_KEYS.CAMPAIGN_TYPE);
    prompts.push(`\n\nCAMPAIGN TYPE: ${options.campaignType}\n${campaignPrompt}`);
  }
  
  // Add account context if provided
  if (options.accountContext) {
    prompts.push(`\n\nACCOUNT CONTEXT:\n${options.accountContext}`);
  }
  
  return prompts.join('\n\n---\n\n');
}

/**
 * Build a complete email analysis prompt with all relevant checks
 */
export async function buildCompleteEmailAnalysisPrompt(options: {
  includeSpamCheck?: boolean;
  includeDeliverability?: boolean;
  includeCompliance?: boolean;
}): Promise<string> {
  const prompts: string[] = [];
  
  // Base analysis prompt
  const analysis = await loadEmailPrompt(EMAIL_PROMPT_KEYS.ANALYSIS);
  prompts.push(analysis);
  
  if (options.includeSpamCheck) {
    const spam = await loadEmailPrompt(EMAIL_PROMPT_KEYS.SPAM_DETECTION);
    prompts.push(`\n\nSPAM ANALYSIS:\n${spam}`);
  }
  
  if (options.includeDeliverability) {
    const deliverability = await loadEmailPrompt(EMAIL_PROMPT_KEYS.DELIVERABILITY);
    prompts.push(`\n\nDELIVERABILITY ANALYSIS:\n${deliverability}`);
  }
  
  if (options.includeCompliance) {
    const compliance = await loadEmailPrompt(EMAIL_PROMPT_KEYS.COMPLIANCE_CHECK);
    prompts.push(`\n\nCOMPLIANCE CHECK:\n${compliance}`);
  }
  
  return prompts.join('\n\n');
}

// ==================== VALIDATION ====================

/**
 * Verify all email prompts are loadable
 * Useful for startup health checks
 */
export async function validateEmailPrompts(): Promise<{
  success: boolean;
  loaded: string[];
  failed: string[];
}> {
  const loaded: string[] = [];
  const failed: string[] = [];
  
  for (const key of Object.values(EMAIL_PROMPT_KEYS)) {
    try {
      await loadEmailPrompt(key);
      loaded.push(key);
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to load ${key}:`, error);
      failed.push(key);
    }
  }
  
  return {
    success: failed.length === 0,
    loaded,
    failed,
  };
}
