/**
 * Secret Loader Service
 *
 * Loads secrets from the database and makes them available as environment variables.
 * This allows the application to use secrets stored in the Secret Manager
 * instead of (or in addition to) .env files.
 *
 * Usage:
 *   import { loadSecretsToEnv, getSecret } from './services/secret-loader';
 *
 *   // Load all secrets for a service
 *   await loadSecretsToEnv({ service: 'telnyx' });
 *
 *   // Get a specific secret value
 *   const apiKey = await getSecret('TELNYX_API_KEY');
 */

import { db } from '../db';
import { secretStore, SecretEnvironment } from '@shared/schema';
import { decryptJson } from '../lib/encryption';
import { and, eq } from 'drizzle-orm';

const LOG_PREFIX = '[SecretLoader]';

// Cache for loaded secrets to avoid repeated database queries
const secretCache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const MASTER_KEY = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET || '';

function ensureMasterKey(): string {
  if (!MASTER_KEY) {
    throw new Error('SECRET_MANAGER_MASTER_KEY or SESSION_SECRET must be configured');
  }
  return MASTER_KEY;
}

function getRuntimeEnvironment(): SecretEnvironment {
  const env = process.env.SECRET_MANAGER_RUNTIME_ENV || process.env.NODE_ENV || 'development';
  return env.toLowerCase() === 'production' ? 'production' : 'development';
}

export interface LoadSecretsOptions {
  service?: string;
  usageContext?: string;
  environment?: SecretEnvironment;
  overwriteExisting?: boolean;
}

/**
 * Load secrets from the database and set them as environment variables.
 * Tries the target environment first, then falls back to 'development' if
 * the target is 'production' and a secret was not found there.
 * Any secret that cannot be resolved from the DB keeps whatever value
 * was already present in process.env (i.e. from .env file).
 */
