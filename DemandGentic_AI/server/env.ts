import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

const inferredManagedRuntime = Boolean(
  process.env.K_SERVICE ||
  process.env.CLOUD_RUN_JOB ||
  process.env.FUNCTION_TARGET
);

const NODE_ENV = (
  process.env.NODE_ENV ||
  (inferredManagedRuntime ? "production" : "development")
).toLowerCase();

function isTruthy(value: string | undefined): boolean {
  return String(value || "").toLowerCase() === "true";
}

function loadEnvironmentFiles(): void {
  const cwd = process.cwd();
  const shellProvidedKeys = new Set(Object.keys(process.env));
  const candidates = [
    ".env",
    `.env.${NODE_ENV}`,
    ".env.local",
    `.env.${NODE_ENV}.local`,
  ].map((file) => path.resolve(cwd, file));

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;

    const parsed = dotenv.parse(fs.readFileSync(envPath));

    for (const [key, value] of Object.entries(parsed)) {
      if (shellProvidedKeys.has(key)) continue;
      process.env[key] = value;
    }
  }
}

function assertDevelopmentIsolation(): void {
  if (NODE_ENV !== "development") return;
  if (process.env.STRICT_ENV_ISOLATION === "false") return;

  const issues: string[] = [];

  if (!process.env.DATABASE_URL_DEV) {
    issues.push("DATABASE_URL_DEV is required when NODE_ENV is development.");
  }

  const resolvedDevDbUrl = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL || "";
  if (
    resolvedDevDbUrl &&
    process.env.DATABASE_URL_PROD &&
    resolvedDevDbUrl === process.env.DATABASE_URL_PROD &&
    !isTruthy(process.env.ALLOW_DEV_PROD_DB)
  ) {
    issues.push("Development database resolves to DATABASE_URL_PROD. Use an isolated DATABASE_URL_DEV.");
  }

  const allowSharedRedisInDev = isTruthy(process.env.ALLOW_SHARED_REDIS_IN_DEV);
  const resolvedDevRedisUrl =
    process.env.REDIS_URL_DEV || (allowSharedRedisInDev ? process.env.REDIS_URL : "");
  if (
    resolvedDevRedisUrl &&
    process.env.REDIS_URL_PROD &&
    resolvedDevRedisUrl === process.env.REDIS_URL_PROD &&
    !isTruthy(process.env.ALLOW_DEV_PROD_REDIS)
  ) {
    issues.push("Development Redis resolves to REDIS_URL_PROD. Use an isolated REDIS_URL_DEV.");
  }

  const endpointFields = ["PUBLIC_WEBHOOK_HOST", "PUBLIC_WEBSOCKET_URL", "TELNYX_WEBHOOK_URL"] as const;
  const blockedMarkers = (process.env.PRODUCTION_HOST_DENYLIST || "demandgentic.ai,.run.app")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (!isTruthy(process.env.ALLOW_DEV_PROD_ENDPOINTS)) {
    for (const field of endpointFields) {
      const value = String(process.env[field] || "").toLowerCase();
      if (!value) continue;

      for (const marker of blockedMarkers) {
        if (value.includes(marker)) {
          issues.push(`${field} appears to target a production host (${marker}).`);
          break;
        }
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `[EnvIsolation] Refusing to start in ${NODE_ENV} due to unsafe shared config:\n- ${issues.join("\n- ")}`
    );
  }
}

loadEnvironmentFiles();
assertDevelopmentIsolation();

const envSchema = z.object({
  TELNYX_API_KEY: z.string().optional(),
  TELNYX_FROM_NUMBER: z.string().optional(),
  TELNYX_TEXML_APP_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GCP_PROJECT_ID: z.string().optional(),
  PUBLIC_WEBHOOK_HOST: z.string().optional(),
  PUBLIC_WEBSOCKET_URL: z.string().optional(),
  VOICE_PROVIDER: z.string().optional(),
  REPLIT_DEV_DOMAIN: z.string().optional(),
});

export let envValidationErrors: string[] = [];

try {
  envSchema.parse(process.env);

  const criticalVars = ["TELNYX_API_KEY", "TELNYX_FROM_NUMBER", "TELNYX_TEXML_APP_ID"];
  const missingCritical = criticalVars.filter((key) => !process.env[key]);

  if (missingCritical.length > 0) {
    envValidationErrors = [...missingCritical];
    console.error("[Env] Missing critical environment variables:", missingCritical.join(", "));
    console.error("[Env] Voice calling features will stay disabled until configured.");
  }

  if (!process.env.GOOGLE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
    envValidationErrors.push("GOOGLE_AI_API_KEY or GEMINI_API_KEY");
    console.error("[Env] Missing GOOGLE_AI_API_KEY or GEMINI_API_KEY.");
  }

  if (envValidationErrors.length === 0) {
    console.log("[Env] Environment variables validated successfully.");
  } else {
    console.log("[Env] Server starting with missing optional env vars.");
  }
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("[Env] Schema validation error:", error.format());
    envValidationErrors.push("Schema validation failed");
  } else {
    throw error;
  }
}

export const env = process.env;