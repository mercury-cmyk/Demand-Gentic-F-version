import { desc } from "drizzle-orm";

import {
  AI_GOVERNANCE_TASKS,
  AI_GOVERNANCE_TASK_MAP,
  AI_MODEL_SUGGESTIONS,
  AI_PROVIDER_LABELS,
  cloneDefaultAiModelPolicies,
  normalizeAiModelPolicies,
  type AiGovernancePolicy,
  type AiGovernanceProvider,
  type AiGovernanceScope,
  type AiModelPolicyMap,
} from "@shared/ai-governance";
import { aiModelGovernance } from "@shared/schema";

import { db } from "../db";
import type { VoiceProviderType } from "./voice-providers/voice-provider.interface";

const CACHE_TTL_MS = 30_000;

export interface AiGovernanceSnapshot {
  id: string | null;
  version: number;
  policies: AiModelPolicyMap;
  updatedAt: string | null;
  updatedBy: string | null;
  isSystemDefault: boolean;
}

export interface ProviderAvailability {
  available: boolean;
  reason: string | null;
}

export interface ScopeHealth {
  primaryAvailable: boolean;
  fallbackAvailable: boolean | null;
  warnings: string[];
}

export interface VoiceGovernanceResolution {
  selectedProvider: VoiceProviderType;
  selectedModel: string;
  configuredProvider: VoiceProviderType;
  configuredModel: string;
  fallbackProvider: VoiceProviderType | null;
  fallbackModel: string | null;
  fallbackEnabled: boolean;
  warnings: string[];
  source: "governance" | "default";
}

export interface AnalysisGovernanceResolution {
  scope: AiGovernanceScope;
  primaryProvider: "vertex" | "claude" | "deepseek" | "openai";
  primaryModel: string;
  fallbackProvider: "vertex" | "claude" | "deepseek" | "openai" | null;
  fallbackModel: string | null;
  warnings: string[];
  source: "governance" | "default";
}

let governanceCache:
  | {
      expiresAt: number;
      snapshot: AiGovernanceSnapshot;
    }
  | null = null;

function mapToVoiceProvider(provider: AiGovernanceProvider): VoiceProviderType {
  if (provider === "openai") return "openai";
  if ((provider as string) === "kimi" || (provider as string) === "moonshot") return "kimi";
  return "google";
}

function mapToAnalysisProvider(
  provider: AiGovernanceProvider,
): "vertex" | "claude" | "deepseek" | "openai" {
  switch (provider) {
    case "vertex":
      return "vertex";
    case "claude":
      return "claude";
    case "deepseek":
      return "deepseek";
    case "openai":
      return "openai";
    default:
      return "vertex";
  }
}

function buildDefaultSnapshot(): AiGovernanceSnapshot {
  return {
    id: null,
    version: 1,
    policies: cloneDefaultAiModelPolicies(),
    updatedAt: null,
    updatedBy: null,
    isSystemDefault: true,
  };
}

export function clearAiModelGovernanceCache(): void {
  governanceCache = null;
}

export function getCachedAiModelGovernanceSnapshot(): AiGovernanceSnapshot | null {
  return governanceCache?.snapshot ?? null;
}

export async function getAiModelGovernanceSnapshot(
  forceRefresh = false,
): Promise<AiGovernanceSnapshot> {
  const now = Date.now();
  if (!forceRefresh && governanceCache && governanceCache.expiresAt > now) {
    return governanceCache.snapshot;
  }

  const [record] = await db
    .select()
    .from(aiModelGovernance)
    .orderBy(desc(aiModelGovernance.updatedAt))
    .limit(1);

  const snapshot = record
    ? {
        id: record.id,
        version: record.version,
        policies: normalizeAiModelPolicies(record.policies),
        updatedAt: record.updatedAt?.toISOString() ?? null,
        updatedBy: record.updatedBy ?? null,
        isSystemDefault: false,
      }
    : buildDefaultSnapshot();

  governanceCache = {
    expiresAt: now + CACHE_TTL_MS,
    snapshot,
  };

  return snapshot;
}

export function getProviderAvailability(provider: AiGovernanceProvider): ProviderAvailability {
  switch (provider) {
    case "google": {
      const hasProjectId = !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID);
      const hasApiKey = !!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);
      return hasProjectId || hasApiKey
        ? { available: true, reason: null }
        : {
            available: false,
            reason: "Missing Google credentials. Configure Vertex project access or a Gemini API key.",
          };
    }
    case "openai":
      return !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY)
        ? { available: true, reason: null }
        : {
            available: false,
            reason: "Missing OpenAI API key.",
          };
    case "vertex":
      return !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID)
        ? { available: true, reason: null }
        : {
            available: false,
            reason: "Missing Google Cloud project configuration for Vertex AI.",
          };
    case "claude":
      return !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY)
        ? { available: true, reason: null }
        : {
            available: false,
            reason: "Missing Anthropic API key.",
          };
    case "deepseek":
      return !!process.env.DEEPSEEK_API_KEY
        ? { available: true, reason: null }
        : {
            available: false,
            reason: "Missing DeepSeek API key.",
          };
    default: {
      // Support Kimi/Moonshot and any future providers
      const providerStr = provider as string;
      if (providerStr === "kimi" || providerStr === "moonshot") {
        return !!(process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY)
          ? { available: true, reason: null }
          : {
              available: false,
              reason: "Missing Kimi/Moonshot API key (KIMI_API_KEY).",
            };
      }
      return { available: false, reason: `Unknown provider: ${providerStr}` };
    }
  }
}

