
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env (shared for local and production)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  // Telnyx - now optional with warnings (allow server to start for Cloud Run healthcheck)
  TELNYX_API_KEY: z.string().optional(),
  TELNYX_FROM_NUMBER: z.string().optional(),
  TELNYX_TEXML_APP_ID: z.string().optional(),

  // Voice Providers
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  
  // Google Cloud
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GCP_PROJECT_ID: z.string().optional(),

  // Webhook and WebSocket
  PUBLIC_WEBHOOK_HOST: z.string().optional(),
  PUBLIC_WEBSOCKET_URL: z.string().optional(),
  
  // Default Voice Provider
  VOICE_PROVIDER: z.string().optional(),

  // Replit-specific (optional)
  REPLIT_DEV_DOMAIN: z.string().optional(),

});

// Track environment validation status for runtime checks
export let envValidationErrors: string[] = [];

try {
  const parsedEnv = envSchema.parse(process.env);
  
  // Check for critical missing vars (warn but don't exit - allow healthcheck to pass)
  const criticalVars = ['TELNYX_API_KEY', 'TELNYX_FROM_NUMBER', 'TELNYX_TEXML_APP_ID'];
  const missingCritical = criticalVars.filter(v => !process.env[v]);
  
  if (missingCritical.length > 0) {
    envValidationErrors = missingCritical;
    console.error("⚠️  Missing critical environment variables:", missingCritical.join(', '));
    console.error("   Voice calling features will not work until these are configured.");
  }
  
  // Check for at least one Google AI key
  if (!process.env.GOOGLE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
    envValidationErrors.push('GOOGLE_AI_API_KEY or GEMINI_API_KEY');
    console.error("⚠️  Missing GOOGLE_AI_API_KEY or GEMINI_API_KEY - Google voice provider won't work.");
  }
  
  if (envValidationErrors.length === 0) {
    console.log("✅ Environment variables validated successfully.");
  } else {
    console.log("⚠️  Server starting with missing env vars (see warnings above).");
  }
  
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("❌ Environment validation error:", error.format());
    // DON'T exit - let server start so Cloud Run healthcheck passes and we can see logs
    envValidationErrors.push('Schema validation failed');
  }
}

// Re-export process.env for existing code that uses it directly
export const env = process.env;
