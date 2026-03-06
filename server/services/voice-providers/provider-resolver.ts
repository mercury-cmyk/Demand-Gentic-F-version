/**
 * Voice Provider Resolver
 *
 * Resolves the active voice provider from the centralized AI governance policy.
 * This replaces the previous hard-enforced Gemini-only routing.
 */

import type { VoiceProviderType } from "./voice-provider.interface";
import {
  resolveVoiceGovernance,
  resolveVoiceGovernanceSync,
} from "../ai-model-governance";

const LOG_PREFIX = "[ProviderResolver]";

export type ProviderSource =
  | "governance"
  | "default"
  | "call";

export interface ProviderResolution {
  primary: VoiceProviderType;
  fallback: VoiceProviderType | null;
  source: ProviderSource;
  fallbackEnabled: boolean;
  model: string;
  fallbackModel: string | null;
  warnings?: string[];
}

export interface ResolverParams {
  callProvider?: string;
  campaignId?: string;
  virtualAgentId?: string;
  orgId?: string;
}

export async function resolveVoiceProvider(
  params: ResolverParams,
): Promise<ProviderResolution> {
  const governance = await resolveVoiceGovernance(params.callProvider);

  if (params.campaignId) {
    console.log(
      `${LOG_PREFIX} Campaign ${params.campaignId} using ${governance.selectedProvider}/${governance.selectedModel}`,
    );
  }
  if (params.virtualAgentId) {
    console.log(
      `${LOG_PREFIX} Virtual Agent ${params.virtualAgentId} using ${governance.selectedProvider}/${governance.selectedModel}`,
    );
  }
  for (const warning of governance.warnings) {
    console.warn(`${LOG_PREFIX} ${warning}`);
  }

  return {
    primary: governance.selectedProvider,
    fallback: governance.fallbackEnabled ? governance.fallbackProvider : null,
    source: governance.source,
    fallbackEnabled: governance.fallbackEnabled,
    model: governance.selectedModel,
    fallbackModel: governance.fallbackEnabled ? governance.fallbackModel : null,
    warnings: governance.warnings,
  };
}

export function resolveVoiceProviderSync(
  params: {
    callProvider?: string;
    envOverride?: boolean;
  } = {},
): ProviderResolution {
  const governance = resolveVoiceGovernanceSync(params.callProvider);

  return {
    primary: governance.selectedProvider,
    fallback: governance.fallbackEnabled ? governance.fallbackProvider : null,
    source: governance.source,
    fallbackEnabled: governance.fallbackEnabled,
    model: governance.selectedModel,
    fallbackModel: governance.fallbackEnabled ? governance.fallbackModel : null,
    warnings: governance.warnings,
  };
}

export function getEnforcedProvider(): VoiceProviderType {
  return resolveVoiceGovernanceSync().selectedProvider;
}

export function isEnforcedProvider(provider: string): boolean {
  const normalized = provider.toLowerCase().trim();
  return ["google", "gemini", "gemini_live", "openai"].includes(normalized);
}

export function getOppositeProvider(provider: VoiceProviderType): VoiceProviderType {
  return provider === "google" ? "openai" : "google";
}

export function isValidProvider(provider: string): boolean {
  return isEnforcedProvider(provider);
}

export default {
  resolveVoiceProvider,
  resolveVoiceProviderSync,
  getEnforcedProvider,
  isEnforcedProvider,
  getOppositeProvider,
  isValidProvider,
};
