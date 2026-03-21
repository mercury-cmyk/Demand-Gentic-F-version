/**
 * Prompt Validator Service
 *
 * Validates and optimizes system prompts using OpenAI before use in voice agents.
 * Ensures prompts follow best practices for OpenAI Realtime API.
 */

import OpenAI from "openai";

const LOG_PREFIX = "[PromptValidator]";

// Provider chain: DeepSeek (primary) → Kimi (fallback) → OpenAI (last resort)
let _aiClient: OpenAI | null = null;
let _aiModel: string = "deepseek-chat";

function getOpenAIClient(): OpenAI {
  if (!_aiClient) {
    // DeepSeek primary
    if (process.env.DEEPSEEK_API_KEY) {
      _aiClient = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      });
      _aiModel = "deepseek-chat";
    }
    // Kimi fallback
    else if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) {
      _aiClient = new OpenAI({
        apiKey: (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY)!,
        baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1",
      });
      _aiModel = process.env.KIMI_STANDARD_MODEL || "moonshot-v1-32k";
    }
    // OpenAI last resort
    else {
      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("No AI API key configured. Set DEEPSEEK_API_KEY, KIMI_API_KEY, or OPENAI_API_KEY.");
      }
      _aiClient = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
        apiKey,
      });
      _aiModel = "gpt-4o-mini";
    }
  }
  return _aiClient;
}

export interface PromptValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  optimizedPrompt?: string;
  score: number; // 0-100
}

/**
 * Validates a system prompt for use with OpenAI Realtime voice agents
 */
export async function validateVoiceAgentPrompt(
  prompt: string,
  options: {
    strictMode?: boolean;
    autoOptimize?: boolean;
  } = {}
): Promise<PromptValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // Basic structural validation
  if (!prompt || prompt.trim().length < 100) {
    errors.push("Prompt is too short. Voice agent prompts should be comprehensive.");
    score -= 30;
  }

  if (prompt.length > 32000) {
    errors.push("Prompt exceeds 32,000 characters. OpenAI Realtime has token limits.");
    score -= 20;
  }

  // Check for required sections
  const requiredPatterns = [
    { pattern: /identity|speaking with|confirm/i, name: "Identity confirmation logic", weight: 15 },
    { pattern: /state|STATE_|forward.only/i, name: "Conversation state management", weight: 10 },
    { pattern: /voicemail|answering machine/i, name: "Voicemail detection", weight: 5 },
    { pattern: /do not call|dnc|remove/i, name: "DNC handling", weight: 10 },
    { pattern: /disposition|submit_disposition/i, name: "Disposition submission", weight: 10 },
  ];

  for (const { pattern, name, weight } of requiredPatterns) {
    if (!pattern.test(prompt)) {
      warnings.push(`Missing or weak: ${name}`);
      score -= weight;
    }
  }

  // Check for common anti-patterns
  const antiPatterns = [
    { pattern: /you are an AI assistant/i, name: "Generic AI assistant language", weight: 5 },
    { pattern: /\{?\{?undefined\}?\}?/i, name: "Unresolved template variables", weight: 15 },
    { pattern: /TODO|FIXME|XXX/i, name: "Development markers left in prompt", weight: 10 },
  ];

  for (const { pattern, name, weight } of antiPatterns) {
    if (pattern.test(prompt)) {
      warnings.push(`Found anti-pattern: ${name}`);
      score -= weight;
    }
  }

  // Check for template variable usage
  const templateVars = prompt.match(/\{\{[^}]+\}\}/g) || [];
  const validVars = [
    "contact.fullName", "contact.full_name", "contact.firstName", "contact.first_name",
    "contact.jobTitle", "contact.job_title", "contact.email",
    "account.name", "org.name", "agent_name", "agent.name",
    "system.caller_id", "system.called_number", "system.time_utc"
  ];

  for (const v of templateVars) {
    const varName = v.replace(/\{\{|\}\}/g, "").trim();
    if (!validVars.some(valid => varName.includes(valid.replace(/[._]/g, "")) || valid.includes(varName.replace(/[._]/g, "")))) {
      warnings.push(`Unknown template variable: ${v}`);
      score -= 3;
    }
  }

  // Check for identity lock pattern (critical for preventing loops)
  if (!/identity.*(lock|LOCK|immutable|persist)/i.test(prompt)) {
    suggestions.push("Consider adding Identity Lock rule to prevent re-asking identity after confirmation");
    score -= 5;
  }

  // Check for state progression rule
  if (!/forward.only|never return to.*previous state/i.test(prompt)) {
    suggestions.push("Consider adding State Progression Rule to prevent backward state jumps");
    score -= 5;
  }

  // Validate with OpenAI if autoOptimize is enabled
  let optimizedPrompt: string | undefined;
  if (options.autoOptimize && errors.length === 0) {
    try {
      optimizedPrompt = await optimizePromptWithOpenAI(prompt);
    } catch (error) {
      console.warn(`${LOG_PREFIX} OpenAI optimization failed:`, error);
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    valid: errors.length === 0 && score >= 50,
    errors,
    warnings,
    suggestions,
    optimizedPrompt,
    score,
  };
}

