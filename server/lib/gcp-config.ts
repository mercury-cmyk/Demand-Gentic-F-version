/**
 * Centralized GCP Configuration
 *
 * Single source of truth for all Google Cloud configuration values.
 * Every file that needs GCP project ID, bucket name, service account, etc.
 * should import from here instead of reading process.env directly.
 *
 * When the Google Account Manager switches accounts, it calls `updateGcpConfig()`
 * which atomically updates all values and notifies registered listeners.
 */

export interface GcpConfig {
  projectId: string;
  gcsBucket: string;
  location: string;
  keyFilename?: string;
  serviceAccountEmail?: string;
}

// ---------------------------------------------------------------------------
// Mutable singleton — updated on account switch
// ---------------------------------------------------------------------------
let _config: GcpConfig = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || 'demandgentic',
  gcsBucket: process.env.GCS_BUCKET || process.env.S3_BUCKET || 'demandgentic-prod-storage-2026',
  location: process.env.VERTEX_AI_LOCATION || 'us-central1',
  keyFilename: process.env.GCS_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS,
};

// ---------------------------------------------------------------------------
// Getters — always return current values (never stale)
// ---------------------------------------------------------------------------
export function getGcpProjectId(): string { return _config.projectId; }
export function getGcsBucket(): string { return _config.gcsBucket; }
export function getGcpLocation(): string { return _config.location; }
export function getGcpKeyFilename(): string | undefined { return _config.keyFilename; }
export function getGcpServiceAccountEmail(): string | undefined { return _config.serviceAccountEmail; }
export function getGcpConfig(): Readonly<GcpConfig> { return _config; }

// ---------------------------------------------------------------------------
// Change listeners — services register to be notified on account switch
// ---------------------------------------------------------------------------
type ConfigChangeListener = (config: Readonly<GcpConfig>) => void | Promise<void>;
const _listeners: ConfigChangeListener[] = [];

/**
 * Register a callback that fires whenever GCP config changes (account switch).
 * Listeners are called in registration order. Async listeners are awaited.
 */
export function onGcpConfigChange(listener: ConfigChangeListener): void {
  _listeners.push(listener);
}

// ---------------------------------------------------------------------------
// Update — called by Google Account Manager on account switch
// ---------------------------------------------------------------------------

/**
 * Atomically update the GCP config and notify all listeners.
 * Called by `google-account-manager.ts` applyAccount().
 */
export async function updateGcpConfig(newConfig: Partial<GcpConfig>): Promise<void> {
  if (newConfig.projectId) _config.projectId = newConfig.projectId;
  if (newConfig.gcsBucket) _config.gcsBucket = newConfig.gcsBucket;
  if (newConfig.location) _config.location = newConfig.location;
  if (newConfig.keyFilename !== undefined) _config.keyFilename = newConfig.keyFilename;
  if (newConfig.serviceAccountEmail !== undefined) _config.serviceAccountEmail = newConfig.serviceAccountEmail;

  console.log(`[GcpConfig] Updated: project=${_config.projectId}, bucket=${_config.gcsBucket}, location=${_config.location}`);

  // Notify all registered listeners
  for (const listener of _listeners) {
    try {
      await listener(_config);
    } catch (e: any) {
      console.warn(`[GcpConfig] Listener error: ${e.message}`);
    }
  }
}
