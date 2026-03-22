import { z } from "zod";

export const AI_GOVERNANCE_ENTITY_ID = "global";

export const aiGovernanceProviderSchema = z.enum([
  "google",
  "openai",
  "vertex",
  "claude",
  "deepseek",
]);

export type AiGovernanceProvider = z.infer;

export const aiGovernanceScopeSchema = z.enum([
  "voice_realtime",
  "analysis_standard",
  "analysis_deep",
  "content_generation",
  "general_reasoning",
]);

export type AiGovernanceScope = z.infer;

export const aiGovernancePolicySchema = z.object({
  enabled: z.boolean().default(true),
  primaryProvider: aiGovernanceProviderSchema,
  primaryModel: z.string().trim().min(1).max(200),
  allowFallback: z.boolean().default(false),
  fallbackProvider: aiGovernanceProviderSchema.nullable().default(null),
  fallbackModel: z.string().trim().max(200).nullable().default(null),
  notes: z.string().trim().max(500).nullable().default(null),
}).superRefine((value, ctx) => {
  if (value.allowFallback && (!value.fallbackProvider || !value.fallbackModel)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Fallback provider and model are required when fallback is enabled.",
      path: ["fallbackProvider"],
    });
  }

  if (!value.allowFallback && (value.fallbackProvider || value.fallbackModel)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Clear fallback provider and model or enable fallback.",
      path: ["allowFallback"],
    });
  }
});

export type AiGovernancePolicy = z.infer;

export const AI_GOVERNANCE_TASKS = [
  {
    key: "voice_realtime",
    label: "Voice Realtime",
    description: "Live outbound calling, realtime speech, and live voice agent sessions.",
    allowedProviders: ["google", "vertex", "openai"] as const,
  },
  {
    key: "analysis_standard",
    label: "Analysis Standard",
    description: "Structured JSON analysis, classification, extraction, and normal post-call analysis.",
    allowedProviders: ["vertex", "claude", "deepseek", "openai"] as const,
  },
  {
    key: "analysis_deep",
    label: "Analysis Deep",
    description: "Higher-reasoning analysis jobs where quality matters more than speed.",
    allowedProviders: ["vertex", "claude", "deepseek", "openai"] as const,
  },
  {
    key: "content_generation",
    label: "Content Generation",
    description: "Email, copy, templates, and other generative content workflows.",
    allowedProviders: ["vertex", "claude", "openai", "deepseek"] as const,
  },
  {
    key: "general_reasoning",
    label: "General Reasoning",
    description: "Generic AI helper jobs, orchestration tasks, and miscellaneous reasoning work.",
    allowedProviders: ["claude", "vertex", "openai", "deepseek"] as const,
  },
] as const satisfies ReadonlyArray;

export const AI_GOVERNANCE_TASK_MAP: Record = Object.fromEntries(
  AI_GOVERNANCE_TASKS.map((task) => [task.key, task]),
) as Record;

export const AI_PROVIDER_LABELS: Record = {
  google: "Google Gemini Live",
  openai: "OpenAI",
  vertex: "Vertex AI Gemini",
  claude: "Anthropic Claude",
  deepseek: "DeepSeek",
};

export const AI_MODEL_SUGGESTIONS: Record>
> = {
  voice_realtime: {
    google: [
      "gemini-live-2.5-flash-native-audio",
    ],
    vertex: [
      "gemini-2.0-flash-live-001",
      "gemini-live-2.5-flash-native-audio",
      "gemini-2.5-flash-preview-native-audio-dialog",
    ],
    openai: [
      "gpt-realtime",
      "gpt-4o-realtime-preview-2024-12-17",
    ],
  },
  analysis_standard: {
    vertex: [
      "gemini-2.0-flash",
      "gemini-2.5-flash",
    ],
    claude: [
      "claude-haiku-4-20250514",
      "claude-sonnet-4-20250514",
    ],
    deepseek: [
      "deepseek-chat",
      "deepseek-reasoner",
    ],
    openai: [
      "gpt-4o-mini",
      "gpt-4.1-mini",
    ],
  },
  analysis_deep: {
    vertex: [
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
    ],
    claude: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
    ],
    deepseek: [
      "deepseek-reasoner",
      "deepseek-chat",
    ],
    openai: [
      "gpt-4.1",
      "gpt-4o",
    ],
  },
  content_generation: {
    vertex: [
      "gemini-2.0-flash",
      "gemini-2.5-flash",
    ],
    claude: [
      "claude-sonnet-4-20250514",
      "claude-haiku-4-20250514",
    ],
    openai: [
      "gpt-4o-mini",
      "gpt-4.1-mini",
    ],
    deepseek: [
      "deepseek-chat",
    ],
  },
  general_reasoning: {
    claude: [
      "claude-3-5-sonnet-20241022",
      "claude-sonnet-4-20250514",
    ],
    vertex: [
      "gemini-2.0-flash",
      "gemini-3-pro-preview",
    ],
    openai: [
      "gpt-4o-mini",
      "gpt-4.1",
    ],
    deepseek: [
      "deepseek-chat",
      "deepseek-reasoner",
    ],
  },
};

