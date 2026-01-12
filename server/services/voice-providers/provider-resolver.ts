/**
 * Voice Provider Resolver
 *
 * Resolves which voice provider to use based on configuration hierarchy:
 * 1. Per-call parameter (highest priority)
 * 2. Campaign setting
 * 3. Virtual Agent setting
 * 4. Organization default
 * 5. Environment variable
 * 6. System default (Google)
 */

import { db } from "../../db";
import { campaigns, virtualAgents } from "@shared/schema";
import { eq } from "drizzle-orm";
import { VoiceProviderType } from "./voice-provider.interface";

const LOG_PREFIX = "[ProviderResolver]";

// ==================== TYPES ====================

export type ProviderSource =
  | 'call'        // Per-call parameter
  | 'campaign'    // Campaign setting
  | 'agent'       // Virtual agent setting
  | 'org'         // Organization default
  | 'env'         // Environment variable
  | 'default';    // System default

export interface ProviderResolution {
  /**
   * Primary provider to use
   */
  primary: VoiceProviderType;

  /**
   * Fallback provider if primary fails (null = no fallback)
   */
  fallback: VoiceProviderType | null;

  /**
   * Source of the resolution (for debugging/logging)
   */
  source: ProviderSource;

  /**
   * Whether automatic fallback is enabled
   */
  fallbackEnabled: boolean;
}

export interface ResolverParams {
  /**
   * Provider specified at call initiation
   */
  callProvider?: string;

  /**
   * Campaign ID to check for provider setting
   */
  campaignId?: string;

  /**
   * Virtual Agent ID to check for provider setting
   */
  virtualAgentId?: string;

  /**
   * Organization ID to check for default provider
   */
  orgId?: string;
}

// ==================== CONFIGURATION ====================

/**
 * System default provider (Google is priority)
 */
const SYSTEM_DEFAULT_PROVIDER: VoiceProviderType = 'google';

/**
 * Default fallback provider
 */
const DEFAULT_FALLBACK_PROVIDER: VoiceProviderType = 'openai';

/**
 * Whether fallback is enabled by default
 */
const DEFAULT_FALLBACK_ENABLED = true;

// ==================== RESOLVER ====================

/**
 * Normalize provider string to VoiceProviderType
 */
function normalizeProvider(provider: string | null | undefined): VoiceProviderType | null {
  if (!provider) return null;

  const normalized = provider.toLowerCase().trim();

  // Map various provider strings to canonical types
  const providerMap: Record<string, VoiceProviderType> = {
    'google': 'google',
    'google_live': 'google',
    'gemini': 'google',
    'gemini_live': 'google',
    'vertex': 'google',
    'vertex_ai': 'google',

    'openai': 'openai',
    'openai_realtime': 'openai',
    'gpt4o': 'openai',
    'gpt-4o': 'openai',
  };

  return providerMap[normalized] || null;
}

/**
 * Get provider from environment variable
 */
function getEnvProvider(): VoiceProviderType | null {
  const envProvider = process.env.VOICE_PROVIDER;
  return normalizeProvider(envProvider);
}

/**
 * Get fallback provider from environment variable
 */
function getEnvFallbackProvider(): VoiceProviderType | null {
  const envFallback = process.env.VOICE_PROVIDER_FALLBACK_TARGET;
  return normalizeProvider(envFallback);
}

/**
 * Check if fallback is enabled via environment
 */
function isEnvFallbackEnabled(): boolean {
  const envFallback = process.env.VOICE_PROVIDER_FALLBACK;
  if (!envFallback) return DEFAULT_FALLBACK_ENABLED;
  return envFallback.toLowerCase() === 'true' || envFallback === '1';
}

/**
 * Get campaign provider setting from database
 */
async function getCampaignProvider(campaignId: string): Promise<{
  provider: VoiceProviderType | null;
  fallbackEnabled: boolean | null;
}> {
  try {
    const [campaign] = await db
      .select({
        voiceProvider: campaigns.voiceProvider,
        voiceProviderFallback: campaigns.voiceProviderFallback,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return { provider: null, fallbackEnabled: null };
    }

    return {
      provider: normalizeProvider(campaign.voiceProvider),
      fallbackEnabled: campaign.voiceProviderFallback ?? null,
    };
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to get campaign provider:`, error);
    return { provider: null, fallbackEnabled: null };
  }
}

/**
 * Get virtual agent provider setting from database
 */
async function getAgentProvider(virtualAgentId: string): Promise<VoiceProviderType | null> {
  try {
    const [agent] = await db
      .select({ provider: virtualAgents.provider })
      .from(virtualAgents)
      .where(eq(virtualAgents.id, virtualAgentId))
      .limit(1);

    if (!agent) return null;
    return normalizeProvider(agent.provider);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to get agent provider:`, error);
    return null;
  }
}

