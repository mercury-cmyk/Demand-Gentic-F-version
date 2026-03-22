/**
 * Voice Architecture Runtime Mode Resolver
 *
 * Allows runtime switching between legacy and unified architecture paths
 * without requiring process restarts. Default behavior still follows env.
 */

export type VoiceArchitectureMode = 'legacy' | 'unified';

let runtimeOverrideMode: VoiceArchitectureMode | null = null;

function getEnvDefaultMode(): VoiceArchitectureMode {
  const enabledByEnv = (process.env.VOICE_AGENT_USE_UNIFIED_ARCHITECTURE ?? 'true').toLowerCase() !== 'false';
  return enabledByEnv ? 'unified' : 'legacy';
}

export function getVoiceArchitectureMode(): {
  mode: VoiceArchitectureMode;
  source: 'ui_override' | 'env_default';
  envDefaultMode: VoiceArchitectureMode;
} {
  const envDefaultMode = getEnvDefaultMode();
  if (runtimeOverrideMode) {
    return {
      mode: runtimeOverrideMode,
      source: 'ui_override',
      envDefaultMode,
    };
  }

  return {
    mode: envDefaultMode,
    source: 'env_default',
    envDefaultMode,
  };
}

export function isUnifiedVoiceArchitectureEnabled(): boolean {
  return getVoiceArchitectureMode().mode === 'unified';
}

export function setVoiceArchitectureMode(mode: VoiceArchitectureMode, updatedBy?: string): {
  mode: VoiceArchitectureMode;
  updatedBy: string;
  updatedAt: string;
} {
  runtimeOverrideMode = mode;
  const actor = updatedBy || 'system';
  const updatedAt = new Date().toISOString();
  console.log(
    `[UnifiedAgentArchitecture] Voice runtime mode override set to '${mode}' by ${actor} at ${updatedAt}`
  );
  return { mode, updatedBy: actor, updatedAt };
}