function buildScopeWarnings(scope: AiGovernanceScope, policy: AiGovernancePolicy): string[] {
  const warnings: string[] = [];
  if (!policy.enabled) {
    warnings.push(`${AI_GOVERNANCE_TASK_MAP[scope].label} governance is disabled. Runtime will fall back to default behavior.`);
  }
  const primaryAvailability = getProviderAvailability(policy.primaryProvider);
  if (!primaryAvailability.available && primaryAvailability.reason) {
    warnings.push(`Primary provider unavailable: ${primaryAvailability.reason}`);
  }

  if (policy.primaryProvider === "google" && policy.primaryModel.includes("native-audio")) {
    const hasProjectId = !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID);
    if (!hasProjectId) {
      warnings.push("Native-audio Gemini voice models need Vertex AI project credentials for production use.");
    }
  }

  if (policy.allowFallback && policy.fallbackProvider) {
    const fallbackAvailability = getProviderAvailability(policy.fallbackProvider);
    if (!fallbackAvailability.available && fallbackAvailability.reason) {
      warnings.push(`Fallback provider unavailable: ${fallbackAvailability.reason}`);
    }
  }

  if (scope === "voice_realtime" && policy.allowFallback && policy.fallbackProvider === "openai") {
    warnings.push("OpenAI realtime fallback can change call behavior and cost profile. Validate in staging before production rollout.");
  }

  return warnings;
}

export async function getAiModelGovernanceHealth(
  snapshot?: AiGovernanceSnapshot,
): Promise<{
  providers: Record<AiGovernanceProvider, ProviderAvailability>;
  scopes: Record<AiGovernanceScope, ScopeHealth>;
}> {
  const resolvedSnapshot = snapshot ?? (await getAiModelGovernanceSnapshot());
  const providers: Record<AiGovernanceProvider, ProviderAvailability> = {
    google: getProviderAvailability("google"),
    openai: getProviderAvailability("openai"),
    vertex: getProviderAvailability("vertex"),
    claude: getProviderAvailability("claude"),
    deepseek: getProviderAvailability("deepseek"),
  };

  const scopes = Object.fromEntries(
    AI_GOVERNANCE_TASKS.map((task) => {
      const policy = resolvedSnapshot.policies[task.key];
      const primaryAvailable = providers[policy.primaryProvider].available;
      const fallbackAvailable = policy.allowFallback && policy.fallbackProvider
        ? providers[policy.fallbackProvider].available
        : null;

      return [
        task.key,
        {
          primaryAvailable,
          fallbackAvailable,
          warnings: buildScopeWarnings(task.key, policy),
        } satisfies ScopeHealth,
      ];
    }),
  ) as Record<AiGovernanceScope, ScopeHealth>;

  return { providers, scopes };
}

function resolveOperationalVoicePolicy(
  policy: AiGovernancePolicy,
  source: "governance" | "default",
  requestedProvider?: string | null,
): VoiceGovernanceResolution {
  const effectivePolicy = policy.enabled
    ? policy
    : cloneDefaultAiModelPolicies().voice_realtime;
  const warnings = buildScopeWarnings("voice_realtime", policy);
  const primaryAvailability = getProviderAvailability(effectivePolicy.primaryProvider);
  const fallbackAvailability =
    effectivePolicy.allowFallback && effectivePolicy.fallbackProvider
      ? getProviderAvailability(effectivePolicy.fallbackProvider)
      : null;

  let selectedProvider = mapToVoiceProvider(effectivePolicy.primaryProvider);
  let selectedModel = effectivePolicy.primaryModel;

  if (!primaryAvailability.available && effectivePolicy.allowFallback && effectivePolicy.fallbackProvider && fallbackAvailability?.available) {
    selectedProvider = mapToVoiceProvider(effectivePolicy.fallbackProvider);
    selectedModel = effectivePolicy.fallbackModel || selectedModel;
    warnings.push(
      `Primary provider ${AI_PROVIDER_LABELS[effectivePolicy.primaryProvider]} is unavailable. Falling back to ${AI_PROVIDER_LABELS[effectivePolicy.fallbackProvider]}.`,
    );
  }

  if (requestedProvider) {
    const normalized = requestedProvider.trim().toLowerCase();
    const governed = mapToVoiceProvider(effectivePolicy.primaryProvider);
    if (normalized && normalized !== governed && normalized !== effectivePolicy.primaryProvider) {
      warnings.push(
        `Requested voice provider "${requestedProvider}" was ignored. Governance is enforcing ${AI_PROVIDER_LABELS[effectivePolicy.primaryProvider]}.`,
      );
    }
  }

  return {
    selectedProvider,
    selectedModel,
    configuredProvider: mapToVoiceProvider(effectivePolicy.primaryProvider),
    configuredModel: effectivePolicy.primaryModel,
    fallbackProvider: effectivePolicy.allowFallback && effectivePolicy.fallbackProvider
      ? mapToVoiceProvider(effectivePolicy.fallbackProvider)
      : null,
    fallbackModel: effectivePolicy.allowFallback ? effectivePolicy.fallbackModel : null,
    fallbackEnabled: effectivePolicy.allowFallback,
    warnings,
    source: policy.enabled ? source : "default",
  };
}