// Note: Organization-level provider settings not currently implemented
// Can be added when organizations/workspaces table is available

/**
 * Resolve voice provider based on configuration hierarchy
 *
 * Priority (highest to lowest):
 * 1. Per-call parameter
 * 2. Campaign setting
 * 3. Virtual Agent setting
 * 4. Organization default
 * 5. Environment variable
 * 6. System default (Google)
 */
export async function resolveVoiceProvider(params: ResolverParams): Promise<ProviderResolution> {
  let provider: VoiceProviderType | null = null;
  let source: ProviderSource = 'default';
  let fallbackEnabled: boolean | null = null;

  // 1. Check per-call parameter
  if (params.callProvider) {
    provider = normalizeProvider(params.callProvider);
    if (provider) {
      source = 'call';
      console.log(`${LOG_PREFIX} Using call-level provider: ${provider}`);
    }
  }

  // 2. Check campaign setting
  if (!provider && params.campaignId) {
    const campaignConfig = await getCampaignProvider(params.campaignId);
    if (campaignConfig.provider) {
      provider = campaignConfig.provider;
      source = 'campaign';
      fallbackEnabled = campaignConfig.fallbackEnabled;
      console.log(`${LOG_PREFIX} Using campaign provider: ${provider}`);
    }
  }

  // 3. Check virtual agent setting
  if (!provider && params.virtualAgentId) {
    const agentProvider = await getAgentProvider(params.virtualAgentId);
    if (agentProvider) {
      provider = agentProvider;
      source = 'agent';
      console.log(`${LOG_PREFIX} Using agent provider: ${provider}`);
    }
  }

  // 4. Organization default - not implemented (no organizations table)
  // Can be added later when organizations/workspaces are supported

  // 5. Check environment variable
  if (!provider) {
    const envProvider = getEnvProvider();
    if (envProvider) {
      provider = envProvider;
      source = 'env';
      console.log(`${LOG_PREFIX} Using env provider: ${provider}`);
    }
  }

  // 6. Fall back to system default
  if (!provider) {
    provider = SYSTEM_DEFAULT_PROVIDER;
    source = 'default';
    console.log(`${LOG_PREFIX} Using default provider: ${provider}`);
  }

  // Determine fallback settings
  const isFallbackEnabled = fallbackEnabled ?? isEnvFallbackEnabled();
  const fallbackProvider = isFallbackEnabled
    ? (getEnvFallbackProvider() ?? (provider === 'google' ? 'openai' : 'google'))
    : null;

  return {
    primary: provider,
    fallback: fallbackProvider,
    source,
    fallbackEnabled: isFallbackEnabled,
  };
}

/**
 * Quick resolution without database lookups (for performance-critical paths)
 */
export function resolveVoiceProviderSync(params: {
  callProvider?: string;
  envOverride?: boolean;
}): ProviderResolution {
  let provider: VoiceProviderType;
  let source: ProviderSource;

  // Check call parameter
  const callProvider = normalizeProvider(params.callProvider);
  if (callProvider) {
    provider = callProvider;
    source = 'call';
  }
  // Check environment
  else if (params.envOverride !== false) {
    const envProvider = getEnvProvider();
    if (envProvider) {
      provider = envProvider;
      source = 'env';
    } else {
      provider = SYSTEM_DEFAULT_PROVIDER;
      source = 'default';
    }
  }
  // Use default
  else {
    provider = SYSTEM_DEFAULT_PROVIDER;
    source = 'default';
  }

  const isFallbackEnabled = isEnvFallbackEnabled();
  const fallbackProvider = isFallbackEnabled
    ? (getEnvFallbackProvider() ?? (provider === 'google' ? 'openai' : 'google'))
    : null;

  return {
    primary: provider,
    fallback: fallbackProvider,
    source,
    fallbackEnabled: isFallbackEnabled,
  };
}

/**
 * Get the opposite provider (for fallback purposes)
 */
export function getOppositeProvider(provider: VoiceProviderType): VoiceProviderType {
  return provider === 'google' ? 'openai' : 'google';
}

/**
 * Check if a provider string is valid
 */
export function isValidProvider(provider: string): boolean {
  return normalizeProvider(provider) !== null;
}

export default {
  resolveVoiceProvider,
  resolveVoiceProviderSync,
  getOppositeProvider,
  isValidProvider,
};
