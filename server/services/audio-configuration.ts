/**
 * Unified Audio Configuration Service
 * 
 * Ensures consistent audio quality settings across all call types:
 * - AI Test Calls (preview studio, manual tests)
 * - AI Agent Test Calls (campaign testing)
 * - Real AI Agent Campaigns (production)
 * - Real Campaigns with Deployed AI Agents
 * 
 * Changes to test endpoints automatically apply to production calls.
 * Single source of truth for audio configuration.
 */

import { env } from "../env";

// ==================== AUDIO FORMAT TYPES ====================

export type G711Format = 'ulaw' | 'alaw';
export type AudioFormat = 'g711_ulaw' | 'g711_alaw' | 'pcm_8k' | 'pcm_16k' | 'pcm_24k';
export type VoiceProvider = 'google' | 'openai';

// ==================== UNIFIED AUDIO CONFIG ====================

/**
 * Master audio configuration applied to ALL call types
 * 
 * This is the single source of truth for audio settings.
 * All code paths (test/production, test/real) reference these settings.
 */
export const UNIFIED_AUDIO_CONFIG = {
  // Default format for all Telnyx calls (PSTN standard)
  // G.711 ulaw (µ-law) is native Telnyx format, best compatibility
  telnyxFormat: 'g711_ulaw' as const,
  telnyxSampleRate: 8000,
  
  // Gemini Live input format (can accept 16kHz or 24kHz)
  // Using 16kHz: good balance of quality and processing
  geminiInputFormat: 'pcm_8k' as const, // Will be upsampled to 16kHz in transcoder
  geminiInputSampleRate: 8000, // Gets upsampled to 16kHz by transcoder
  
  // Gemini Live output format (fixed at 24kHz)
  geminiOutputFormat: 'pcm_24k' as const,
  geminiOutputSampleRate: 24000,
  
  // OpenAI Realtime format (PCM 16kHz native)
  openaiFormat: 'pcm_16k' as const,
  openaiSampleRate: 16000,
  
  // Normalization settings for audio quality
  normalization: {
    // Target amplitude level as fraction of full scale
    // 0.99 = 99% (maximum clarity and loudness, near peak safety limit)
    targetLevelTelnyx: 0.99,
    targetLevelGemini: 0.99,
    
    // Skip normalization if peak is below this (prevent noise amplification)
    minPeakToNormalize: 100,
    
    // Enable adaptive gain control
    enableAGC: true,
  },
  
  // Anti-aliasing filter settings
  antiAliasing: {
    // 63-tap Blackman-windowed sinc filter
    filterTaps: 63,
    cutoffRatio: 0.95, // Conservative cutoff to prevent aliasing
  },
  
  // Resampling quality settings
  resampling: {
    // Use high-quality interpolation
    interpolationMethod: 'linear' as const,
  },
} as const;

// ==================== PROVIDER-SPECIFIC CONFIG ====================

/**
 * Get audio configuration for a specific voice provider
 * Applies to ALL call types: test sessions, real campaigns, etc.
 */
export function getProviderAudioConfig(provider: VoiceProvider) {
  if (provider === 'google') {
    return {
      inputFormat: UNIFIED_AUDIO_CONFIG.telnyxFormat,
      inputSampleRate: UNIFIED_AUDIO_CONFIG.telnyxSampleRate,
      outputFormat: UNIFIED_AUDIO_CONFIG.telnyxFormat,
      outputSampleRate: UNIFIED_AUDIO_CONFIG.telnyxSampleRate,
      normalizationTarget: UNIFIED_AUDIO_CONFIG.normalization.targetLevelGemini,
    };
  }
  // OpenAI Realtime
  return {
    inputFormat: UNIFIED_AUDIO_CONFIG.openaiFormat,
    inputSampleRate: UNIFIED_AUDIO_CONFIG.openaiSampleRate,
    outputFormat: UNIFIED_AUDIO_CONFIG.openaiFormat,
    outputSampleRate: UNIFIED_AUDIO_CONFIG.openaiSampleRate,
    normalizationTarget: UNIFIED_AUDIO_CONFIG.normalization.targetLevelTelnyx,
  };
}

// ==================== CALL PATH DETERMINATION ====================

/**
 * Determine which audio configuration to use based on call context
 * 
 * CRITICAL: This ensures test and production calls use SAME settings
 * No special handling - test calls should behave like production calls
 */
export function resolveAudioConfiguration(context: {
  isTestSession?: boolean;
  provider?: VoiceProvider;
  campaignId?: string;
  source?: 'test_endpoint' | 'production_queue' | 'manual_test' | 'campaign_test';
}) {
  // Determine provider (defaults to Google Gemini Live)
  const defaultProvider = (process.env.VOICE_PROVIDER?.toLowerCase() || 'google').includes('openai')
    ? 'openai'
    : 'google';
  
  const provider = (context.provider || defaultProvider) as VoiceProvider;
  
  // Get provider-specific config
  const config = getProviderAudioConfig(provider);
  
  return {
    ...config,
    provider,
    isTestSession: context.isTestSession || false,
    source: context.source || 'production_queue',
    // Log source for debugging
    configSource: `${context.source || 'production'} (provider=${provider}, test=${context.isTestSession || false})`,
  };
}

// ==================== CONFIGURATION PROPAGATION ====================

/**
 * Ensure test endpoints use exact same config as production
 * 
 * When you update UNIFIED_AUDIO_CONFIG, it automatically applies everywhere:
 * - Test calls in Preview Studio
 * - Test calls in Campaign Test Panel
 * - Real campaigns in queue
 * - Manual test calls
 */