export async function resolveVoiceGovernance(
  requestedProvider?: string | null,
): Promise<VoiceGovernanceResolution> {
  const snapshot = await getAiModelGovernanceSnapshot();
  return resolveOperationalVoicePolicy(
    snapshot.policies.voice_realtime,
    snapshot.isSystemDefault ? "default" : "governance",
    requestedProvider,
  );
}

export function resolveVoiceGovernanceSync(
  requestedProvider?: string | null,
): VoiceGovernanceResolution {
  const snapshot = governanceCache?.snapshot ?? buildDefaultSnapshot();
  return resolveOperationalVoicePolicy(
    snapshot.policies.voice_realtime,
    snapshot.isSystemDefault ? "default" : "governance",
    requestedProvider,
  );
}

export async function getVoiceModelForProvider(
  provider: VoiceProviderType,
): Promise<string> {
  const snapshot = await getAiModelGovernanceSnapshot();
  const policy = snapshot.policies.voice_realtime.enabled
    ? snapshot.policies.voice_realtime
    : cloneDefaultAiModelPolicies().voice_realtime;

  if (mapToVoiceProvider(policy.primaryProvider) === provider) {
    return policy.primaryModel;
  }

  if (policy.allowFallback && policy.fallbackProvider && mapToVoiceProvider(policy.fallbackProvider) === provider && policy.fallbackModel) {
    return policy.fallbackModel;
  }

  const defaults = cloneDefaultAiModelPolicies().voice_realtime;
  if (provider === mapToVoiceProvider(defaults.primaryProvider)) {
    return defaults.primaryModel;
  }

  return "gpt-realtime";
}

export async function resolveAnalysisGovernance(
  options: { deep?: boolean } = {},
): Promise<AnalysisGovernanceResolution> {
  const snapshot = await getAiModelGovernanceSnapshot();
  const scope: AiGovernanceScope = options.deep ? "analysis_deep" : "analysis_standard";
  const configuredPolicy = snapshot.policies[scope];
  const policy = configuredPolicy.enabled
    ? configuredPolicy
    : cloneDefaultAiModelPolicies()[scope];
  const warnings = buildScopeWarnings(scope, configuredPolicy);
  const primaryAvailability = getProviderAvailability(policy.primaryProvider);
  const fallbackAvailability =
    policy.allowFallback && policy.fallbackProvider
      ? getProviderAvailability(policy.fallbackProvider)
      : null;

  let primaryProvider = mapToAnalysisProvider(policy.primaryProvider);
  let primaryModel = policy.primaryModel;
  let fallbackProvider =
    policy.allowFallback && policy.fallbackProvider
      ? mapToAnalysisProvider(policy.fallbackProvider)
      : null;
  let fallbackModel = policy.allowFallback ? policy.fallbackModel : null;

  if (!primaryAvailability.available && fallbackAvailability?.available && fallbackProvider && fallbackModel) {
    primaryProvider = fallbackProvider;
    primaryModel = fallbackModel;
    fallbackProvider = null;
    fallbackModel = null;
    warnings.push(
      `Primary provider ${AI_PROVIDER_LABELS[policy.primaryProvider]} is unavailable. Using fallback provider ${AI_PROVIDER_LABELS[policy.fallbackProvider!]}.`,
    );
  }

  return {
    scope,
    primaryProvider,
    primaryModel,
    fallbackProvider,
    fallbackModel,
    warnings,
    source: snapshot.isSystemDefault || !configuredPolicy.enabled ? "default" : "governance",
  };
}

export async function getAiGovernanceUiPayload() {
  const snapshot = await getAiModelGovernanceSnapshot();
  const health = await getAiModelGovernanceHealth(snapshot);

  return {
    config: snapshot,
    catalog: {
      tasks: AI_GOVERNANCE_TASKS,
      providerLabels: AI_PROVIDER_LABELS,
      modelSuggestions: AI_MODEL_SUGGESTIONS,
      taskMap: AI_GOVERNANCE_TASK_MAP,
    },
    health,
  };
}