export async function loadSecretsToEnv(options: LoadSecretsOptions = {}): Promise<number> {
  const environment = options.environment || getRuntimeEnvironment();
  const overwrite = options.overwriteExisting ?? false;

  console.log(`${LOG_PREFIX} Loading secrets for environment: ${environment}`);

  const baseConditions: any[] = [eq(secretStore.isActive, true)];

  if (options.service) {
    baseConditions.push(eq(secretStore.service, options.service));
  }

  if (options.usageContext) {
    baseConditions.push(eq(secretStore.usageContext, options.usageContext));
  }

  try {
    // Load secrets from both environments so we can fall back from prod → dev
    const envsToLoad: ('production' | 'development')[] =
      environment === 'production' ? ['production', 'development'] : ['development'];

    // Keyed by secret name → first match wins (target env takes priority)
    const resolvedSecrets = new Map<string, typeof secretStore.$inferSelect>();

    for (const env of envsToLoad) {
      const rows = await db
        .select()
        .from(secretStore)
        .where(and(...baseConditions, eq(secretStore.environment, env)));

      for (const secret of rows) {
        if (!resolvedSecrets.has(secret.name)) {
          resolvedSecrets.set(secret.name, secret);
        }
      }
    }

    // When not overwriting, filter out secrets that already exist in process.env
    // This avoids unnecessary decryption attempts (and noisy error logs when
    // the master key doesn't match what was used during encryption).
    let needsDecryption: (typeof secretStore.$inferSelect)[] = [];
    let skipped = 0;
    for (const [, secret] of resolvedSecrets) {
      if (!overwrite && process.env[secret.name] !== undefined) {
        skipped++;
      } else {
        needsDecryption.push(secret);
      }
    }

    if (skipped > 0) {
      console.log(`${LOG_PREFIX} Skipped ${skipped} secrets already in env (overwrite=false)`);
    }

    // If nothing needs decryption, return early — no master key needed
    if (needsDecryption.length === 0) {
      console.log(`${LOG_PREFIX} All ${resolvedSecrets.size} secrets already populated from env — skipping DB decryption`);
      return 0;
    }

    let loaded = 0;
    const masterKey = ensureMasterKey();

    for (const secret of needsDecryption) {
      try {
        const value = decryptJson<string>(secret.encryptedValue, masterKey);

        // Handle both string and object values
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

        process.env[secret.name] = stringValue;
        loaded++;

        // Update cache
        secretCache.set(secret.name, {
          value: stringValue,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        console.log(`${LOG_PREFIX}   LOADED: ${secret.name} (${secret.service}/${secret.usageContext}) [${secret.environment}]`);
      } catch (decryptError: any) {
        console.error(`${LOG_PREFIX}   ERROR decrypting ${secret.name}: ${decryptError.message}`);
      }
    }

    console.log(`${LOG_PREFIX} Loaded ${loaded}/${needsDecryption.length} secrets from DB, ${skipped} already in env`);
    return loaded;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Failed to load secrets from DB, falling back to .env: ${error.message}`);
    return 0;
  }
}

/**
 * Get a specific secret value by name.
 * Checks: cache → process.env → DB (target env) → DB (development fallback)
 *
 * NOTE: process.env is checked BEFORE the DB to avoid unnecessary decryption
 * attempts when secrets are already provided via GCP Secret Manager or .env.
 * This prevents noisy decryption error logs when the master key doesn't match.
 */
export async function getSecret(
  name: string,
  options: { environment?: SecretEnvironment; fallbackToEnv?: boolean } = {}
): Promise<string | undefined> {
  const environment = options.environment || getRuntimeEnvironment();
  const fallbackToEnv = options.fallbackToEnv ?? true;

  // Check cache first
  const cached = secretCache.get(name);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Check process.env BEFORE DB — if already set (via GCP secrets or .env),
  // skip DB decryption entirely to avoid "unable to authenticate data" errors
  if (fallbackToEnv && process.env[name] !== undefined) {
    return process.env[name];
  }

  // Try target environment, then fallback to development
  const envsToTry: SecretEnvironment[] =
    environment === 'production' ? ['production', 'development'] : ['development'];

  for (const env of envsToTry) {
    try {
      const result = await db
        .select()
        .from(secretStore)
        .where(
          and(
            eq(secretStore.name, name),
            eq(secretStore.environment, env),
            eq(secretStore.isActive, true)
          )
        )
        .limit(1);

      if (result.length > 0) {
        const value = decryptJson<string>(result[0].encryptedValue, ensureMasterKey());
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

        // Update cache
        secretCache.set(name, {
          value: stringValue,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return stringValue;
      }
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Failed to get secret ${name} from DB (${env}): ${error.message}`);
    }
  }

  return undefined;
}

/**
 * Get multiple secrets at once
 */
export async function getSecrets(
  names: string[],
  options: { environment?: SecretEnvironment } = {}
): Promise<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};

  for (const name of names) {
    result[name] = await getSecret(name, options);
  }

  return result;
}

/**
 * Clear the secret cache
 */
export function clearSecretCache(): void {
  secretCache.clear();
  console.log(`${LOG_PREFIX} Cache cleared`);
}

/**
 * Check if secrets are available in the database
 */
export async function hasSecrets(service?: string): Promise<boolean> {
  const environment = getRuntimeEnvironment();
  const conditions = [eq(secretStore.environment, environment), eq(secretStore.isActive, true)];

  if (service) {
    conditions.push(eq(secretStore.service, service));
  }

  const result = await db
    .select({ count: secretStore.id })
    .from(secretStore)
    .where(and(...conditions))
    .limit(1);

  return result.length > 0;
}

/**
 * Initialize secrets on application startup
 * Call this early in your server initialization
 */
export async function initializeSecrets(options: {
  services?: string[];
  overwriteEnv?: boolean;
} = {}): Promise<void> {
  console.log(`${LOG_PREFIX} Initializing secrets from database...`);

  if (options.services && options.services.length > 0) {
    for (const service of options.services) {
      await loadSecretsToEnv({
        service,
        overwriteExisting: options.overwriteEnv,
      });
    }
  } else {
    await loadSecretsToEnv({
      overwriteExisting: options.overwriteEnv,
    });
  }

  console.log(`${LOG_PREFIX} Secrets initialization complete`);
}

export default {
  loadSecretsToEnv,
  getSecret,
  getSecrets,
  clearSecretCache,
  hasSecrets,
  initializeSecrets,
};