/**
 * Uses OpenAI to validate and optimize a voice agent prompt
 */
async function optimizePromptWithOpenAI(prompt: string): Promise<string> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: _aiModel,
    messages: [
      {
        role: "system",
        content: `You are an expert at optimizing system prompts for OpenAI Realtime voice agents.

Your task is to review and optimize the provided voice agent system prompt.

Rules:
1. Preserve the original intent and structure
2. Ensure clarity and consistency
3. Add any missing critical sections (identity lock, state progression, voicemail detection)
4. Remove redundancy
5. Ensure template variables use consistent naming ({{contact.fullName}}, {{account.name}}, etc.)
6. Do NOT add any new features or behaviors not implied by the original

Return ONLY the optimized prompt, no explanations.`
      },
      {
        role: "user",
        content: `Please optimize this voice agent system prompt:\n\n${prompt}`
      }
    ],
    temperature: 0.3,
    max_tokens: 8000,
  });

  return response.choices[0]?.message?.content || prompt;
}

/**
 * Quick validation for runtime use (no OpenAI calls)
 */
export function quickValidatePrompt(prompt: string): { valid: boolean; reason?: string } {
  if (!prompt || prompt.trim().length < 50) {
    return { valid: false, reason: "Prompt too short" };
  }

  if (prompt.length > 50000) {
    return { valid: false, reason: "Prompt too long" };
  }

  // Check for unresolved template variables that might cause issues
  const unresolvedVars = prompt.match(/\{\{[^}]*undefined[^}]*\}\}|\{\{\s*\}\}/g);
  if (unresolvedVars) {
    return { valid: false, reason: `Unresolved variables: ${unresolvedVars.join(", ")}` };
  }

  return { valid: true };
}

/**
 * Generates a validated system prompt from user inputs
 * Uses OpenAI to synthesize a well-structured prompt from component inputs
 */
export async function generateValidatedPrompt(inputs: {
  agentGoal: string;
  targetAudience: string;
  openingMessage?: string;
  keyQuestions?: string[];
  objectionHandling?: Record<string, string>;
  companyContext?: string;
}): Promise<{ prompt: string; validation: PromptValidationResult }> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: _aiModel,
    messages: [
      {
        role: "system",
        content: `You are an expert at creating system prompts for OpenAI Realtime voice agents.

Generate a complete, production-ready system prompt based on the user's inputs.

The prompt MUST include:
1. Clear agent goal and mission
2. Required variables section with preflight validation
3. Conversation state machine (forward-only states)
4. Opening message with identity check
5. Identity confirmation hard gate
6. Identity lock rule (once confirmed, never re-ask)
7. State progression rule (never regress to earlier states)
8. Context setting protocol
9. Discovery questions
10. Listening and response guidelines
11. Permission request protocol
12. Clean close
13. Absolute prohibitions

Use template variables: {{contact.fullName}}, {{contact.jobTitle}}, {{account.name}}, {{contact.email}}

Return ONLY the complete system prompt.`
      },
      {
        role: "user",
        content: JSON.stringify(inputs, null, 2)
      }
    ],
    temperature: 0.5,
    max_tokens: 8000,
  });

  const generatedPrompt = response.choices[0]?.message?.content || "";
  const validation = await validateVoiceAgentPrompt(generatedPrompt);

  return {
    prompt: generatedPrompt,
    validation,
  };
}
