/**
 * Feature Flag Management
 * 
 * Usage:
 * - Set environment variable FEATURE_FLAGS with comma-separated flag names
 * - Example: FEATURE_FLAGS=queue_replace_v1,new_feature_x
 * 
 * In code:
 * import { isFeatureEnabled } from './feature-flags';
 * if (isFeatureEnabled('queue_replace_v1')) { ... }
 */

// Feature flag definitions with descriptions
export const FEATURE_FLAGS = {
  queue_replace_v1: {
    name: 'queue_replace_v1',
    description: 'Enable queue management system with replace, clear operations',
    default: true  // Enabled for production use
  },
  argyle_event_drafts: {
    name: 'argyle_event_drafts',
    description: 'Enable Argyle event-sourced campaign drafts (client-gated to Argyle only)',
    default: false  // Feature flag OFF by default; enable via FEATURE_FLAGS env var
  },
  ukef_campaign_reports: {
    name: 'ukef_campaign_reports',
    description: 'Enable UKEF campaign reports with lead evidence, recordings, and QA (client-gated to Lightcast/UKEF only)',
    default: false  // Feature flag OFF by default; enable via FEATURE_FLAGS env var
  },
  ukef_transcript_qa: {
    name: 'ukef_transcript_qa',
    description: 'Enable UKEF Transcript Quality + Disposition Validation Pipeline (client-gated to Lightcast/UKEF only)',
    default: false  // Feature flag OFF by default; enable via FEATURE_FLAGS env var
  },
  client_campaign_listing_v2: {
    name: 'client_campaign_listing_v2',
    description: 'Fix client portal campaign listing to include campaigns linked directly via clientAccountId (not only via workOrders/intakeRequests)',
    default: false  // Feature flag OFF by default; enable via FEATURE_FLAGS env var
  },
  argyle_event_orders: {
    name: 'argyle_event_orders',
    description: 'Enable Argyle event → admin project request → approval → campaign creation pipeline (Argyle-only client gate)',
    default: false  // Feature flag OFF by default; enable via FEATURE_FLAGS env var
  },
  // Add more feature flags here as needed
} as const;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

/**
 * Check if a feature flag is enabled
 * @param flagName - The name of the feature flag to check
 * @returns true if the flag is enabled, false otherwise
 */
export function isFeatureEnabled(flagName: FeatureFlagName): boolean {
  const enabledFlags = process.env.FEATURE_FLAGS?.split(',').map(f => f.trim()) || [];
  
  // Check if explicitly enabled via environment variable
  if (enabledFlags.includes(flagName)) {
    return true;
  }
  
  // Fall back to default value if not specified in environment
  return FEATURE_FLAGS[flagName]?.default || false;
}

/**
 * Get all enabled feature flags
 * @returns Array of enabled feature flag names
 */
export function getEnabledFlags(): string[] {
  return process.env.FEATURE_FLAGS?.split(',').map(f => f.trim()).filter(Boolean) || [];
}

/**
 * Check if a feature flag is defined
 * @param flagName - The name of the feature flag to check
 * @returns true if the flag is defined in FEATURE_FLAGS
 */
export function isFeatureFlagDefined(flagName: string): flagName is FeatureFlagName {
  return flagName in FEATURE_FLAGS;
}

/**
 * Get feature flag metadata
 * @param flagName - The name of the feature flag
 * @returns Feature flag metadata or null if not found
 */
export function getFeatureFlagMetadata(flagName: FeatureFlagName) {
  return FEATURE_FLAGS[flagName] || null;
}

/**
 * Middleware to check if a feature flag is enabled before proceeding
 * @param flagName - The name of the feature flag to check
 * @returns Express middleware function
 */
export function requireFeatureFlag(flagName: FeatureFlagName) {
  return (req: any, res: any, next: any) => {
    if (!isFeatureEnabled(flagName)) {
      return res.status(404).json({ 
        error: 'not_found',
        message: `Feature '${flagName}' is not available`
      });
    }
    next();
  };
}
