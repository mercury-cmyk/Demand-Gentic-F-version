
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local, .env, etc.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  // Telnyx
  TELNYX_API_KEY: z.string().min(1, "TELNYX_API_KEY is required"),
  TELNYX_FROM_NUMBER: z.string().min(1, "TELNYX_FROM_NUMBER is required"),
  TELNYX_TEXML_APP_ID: z.string().min(1, "TELNYX_TEXML_APP_ID is required"),

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

}).refine(data => data.GOOGLE_AI_API_KEY || data.GEMINI_API_KEY, {
  message: "Either GOOGLE_AI_API_KEY or GEMINI_API_KEY must be set for Google voice provider.",
  path: ["GEMINI_API_KEY"],
});

try {
  const parsedEnv = envSchema.parse(process.env);
  console.log("✅ Environment variables validated successfully.");
  
  // For convenience, you can export the parsed and validated environment variables
  // and import them in other files.
  // This is just an example, adapt it to your project structure.
  
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("❌ Invalid environment variables:", error.format());
    // Exit the process with an error code to prevent the app from running with invalid config
    process.exit(1);
  }
}

// Re-export process.env for existing code that uses it directly
export const env = process.env;