export type AiModelPolicyMap = Record;

export const DEFAULT_AI_MODEL_POLICIES: AiModelPolicyMap = {
  voice_realtime: {
    enabled: true,
    primaryProvider: "vertex",
    primaryModel: "gemini-2.0-flash-live-001",
    allowFallback: true,
    fallbackProvider: "google",
    fallbackModel: "gemini-live-2.5-flash-native-audio",
    notes: "Primary live calling via Vertex AI Gemini native, with Google Gemini Live fallback.",
  },
  analysis_standard: {
    enabled: true,
    primaryProvider: "deepseek",
    primaryModel: "deepseek-chat",
    allowFallback: true,
    fallbackProvider: "vertex",
    fallbackModel: "gemini-2.0-flash",
    notes: "Cost-efficient structured analysis.",
  },
  analysis_deep: {
    enabled: true,
    primaryProvider: "vertex",
    primaryModel: "gemini-3-pro-preview",
    allowFallback: true,
    fallbackProvider: "claude",
    fallbackModel: "claude-sonnet-4-20250514",
    notes: "Higher-quality reasoning path.",
  },
  content_generation: {
    enabled: true,
    primaryProvider: "vertex",
    primaryModel: "gemini-2.0-flash",
    allowFallback: true,
    fallbackProvider: "openai",
    fallbackModel: "gpt-4o-mini",
    notes: "Default content and template generation path.",
  },
  general_reasoning: {
    enabled: true,
    primaryProvider: "claude",
    primaryModel: "claude-3-5-sonnet-20241022",
    allowFallback: true,
    fallbackProvider: "vertex",
    fallbackModel: "gemini-2.0-flash",
    notes: "General-purpose reasoning and orchestration.",
  },
};

export const aiGovernancePoliciesSchema: z.ZodType = z.object({
  voice_realtime: aiGovernancePolicySchema,
  analysis_standard: aiGovernancePolicySchema,
  analysis_deep: aiGovernancePolicySchema,
  content_generation: aiGovernancePolicySchema,
  general_reasoning: aiGovernancePolicySchema,
}).superRefine((policies, ctx) => {
  for (const [scopeKey, policy] of Object.entries(policies) as Array) {
    const task = AI_GOVERNANCE_TASK_MAP[scopeKey];
    if (!task.allowedProviders.includes(policy.primaryProvider)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${AI_PROVIDER_LABELS[policy.primaryProvider]} is not supported for ${task.label}.`,
        path: [scopeKey, "primaryProvider"],
      });
    }

    if (policy.allowFallback && policy.fallbackProvider && !task.allowedProviders.includes(policy.fallbackProvider)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${AI_PROVIDER_LABELS[policy.fallbackProvider]} is not supported for ${task.label}.`,
        path: [scopeKey, "fallbackProvider"],
      });
    }
  }
});

export const aiGovernanceUpdateSchema = z.object({
  policies: aiGovernancePoliciesSchema,
  changeSummary: z.string().trim().max(240).nullable().optional(),
});

export type AiGovernanceUpdateInput = z.infer;

export function cloneDefaultAiModelPolicies(): AiModelPolicyMap {
  return JSON.parse(JSON.stringify(DEFAULT_AI_MODEL_POLICIES)) as AiModelPolicyMap;
}

export function normalizeAiModelPolicies(input: unknown): AiModelPolicyMap {
  const base = cloneDefaultAiModelPolicies();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return base;
  }

  const merged: Record = { ...base };
  for (const scope of Object.keys(base) as AiGovernanceScope[]) {
    if (scope in (input as Record)) {
      merged[scope] = {
        ...base[scope],
        ...((input as Record)[scope] as Record),
      };
    }
  }

  const result = aiGovernancePoliciesSchema.safeParse(merged);
  if (!result.success) {
    console.error("[AiGovernance] Stored policies failed validation, using defaults:", result.error.issues);
    return base;
  }
  return result.data;
}