export function validateConfigurationConsistency(): { consistent: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Verify Telnyx format is G.711
  if (!UNIFIED_AUDIO_CONFIG.telnyxFormat.includes('g711')) {
    warnings.push('❌ Telnyx format should be G.711 for native compatibility');
  }
  
  // Verify sample rates are correct
  if (UNIFIED_AUDIO_CONFIG.telnyxSampleRate !== 8000) {
    warnings.push('❌ Telnyx should use 8kHz (native PSTN standard)');
  }
  
  if (UNIFIED_AUDIO_CONFIG.openaiSampleRate !== 16000) {
    warnings.push('❌ OpenAI should use 16kHz');
  }
  
  if (UNIFIED_AUDIO_CONFIG.geminiOutputSampleRate !== 24000) {
    warnings.push('❌ Gemini output should be 24kHz');
  }
  
  // Verify normalization is enabled
  if (!UNIFIED_AUDIO_CONFIG.normalization.enableAGC) {
    warnings.push('⚠️  AGC disabled - audio levels may be inconsistent');
  }
  
  // Verify targets are reasonable
  if (UNIFIED_AUDIO_CONFIG.normalization.targetLevelTelnyx < 0.8 || 
      UNIFIED_AUDIO_CONFIG.normalization.targetLevelTelnyx > 0.99) {
    warnings.push('⚠️  Telnyx normalization target outside recommended range (0.8-0.99)');
  }
  
  return {
    consistent: warnings.length === 0,
    warnings,
  };
}

// ==================== CALL PATH CONSTANTS ====================

/**
 * All call types that should use unified audio config
 */
export const CALL_TYPES = {
  // Test calls - should behave exactly like production
  TEST_CALL_PREVIEW_STUDIO: 'test_call_preview_studio',
  TEST_CALL_CAMPAIGN_PANEL: 'test_call_campaign_panel',
  TEST_CALL_MANUAL: 'test_call_manual',
  TEST_CALL_GEMINI_LIVE: 'test_call_gemini_live',
  TEST_CALL_OPENAI_REALTIME: 'test_call_openai_realtime',
  
  // Production calls
  PRODUCTION_CAMPAIGN_QUEUE: 'production_campaign_queue',
  PRODUCTION_AI_AGENT: 'production_ai_agent',
} as const;

/**
 * Map call type to source for logging
 */
export function callTypeToSource(callType: string): string {
  if (callType.includes('test')) return 'test_endpoint';
  return 'production_queue';
}

// ==================== INITIALIZATION ====================

/**
 * Initialize and validate audio configuration on startup
 */
export function initializeAudioConfiguration(): void {
  const validation = validateConfigurationConsistency();
  
  if (!validation.consistent) {
    console.error('❌ Audio Configuration Issues:');
    validation.warnings.forEach(w => console.error(`   ${w}`));
  } else {
    console.log('✅ Audio Configuration Valid:');
    console.log(`   Telnyx: ${UNIFIED_AUDIO_CONFIG.telnyxFormat} @ ${UNIFIED_AUDIO_CONFIG.telnyxSampleRate}kHz`);
    console.log(`   Gemini: ${UNIFIED_AUDIO_CONFIG.geminiOutputFormat} @ ${UNIFIED_AUDIO_CONFIG.geminiOutputSampleRate}kHz`);
    console.log(`   OpenAI: ${UNIFIED_AUDIO_CONFIG.openaiFormat} @ ${UNIFIED_AUDIO_CONFIG.openaiSampleRate}kHz`);
    console.log(`   Normalization: Enabled (target=${UNIFIED_AUDIO_CONFIG.normalization.targetLevelTelnyx})`);
  }
}

// ==================== DEBUG & DIAGNOSTICS ====================

/**
 * Get full audio configuration for debugging
 */
export function getAudioConfigDiagnostics() {
  return {
    unified: UNIFIED_AUDIO_CONFIG,
    providers: {
      google: getProviderAudioConfig('google'),
      openai: getProviderAudioConfig('openai'),
    },
    validation: validateConfigurationConsistency(),
    callTypes: CALL_TYPES,
  };
}

// ==================== APPLY CONFIGURATION ====================

/**
 * Apply audio configuration to a session or provider
 * Used by all code paths to ensure consistency
 */
export function applyAudioConfiguration(context: {
  isTestSession?: boolean;
  provider?: VoiceProvider;
  campaignId?: string;
  source?: string;
}) {
  const config = resolveAudioConfiguration({
    isTestSession: context.isTestSession,
    provider: context.provider as VoiceProvider | undefined,
    campaignId: context.campaignId,
    source: (context.source || 'production_queue') as any,
  });
  
  return {
    // Format for Telnyx
    telnyxAudioFormat: UNIFIED_AUDIO_CONFIG.telnyxFormat,
    telnyxSampleRate: UNIFIED_AUDIO_CONFIG.telnyxSampleRate,
    
    // Format for provider
    providerAudioFormat: config.outputFormat,
    providerSampleRate: config.outputSampleRate,
    
    // Normalization
    normalizationTarget: config.normalizationTarget,
    enableNormalization: UNIFIED_AUDIO_CONFIG.normalization.enableAGC,
    
    // Diagnostics
    provider: config.provider,
    isTest: config.isTestSession,
    source: config.configSource,
  };
}

export default {
  UNIFIED_AUDIO_CONFIG,
  getProviderAudioConfig,
  resolveAudioConfiguration,
  validateConfigurationConsistency,
  initializeAudioConfiguration,
  getAudioConfigDiagnostics,
  applyAudioConfiguration,
  CALL_TYPES,
  callTypeToSource,
};
