/**
 * Voice Provider Resolver - GEMINI LIVE EXCLUSIVE
 *
 * ALL voice calls are routed exclusively through Google Gemini Live.
 * OpenAI Realtime is completely disabled.
 *
 * This is a deliberate architectural decision:
 * - Gemini Live provides superior cost-effectiveness
 * - Single provider ensures consistent behavior
 * - Simplified debugging and monitoring
 * - Native audio support with high-quality voices
 */

import { VoiceProviderType } from "./voice-provider.interface";

const LOG_PREFIX = "[ProviderResolver]";

// ==================== TYPES ====================

export type ProviderSource =
  | 'enforced'    // System-enforced (Gemini only)
  | 'default';    // System default

export interface ProviderResolution {
  /**
   * Primary provider to use - ALWAYS Google Gemini Live
   */
  primary: VoiceProviderType;

  /**
   * Fallback provider - ALWAYS null (no fallback)
   */
  fallback: null;

  /**
   * Source of the resolution
   */
  source: ProviderSource;

  /**
   * Whether automatic fallback is enabled - ALWAYS false
   */
  fallbackEnabled: false;
}

export interface ResolverParams {
  /**
   * Provider specified at call initiation (ignored - Gemini enforced)
   */
  callProvider?: string;

  /**
   * Campaign ID (logged for tracing but doesn't affect provider)
   */
  campaignId?: string;

  /**
   * Virtual Agent ID (logged for tracing but doesn't affect provider)
   */
  virtualAgentId?: string;

  /**
   * Organization ID (logged for tracing but doesn't affect provider)
   */
  orgId?: string;
}

// ==================== CONFIGURATION ====================

/**
 * ENFORCED PROVIDER: Google Gemini Live
 * This is the ONLY voice provider. OpenAI Realtime is completely disabled.
 */
const ENFORCED_PROVIDER: VoiceProviderType = 'google';

/**
 * Fallback is PERMANENTLY DISABLED
 * All calls must use Gemini Live - no exceptions
 */
const FALLBACK_ENABLED = false;

// ==================== RESOLVER ====================

/**
 * Resolve voice provider - ALWAYS returns Google Gemini Live
 *
 * This function enforces Gemini-only routing. All parameters are logged
 * for tracing purposes but do not affect the provider selection.
 *
 * @param params - Resolution parameters (logged but ignored)
 * @returns Provider resolution - always Gemini with no fallback
 */
export async function resolveVoiceProvider(params: ResolverParams): Promise<ProviderResolution> {
  // Log any attempted provider overrides for debugging
  if (params.callProvider && params.callProvider.toLowerCase() !== 'google' && params.callProvider.toLowerCase() !== 'gemini') {
    console.warn(`${LOG_PREFIX} ⚠️ Provider override "${params.callProvider}" ignored - Gemini Live is enforced`);
  }

  // Log campaign/agent context for tracing
  if (params.campaignId) {
    console.log(`${LOG_PREFIX} Campaign ${params.campaignId} - using enforced Gemini Live provider`);
  }
  if (params.virtualAgentId) {
    console.log(`${LOG_PREFIX} Virtual Agent ${params.virtualAgentId} - using enforced Gemini Live provider`);
  }

  console.log(`${LOG_PREFIX} ✅ Voice provider resolved: Google Gemini Live (enforced)`);

  return {
    primary: ENFORCED_PROVIDER,
    fallback: null,
    source: 'enforced',
    fallbackEnabled: false,
  };
}

/**
 * Quick synchronous resolution - ALWAYS returns Google Gemini Live
 *
 * @param params - Resolution parameters (ignored)
 * @returns Provider resolution - always Gemini with no fallback
 */
export function resolveVoiceProviderSync(params: {
  callProvider?: string;
  envOverride?: boolean;
} = {}): ProviderResolution {
  // Log any attempted provider overrides for debugging
  if (params.callProvider && params.callProvider.toLowerCase() !== 'google' && params.callProvider.toLowerCase() !== 'gemini') {
    console.warn(`${LOG_PREFIX} ⚠️ Provider override "${params.callProvider}" ignored - Gemini Live is enforced`);
  }

  return {
    primary: ENFORCED_PROVIDER,
    fallback: null,
    source: 'enforced',
    fallbackEnabled: false,
  };
}

/**
 * Get the enforced provider type
 * @returns Always 'google' (Gemini Live)
 */
export function getEnforcedProvider(): VoiceProviderType {
  return ENFORCED_PROVIDER;
}

/**
 * Check if a provider string matches the enforced provider
 * @param provider - Provider string to check
 * @returns true if it matches 'google' or 'gemini' variants
 */
export function isEnforcedProvider(provider: string): boolean {
  const normalized = provider.toLowerCase().trim();
  return ['google', 'gemini', 'gemini_live', 'google_live', 'vertex', 'vertex_ai'].includes(normalized);
}

/**
 * @deprecated OpenAI is no longer supported - this always returns 'google'
 */
export function getOppositeProvider(_provider: VoiceProviderType): VoiceProviderType {
  console.warn(`${LOG_PREFIX} getOppositeProvider() is deprecated - OpenAI is no longer supported`);
  return 'google';
}

/**
 * Check if a provider string is valid (only Gemini variants are valid)
 */
export function isValidProvider(provider: string): boolean {
  return isEnforcedProvider(provider);
}

export default {
  resolveVoiceProvider,
  resolveVoiceProviderSync,
  getEnforcedProvider,
  isEnforcedProvider,
  getOppositeProvider, // Deprecated but kept for backward compatibility
  isValidProvider,
};
