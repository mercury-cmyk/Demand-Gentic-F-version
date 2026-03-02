#!/usr/bin/env tsx
/**
 * GCP Secret Manager Sync Script
 * Syncs secrets from .env.local to Google Cloud Secret Manager
 * Replaces ngrok URLs with production domain
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = 'gen-lang-client-0789558283';
const PRODUCTION_DOMAIN = 'https://demandgentic.ai';
const NGROK_PATTERN = /https:\/\/[a-z-]+\.ngrok-free\.dev/gi;

interface SecretConfig {
  name: string;
  value: string;
  description?: string;
}

// Parse .env.local file
function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const env: Record<string, string> = {};
  
  content.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?$/i);
    if (match) {
      const [, key, value] = match;
      env[key] = value.replace(/^["']|["']$/g, '');
    }
  });
  
  return env;
}

// Replace ngrok URLs with production domain
function replaceNgrokUrls(value: string): string {
  return value.replace(NGROK_PATTERN, PRODUCTION_DOMAIN)
              .replace(/steve-unbalking-guessingly\.ngrok-free\.dev/gi, 'demandgentic.ai');
}

// Secrets configuration
async function getSecretsToSync(): Promise<SecretConfig[]> {
  // Try .env.local first, fall back to .env
  const envLocalPath = path.join(__dirname, '.env.local');
  const envPath = path.join(__dirname, '.env');
  const envFilePath = fs.existsSync(envLocalPath) ? envLocalPath : envPath;
  console.log(`📂 Reading from: ${path.basename(envFilePath)}`);
  const envLocal = parseEnvFile(envFilePath);
  
  // Generated JWT secret (from previous step)
  const JWT_SECRET = '4f34480d3577e15deefcdf3be6e875afc6f2304ac4870f89dfb550076314fb45';
  
  const secrets: SecretConfig[] = [
    // Session & Auth
    { name: 'SESSION_SECRET', value: envLocal.SESSION_SECRET, description: 'Express session secret' },
    { name: 'JWT_SECRET', value: JWT_SECRET, description: 'JWT signing secret (generated)' },
    { name: 'SECRET_MANAGER_MASTER_KEY', value: envLocal.SECRET_MANAGER_MASTER_KEY, description: 'Master key for secret encryption' },

    // Database
    { name: 'PGDATABASE', value: envLocal.PGDATABASE, description: 'PostgreSQL database name' },
    { name: 'PGHOST', value: envLocal.PGHOST, description: 'PostgreSQL host' },
    { name: 'PGPORT', value: envLocal.PGPORT, description: 'PostgreSQL port' },
    { name: 'PGUSER', value: envLocal.PGUSER, description: 'PostgreSQL user' },
    { name: 'PGPASSWORD', value: envLocal.PGPASSWORD, description: 'PostgreSQL password' },
    { name: 'DATABASE_URL', value: envLocal.DATABASE_URL, description: 'Full database connection URL' },

    // AI Providers
    { name: 'AI_INTEGRATIONS_OPENAI_API_KEY', value: envLocal.AI_INTEGRATIONS_OPENAI_API_KEY, description: 'OpenAI API key' },
    { name: 'AI_INTEGRATIONS_OPENAI_BASE_URL', value: envLocal.AI_INTEGRATIONS_OPENAI_BASE_URL, description: 'OpenAI API base URL' },
    { name: 'OPENAI_API_KEY', value: envLocal.OPENAI_API_KEY, description: 'OpenAI API key (alternative)' },
    { name: 'OPENAI_WEBHOOK_SECRET', value: envLocal.OPENAI_WEBHOOK_SECRET, description: 'OpenAI webhook secret' },
    { name: 'AI_INTEGRATIONS_GEMINI_API_KEY', value: envLocal.AI_INTEGRATIONS_GEMINI_API_KEY, description: 'Gemini API key' },
    { name: 'AI_INTEGRATIONS_GEMINI_BASE_URL', value: envLocal.AI_INTEGRATIONS_GEMINI_BASE_URL, description: 'Gemini API base URL' },
    { name: 'GEMINI_API_KEY', value: envLocal.GEMINI_API_KEY, description: 'Gemini API key (alternative)' },
    { name: 'AI_INTEGRATIONS_ANTHROPIC_API_KEY', value: envLocal.AI_INTEGRATIONS_ANTHROPIC_API_KEY, description: 'Anthropic Claude API key' },
    { name: 'DEEPSEEK_API_KEY', value: envLocal.DEEPSEEK_API_KEY, description: 'DeepSeek API key' },

    // Telnyx Telephony
    { name: 'TELNYX_API_KEY', value: envLocal.TELNYX_API_KEY, description: 'Telnyx API key' },
    { name: 'TELNYX_CONNECTION_ID', value: envLocal.TELNYX_CONNECTION_ID, description: 'Telnyx SIP connection ID' },
    { name: 'TELNYX_FROM_NUMBER', value: envLocal.TELNYX_FROM_NUMBER, description: 'Telnyx outbound phone number' },
    { name: 'TELNYX_WEBRTC_USERNAME', value: envLocal.TELNYX_WEBRTC_USERNAME || envLocal.TELNYX_SIP_USERNAME, description: 'Telnyx WebRTC username' },
    { name: 'TELNYX_WEBRTC_PASSWORD', value: envLocal.TELNYX_WEBRTC_PASSWORD || envLocal.TELNYX_SIP_PASSWORD, description: 'Telnyx WebRTC password' },
    { name: 'TELNYX_CALL_CONTROL_APP_ID', value: envLocal.TELNYX_CALL_CONTROL_APP_ID, description: 'Telnyx Call Control app ID' },
    { name: 'TELNYX_SIP_USERNAME', value: envLocal.TELNYX_SIP_USERNAME, description: 'Telnyx SIP username' },
    { name: 'TELNYX_SIP_PASSWORD', value: envLocal.TELNYX_SIP_PASSWORD, description: 'Telnyx SIP password' },
    { name: 'TELNYX_SIP_CONNECTION_ID', value: envLocal.TELNYX_SIP_CONNECTION_ID, description: 'Telnyx SIP connection ID' },

    // Search & Intelligence
    { name: 'BRAVE_SEARCH_API_KEY', value: envLocal.BRAVE_SEARCH_API_KEY, description: 'Brave Search API key' },
    { name: 'GOOGLE_SEARCH_API_KEY', value: envLocal.GOOGLE_SEARCH_API_KEY, description: 'Google Custom Search API key' },
    { name: 'GOOGLE_SEARCH_ENGINE_ID', value: envLocal.GOOGLE_SEARCH_ENGINE_ID, description: 'Google Search Engine ID' },
    { name: 'PSE_GOOGLE', value: envLocal.PSE_GOOGLE, description: 'Google Programmable Search Engine key' },
    { name: 'EMAIL_LIST_VERIFY_API_KEY', value: envLocal.EMAIL_LIST_VERIFY_API_KEY, description: 'Email verification API key' },
    { name: 'COMPANIES_HOUSE_API_KEY', value: envLocal.COMPANIES_HOUSE_API_KEY, description: 'UK Companies House API key' },

    // OAuth & Social
    { name: 'GOOGLE_AUTH_CLIENT_ID', value: envLocal.GOOGLE_AUTH_CLIENT_ID, description: 'Google OAuth client ID' },
    { name: 'GOOGLE_CLIENT_SECRET', value: envLocal.GOOGLE_CLIENT_SECRET, description: 'Google OAuth client secret' },
    { name: 'MICROSOFT_CLIENT_ID', value: envLocal.MICROSOFT_CLIENT_ID, description: 'Microsoft OAuth client ID' },
    { name: 'MICROSOFT_CLIENT_SECRET', value: envLocal.MICROSOFT_CLIENT_SECRET, description: 'Microsoft OAuth client secret' },
    { name: 'MICROSOFT_TENANT_ID', value: envLocal.MICROSOFT_TENANT_ID, description: 'Microsoft tenant ID' },

    // Email & Messaging
    { name: 'MAILGUN_API_KEY', value: envLocal.MAILGUN_API_KEY, description: 'Mailgun API key' },
    { name: 'MAILGUN_DOMAIN', value: envLocal.MAILGUN_DOMAIN, description: 'Mailgun sending domain' },

    // Infrastructure
    { name: 'REDIS_URL', value: envLocal.REDIS_URL, description: 'Redis connection URL' },

    // Transcription
    { name: 'DEEPGRAM_API_KEY', value: envLocal.DEEPGRAM_API_KEY, description: 'Deepgram transcription API key' },

    // Org Intelligence Models
    { name: 'ORG_INTELLIGENCE_OPENAI_MODEL', value: envLocal.ORG_INTELLIGENCE_OPENAI_MODEL || 'gpt-4o', description: 'OpenAI model for org intelligence' },
    { name: 'ORG_INTELLIGENCE_GEMINI_MODEL', value: envLocal.ORG_INTELLIGENCE_GEMINI_MODEL || 'gemini-2.5-pro', description: 'Gemini model for org intelligence' },
    { name: 'ORG_INTELLIGENCE_CLAUDE_MODEL', value: envLocal.ORG_INTELLIGENCE_CLAUDE_MODEL || 'claude-3-5-sonnet-20241022', description: 'Claude model for org intelligence' },
    { name: 'ORG_INTELLIGENCE_SYNTH_PROVIDER', value: envLocal.ORG_INTELLIGENCE_SYNTH_PROVIDER || 'gemini', description: 'Synth provider for org intelligence' },
    { name: 'ORG_INTELLIGENCE_SYNTH_MODEL', value: envLocal.ORG_INTELLIGENCE_SYNTH_MODEL || 'gemini-2.5-pro', description: 'Synth model for org intelligence' },
    { name: 'ORG_INTELLIGENCE_OPENAI_MAX_TOKENS', value: envLocal.ORG_INTELLIGENCE_OPENAI_MAX_TOKENS || '6500', description: 'Max tokens for OpenAI' },
    { name: 'ORG_INTELLIGENCE_GEMINI_MAX_OUTPUT_TOKENS', value: envLocal.ORG_INTELLIGENCE_GEMINI_MAX_OUTPUT_TOKENS || '6500', description: 'Max tokens for Gemini' },
    { name: 'ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS', value: envLocal.ORG_INTELLIGENCE_CLAUDE_MAX_TOKENS || '6500', description: 'Max tokens for Claude' },
  ];
  
  return secrets.filter(s => {
    if (!s.value || s.value === 'undefined') return false;
    
    // Safety check: Don't sync localhost Redis to production
    if (s.name === 'REDIS_URL' && (s.value.includes('localhost') || s.value.includes('127.0.0.1'))) {
      console.warn('⚠️  Skipping REDIS_URL because it points to localhost. Configure a production Redis instance in GCP.');
      return false;
    }
    
    return true;
  });
}

// Create or update secret in GCP Secret Manager
async function createOrUpdateSecret(client: SecretManagerServiceClient, secret: SecretConfig): Promise<void> {
  const parent = `projects/${PROJECT_ID}`;
  const secretPath = `${parent}/secrets/${secret.name}`;
  
  try {
    // Check if secret exists
    await client.getSecret({ name: secretPath });
    
    // Secret exists, add new version
    const [version] = await client.addSecretVersion({
      parent: secretPath,
      payload: {
        data: Buffer.from(secret.value, 'utf8'),
      },
    });
    
    console.log(`✅ Updated secret: ${secret.name} (version: ${version.name?.split('/').pop()})`);
  } catch (error: any) {
    if (error.code === 5) { // NOT_FOUND
      // Create new secret
      const [newSecret] = await client.createSecret({
        parent,
        secretId: secret.name,
        secret: {
          replication: {
            automatic: {},
          },
          labels: {
            environment: 'production',
            managed_by: 'sync-script',
          },
        },
      });
      
      // Add first version
      await client.addSecretVersion({
        parent: newSecret.name!,
        payload: {
          data: Buffer.from(secret.value, 'utf8'),
        },
      });
      
      console.log(`✅ Created secret: ${secret.name}`);
    } else {
      throw error;
    }
  }
}

// Main execution
async function main() {
  console.log('🔐 Starting GCP Secret Manager Sync...\n');
  console.log(`📦 Project: ${PROJECT_ID}`);
  console.log(`🌐 Target Domain: ${PRODUCTION_DOMAIN}\n`);
  
  const client = new SecretManagerServiceClient();
  const secrets = await getSecretsToSync();
  
  console.log(`📝 Found ${secrets.length} secrets to sync\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const secret of secrets) {
    try {
      await createOrUpdateSecret(client, secret);
      successCount++;
    } catch (error: any) {
      console.error(`❌ Failed to sync ${secret.name}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n✨ Sync complete!`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  
  if (errorCount === 0) {
    console.log('\n🚀 Ready to deploy to Cloud Run');
  }
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
