/**
 * Voice Provider Factory
 *
 * Factory for creating voice provider instances based on configuration.
 * Supports automatic fallback when primary provider fails.
 */

import {
  IVoiceProvider,
  VoiceProviderType,
  VoiceProviderConfig,
} from "./voice-provider.interface";
import { resolveVoiceProvider, resolveVoiceProviderSync, type ResolverParams, type ProviderResolution } from "./provider-resolver";
import { OpenAIRealtimeProvider } from "./openai-realtime-provider";
import { GeminiLiveProvider } from "./gemini-live-provider";
import { KimiVoiceProvider } from "./kimi-voice-provider";
import { FallbackHandler } from "./fallback-handler";

const LOG_PREFIX = "[VoiceProviderFactory]";

// ==================== FACTORY OPTIONS ====================

export interface FactoryOptions {
  /**
   * Enable automatic fallback to alternate provider
   */
  enableFallback?: boolean;

  /**
   * Custom fallback provider (overrides auto-detection)
   */
  fallbackProvider?: VoiceProviderType;

  /**
   * Callback when fallback is triggered
   */
  onFallback?: (reason: string, fromProvider: VoiceProviderType, toProvider: VoiceProviderType) => void;

  /**
   * Callback when provider health changes
   */
  onHealthChange?: (provider: VoiceProviderType, healthy: boolean) => void;
}

export interface CreateResult {
  /**
   * The voice provider instance (may be wrapped in fallback handler)
   */
  provider: IVoiceProvider;

  /**
   * Which provider was selected
   */
  selectedProvider: VoiceProviderType;

  /**
   * Resolution details
   */
  resolution: ProviderResolution;

  /**
   * Fallback handler (if fallback is enabled)
   */
  fallbackHandler?: FallbackHandler;
}

// ==================== FACTORY ====================

/**
 * Create a voice provider instance
 */
export function createProvider(providerType: VoiceProviderType): IVoiceProvider {
  switch (providerType) {
    case 'google':
      return new GeminiLiveProvider();
    case 'openai':
      return new OpenAIRealtimeProvider();
    case 'kimi':
      return new KimiVoiceProvider();
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}

/**
 * Create a voice provider based on resolved configuration
 */
export async function createProviderFromConfig(
  params: ResolverParams,
  options: FactoryOptions = {}
): Promise<CreateResult> {
  // Resolve which provider to use
  const resolution = await resolveVoiceProvider(params);
  console.log(`${LOG_PREFIX} Resolved provider: ${resolution.primary} (source: ${resolution.source})`);

  // Create primary provider
  const primaryProvider = createProvider(resolution.primary);

  // If fallback is disabled, return primary only
  const enableFallback = options.enableFallback ?? resolution.fallbackEnabled;
  if (!enableFallback || !resolution.fallback) {
    console.log(`${LOG_PREFIX} Fallback disabled, using ${resolution.primary} only`);
    return {
      provider: primaryProvider,
      selectedProvider: resolution.primary,
      resolution,
    };
  }

  // Create fallback provider
  const fallbackType = options.fallbackProvider ?? resolution.fallback;
  const fallbackProvider = createProvider(fallbackType);

  console.log(`${LOG_PREFIX} Fallback enabled: ${resolution.primary} -> ${fallbackType}`);

  // Create fallback handler
  const fallbackHandler = new FallbackHandler(primaryProvider, fallbackProvider, {
    onFallback: options.onFallback
      ? (reason) => options.onFallback!(reason, resolution.primary, fallbackType)
      : undefined,
    onHealthChange: options.onHealthChange,
  });

  return {
    provider: fallbackHandler,
    selectedProvider: resolution.primary,
    resolution,
    fallbackHandler,
  };
}

/**
 * Create a voice provider synchronously (without database lookups)
 * Use this when you already know the provider or for testing
 */
export function createProviderSync(
  params: { callProvider?: string; envOverride?: boolean },
  options: FactoryOptions = {}
): CreateResult {
  const resolution = resolveVoiceProviderSync(params);
  console.log(`${LOG_PREFIX} Resolved provider (sync): ${resolution.primary} (source: ${resolution.source})`);

  const primaryProvider = createProvider(resolution.primary);

  const enableFallback = options.enableFallback ?? resolution.fallbackEnabled;
  if (!enableFallback || !resolution.fallback) {
    return {
      provider: primaryProvider,
      selectedProvider: resolution.primary,
      resolution,
    };
  }

  const fallbackType = options.fallbackProvider ?? resolution.fallback;
  const fallbackProvider = createProvider(fallbackType);

  const fallbackHandler = new FallbackHandler(primaryProvider, fallbackProvider, {
    onFallback: options.onFallback
      ? (reason) => options.onFallback!(reason, resolution.primary, fallbackType)
      : undefined,
    onHealthChange: options.onHealthChange,
  });

  return {
    provider: fallbackHandler,
    selectedProvider: resolution.primary,
    resolution,
    fallbackHandler,
  };
}

/**
 * Create provider directly by type (no resolution)
 */
export function createProviderDirect(
  providerType: VoiceProviderType,
  options: FactoryOptions = {}
): CreateResult {
  const primaryProvider = createProvider(providerType);

  const resolution: ProviderResolution = {
    primary: providerType,
    fallback: options.fallbackProvider ?? (providerType === 'google' ? 'openai' : 'google'),
    source: 'call',
    fallbackEnabled: options.enableFallback ?? true,
  };

  if (!options.enableFallback || !resolution.fallback) {
    return {
      provider: primaryProvider,
      selectedProvider: providerType,
      resolution,
    };
  }

  const fallbackProvider = createProvider(resolution.fallback);

  const fallbackHandler = new FallbackHandler(primaryProvider, fallbackProvider, {
    onFallback: options.onFallback
      ? (reason) => options.onFallback!(reason, providerType, resolution.fallback!)
      : undefined,
    onHealthChange: options.onHealthChange,
  });

  return {
    provider: fallbackHandler,
    selectedProvider: providerType,
    resolution,
    fallbackHandler,
  };
}

// ==================== PROVIDER HEALTH CHECKS ====================

/**
 * Check if a provider is currently healthy/available
 */
export async function checkProviderHealth(providerType: VoiceProviderType): Promise<boolean> {
  try {
    const provider = createProvider(providerType);
    await provider.connect();
    await provider.disconnect();
    return true;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Provider ${providerType} health check failed:`, error);
    return false;
  }
}

/**
 * Get health status of all providers
 */
export async function checkAllProvidersHealth(): Promise<Record<VoiceProviderType, boolean>> {
  const [googleHealth, openaiHealth, kimiHealth] = await Promise.all([
    checkProviderHealth('google'),
    checkProviderHealth('openai'),
    checkProviderHealth('kimi'),
  ]);

  return {
    google: googleHealth,
    openai: openaiHealth,
    kimi: kimiHealth,
  };
}

// ==================== EXPORTS ====================

export const VoiceProviderFactory = {
  create: createProvider,
  createFromConfig: createProviderFromConfig,
  createSync: createProviderSync,
  createDirect: createProviderDirect,
  checkHealth: checkProviderHealth,
  checkAllHealth: checkAllProvidersHealth,
};

export default VoiceProviderFactory;
