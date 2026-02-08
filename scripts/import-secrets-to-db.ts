/**
 * Import Environment Secrets to Database
 *
 * This script reads your .env file and imports all secrets into the
 * Secret Manager database table (secret_store) with proper encryption.
 *
 * Usage:
 *   npx tsx scripts/import-secrets-to-db.ts
 *   npx tsx scripts/import-secrets-to-db.ts --dry-run
 *   npx tsx scripts/import-secrets-to-db.ts --env=production
 *
 * Prerequisites:
 *   - SECRET_MANAGER_MASTER_KEY or SESSION_SECRET must be set
 *   - Database connection must be available
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { db } from '../server/db';
import { secretStore } from '../shared/schema';
import { encryptJson } from '../server/lib/encryption';
import { eq, and } from 'drizzle-orm';

// Load environment first
dotenv.config();

const MASTER_KEY = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET;

if (!MASTER_KEY) {
  console.error('ERROR: SECRET_MANAGER_MASTER_KEY or SESSION_SECRET must be set');
  console.error('Add one of these to your .env file first.');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const envArg = args.find(a => a.startsWith('--env='));
const targetEnvironment = envArg ? envArg.split('=')[1] as 'development' | 'production' : 'development';

// Service categorization for secrets
const SERVICE_MAPPING: Record<string, { service: string; usageContext: string; description?: string }> = {
  // Database
  'DATABASE_URL': { service: 'database', usageContext: 'postgresql', description: 'Primary PostgreSQL connection URL' },
  'DATABASE_SSL': { service: 'database', usageContext: 'postgresql', description: 'Database SSL mode' },

  // Redis
  'REDIS_URL': { service: 'cache', usageContext: 'redis', description: 'Redis connection URL' },

  // AI Providers
  'OPENAI_API_KEY': { service: 'ai', usageContext: 'openai', description: 'OpenAI API key for GPT models' },
  'AI_INTEGRATIONS_OPENAI_API_KEY': { service: 'ai', usageContext: 'openai', description: 'OpenAI API key (AI integrations)' },
  'AI_INTEGRATIONS_OPENAI_BASE_URL': { service: 'ai', usageContext: 'openai', description: 'OpenAI API base URL' },
  'GEMINI_API_KEY': { service: 'ai', usageContext: 'gemini', description: 'Google Gemini API key' },
  'GOOGLE_AI_API_KEY': { service: 'ai', usageContext: 'gemini', description: 'Google AI Studio API key' },
  'ANTHROPIC_API_KEY': { service: 'ai', usageContext: 'anthropic', description: 'Anthropic Claude API key' },
  'DEEPSEEK_API_KEY': { service: 'ai', usageContext: 'deepseek', description: 'DeepSeek API key' },

  // Telnyx
  'TELNYX_API_KEY': { service: 'telephony', usageContext: 'telnyx', description: 'Telnyx API key for voice/SMS' },
  'TELNYX_TEXML_APP_ID': { service: 'telephony', usageContext: 'telnyx', description: 'Telnyx TeXML Application ID' },
  'TELNYX_CONNECTION_ID': { service: 'telephony', usageContext: 'telnyx', description: 'Telnyx SIP Connection ID' },
  'TELNYX_FROM_NUMBER': { service: 'telephony', usageContext: 'telnyx', description: 'Default Telnyx caller ID' },
  'TELNYX_WEBRTC_USERNAME': { service: 'telephony', usageContext: 'telnyx-webrtc', description: 'Telnyx WebRTC username' },
  'TELNYX_WEBRTC_PASSWORD': { service: 'telephony', usageContext: 'telnyx-webrtc', description: 'Telnyx WebRTC password' },

  // Google Cloud
  'GOOGLE_CLOUD_PROJECT': { service: 'gcp', usageContext: 'project', description: 'Google Cloud Project ID' },
  'GCP_PROJECT_ID': { service: 'gcp', usageContext: 'project', description: 'GCP Project ID' },
  'GOOGLE_APPLICATION_CREDENTIALS': { service: 'gcp', usageContext: 'credentials', description: 'Path to GCP service account key' },
  'GCS_BUCKET': { service: 'gcp', usageContext: 'storage', description: 'Google Cloud Storage bucket name' },

  // Authentication
  'SESSION_SECRET': { service: 'auth', usageContext: 'session', description: 'Session encryption secret' },
  'JWT_SECRET': { service: 'auth', usageContext: 'jwt', description: 'JWT signing secret' },
  'SECRET_MANAGER_MASTER_KEY': { service: 'auth', usageContext: 'encryption', description: 'Master key for secret encryption' },

  // OAuth - Google
  'GOOGLE_CLIENT_ID': { service: 'oauth', usageContext: 'google', description: 'Google OAuth client ID' },
  'GOOGLE_CLIENT_SECRET': { service: 'oauth', usageContext: 'google', description: 'Google OAuth client secret' },

  // OAuth - Microsoft
  'MICROSOFT_CLIENT_ID': { service: 'oauth', usageContext: 'microsoft', description: 'Microsoft OAuth client ID' },
  'MICROSOFT_CLIENT_SECRET': { service: 'oauth', usageContext: 'microsoft', description: 'Microsoft OAuth client secret' },
  'MICROSOFT_TENANT_ID': { service: 'oauth', usageContext: 'microsoft', description: 'Microsoft tenant ID' },

  // Email
  'MAILGUN_API_KEY': { service: 'email', usageContext: 'mailgun', description: 'Mailgun API key' },
  'MAILGUN_DOMAIN': { service: 'email', usageContext: 'mailgun', description: 'Mailgun sending domain' },

  // Search/Intelligence
  'APOLLO_API_KEY': { service: 'enrichment', usageContext: 'apollo', description: 'Apollo.io API key' },
  'HUNTER_API_KEY': { service: 'enrichment', usageContext: 'hunter', description: 'Hunter.io API key' },
  'CLEARBIT_API_KEY': { service: 'enrichment', usageContext: 'clearbit', description: 'Clearbit API key' },
  'PERPLEXITY_API_KEY': { service: 'enrichment', usageContext: 'perplexity', description: 'Perplexity API key' },
  'EVABOOT_API_KEY': { service: 'enrichment', usageContext: 'evaboot', description: 'Evaboot API key' },

  // Transcription
  'DEEPGRAM_API_KEY': { service: 'transcription', usageContext: 'deepgram', description: 'Deepgram transcription API key' },

  // Webhooks/URLs
  'PUBLIC_WEBHOOK_URL': { service: 'webhooks', usageContext: 'public', description: 'Public webhook callback URL' },
  'PUBLIC_WEBHOOK_HOST': { service: 'webhooks', usageContext: 'public', description: 'Public webhook host' },
  'PUBLIC_WEBSOCKET_URL': { service: 'webhooks', usageContext: 'websocket', description: 'Public WebSocket URL' },
  'TELNYX_WEBHOOK_URL': { service: 'webhooks', usageContext: 'telnyx', description: 'Telnyx webhook URL' },

  // Ngrok
  'NGROK_AUTH_TOKEN': { service: 'development', usageContext: 'ngrok', description: 'Ngrok authentication token' },
  'NGROK_DOMAIN': { service: 'development', usageContext: 'ngrok', description: 'Ngrok custom domain' },
};

// Secrets to skip (non-sensitive or runtime-only)
const SKIP_KEYS = new Set([
  'NODE_ENV',
  'PORT',
  'HOST',
  'LOG_LEVEL',
  'DEBUG',
  'TZ',
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TERM',
  'LANG',
  'PWD',
  'OLDPWD',
  'SHLVL',
  'SKIP_NGROK',
  'DISABLE_REDIS',
  'AUTO_INIT_SIP',
  'ENABLE_AUDIO_FIX',
  'ENABLE_TRANSCRIPTION',
  'ENABLE_RECORDING',
  'CORS_ORIGINS',
  'RATE_LIMIT',
]);

async function parseEnvFile(filePath: string): Promise<Record<string, string>> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse KEY=VALUE
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  }

  return result;
}

function getServiceInfo(key: string): { service: string; usageContext: string; description: string } {
  const mapping = SERVICE_MAPPING[key];
  if (mapping) {
    return {
      service: mapping.service,
      usageContext: mapping.usageContext,
      description: mapping.description || `Environment variable: ${key}`,
    };
  }

  // Try to infer from key name
  const keyLower = key.toLowerCase();

  if (keyLower.includes('api_key') || keyLower.includes('apikey')) {
    const service = key.split('_')[0].toLowerCase();
    return { service, usageContext: 'api', description: `API key for ${service}` };
  }

  if (keyLower.includes('secret')) {
    return { service: 'auth', usageContext: 'secret', description: `Secret: ${key}` };
  }

  if (keyLower.includes('password') || keyLower.includes('credential')) {
    return { service: 'auth', usageContext: 'credential', description: `Credential: ${key}` };
  }

  if (keyLower.includes('url') || keyLower.includes('host') || keyLower.includes('endpoint')) {
    return { service: 'config', usageContext: 'url', description: `URL configuration: ${key}` };
  }

  return { service: 'config', usageContext: 'general', description: `Configuration: ${key}` };
}

async function importSecrets() {
  console.log('='.repeat(60));
  console.log('Secret Manager - Import from .env');
  console.log('='.repeat(60));
  console.log(`Environment: ${targetEnvironment}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  // Find and parse .env file
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found');
    process.exit(1);
  }

  const envVars = await parseEnvFile(envPath);
  console.log(`Found ${Object.keys(envVars).length} variables in .env`);
  console.log('');

  // Filter out non-sensitive keys
  const secretKeys = Object.keys(envVars).filter(key => {
    if (SKIP_KEYS.has(key)) return false;
    if (key.startsWith('npm_')) return false;
    if (key.startsWith('_')) return false;

    // Only include keys that look like secrets
    const keyLower = key.toLowerCase();
    return keyLower.includes('key') ||
           keyLower.includes('secret') ||
           keyLower.includes('password') ||
           keyLower.includes('credential') ||
           keyLower.includes('token') ||
           keyLower.includes('url') ||
           keyLower.includes('id') ||
           keyLower.includes('bucket') ||
           keyLower.includes('domain') ||
           SERVICE_MAPPING[key] !== undefined;
  });

  console.log(`Importing ${secretKeys.length} secrets...`);
  console.log('');

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const key of secretKeys) {
    const value = envVars[key];
    if (!value || value === 'undefined' || value === 'null') {
      console.log(`  SKIP: ${key} (empty value)`);
      skipped++;
      continue;
    }

    const { service, usageContext, description } = getServiceInfo(key);

    try {
      // Check if secret already exists
      const existing = await db
        .select()
        .from(secretStore)
        .where(
          and(
            eq(secretStore.name, key),
            eq(secretStore.environment, targetEnvironment),
            eq(secretStore.service, service),
            eq(secretStore.usageContext, usageContext)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        if (dryRun) {
          console.log(`  UPDATE: ${key} (${service}/${usageContext}) [DRY RUN]`);
        } else {
          // Update existing secret
          const encryptedValue = encryptJson(value, MASTER_KEY);
          await db
            .update(secretStore)
            .set({
              encryptedValue,
              description,
              updatedAt: new Date(),
              updatedBy: 'system-import',
            })
            .where(eq(secretStore.id, existing[0].id));
          console.log(`  UPDATE: ${key} (${service}/${usageContext})`);
        }
        updated++;
      } else {
        if (dryRun) {
          console.log(`  CREATE: ${key} (${service}/${usageContext}) [DRY RUN]`);
        } else {
          // Create new secret
          const encryptedValue = encryptJson(value, MASTER_KEY);
          await db
            .insert(secretStore)
            .values({
              name: key,
              description,
              environment: targetEnvironment,
              service,
              usageContext,
              encryptedValue,
              metadata: { importedFrom: '.env', importedAt: new Date().toISOString() },
              createdBy: 'system-import',
              updatedBy: 'system-import',
            });
          console.log(`  CREATE: ${key} (${service}/${usageContext})`);
        }
        created++;
      }
    } catch (error: any) {
      console.error(`  ERROR: ${key} - ${error.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Import Summary:');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('');
    console.log('This was a dry run. No changes were made.');
    console.log('Run without --dry-run to actually import secrets.');
  }

  process.exit(errors > 0 ? 1 : 0);
}

importSecrets().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
