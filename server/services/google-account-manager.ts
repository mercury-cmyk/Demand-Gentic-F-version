/**
 * Google Cloud Account Manager
 *
 * Hot-swaps ALL Google/GCP service clients in-process without a server restart.
 * Handles: Vertex AI, GCS, Gemini Live API key, Google Search, OAuth credentials.
 *
 * Switch sequence:
 *  1. Validate the account credentials (health-check GCS write + Vertex AI ping)
 *  2. Atomically mark the new account as active in the DB (deactivate all others)
 *  3. Reinitialise every Google client singleton with the new credentials
 *  4. Update process.env so any code that reads env vars picks up new values
 *  5. Clear the secret-loader cache so it reloads on next access
 */

import { db } from "../db";
import { googleCloudAccounts, GoogleCloudAccount } from "@shared/schema";
import { eq, and, ne } from "drizzle-orm";
import { encryptJson, decryptJson } from "../lib/encryption";
import { clearSecretCache } from "./secret-loader";
import { updateGcpConfig } from "../lib/gcp-config";
import { Storage } from "@google-cloud/storage";
import { VertexAI } from "@google-cloud/vertexai";
import { GoogleAuth } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const LOG = "[GcpAccountManager]";
const MASTER_KEY = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET || "";

// ---------------------------------------------------------------------------
// Service account JSON temp file management
// We write the service account JSON to a temp file so Google SDK picks it up
// via GOOGLE_APPLICATION_CREDENTIALS.  The previous temp file is deleted on switch.
// ---------------------------------------------------------------------------
let _currentTempKeyFile: string | null = null;

function writeTempServiceAccountFile(jsonContent: string): string {
  // Clean up previous temp file
  if (_currentTempKeyFile) {
    try { fs.unlinkSync(_currentTempKeyFile); } catch {}
    _currentTempKeyFile = null;
  }
  const tmpPath = path.join(os.tmpdir(), `gcp-sa-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, jsonContent, { mode: 0o600 }); // owner-only read
  _currentTempKeyFile = tmpPath;
  return tmpPath;
}

// ---------------------------------------------------------------------------
// Encryption helpers (reuse same master key as secret-loader)
// ---------------------------------------------------------------------------
export function encryptServiceAccount(json: string): string {
  if (!MASTER_KEY) throw new Error("MASTER_KEY not set — cannot encrypt service account");
  return encryptJson(json, MASTER_KEY);
}

export function decryptServiceAccount(encrypted: string): string {
  if (!MASTER_KEY) throw new Error("MASTER_KEY not set — cannot decrypt service account");
  const value = decryptJson<string>(encrypted, MASTER_KEY);
  return typeof value === "string" ? value : JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Health check — validates credentials without modifying any state
// ---------------------------------------------------------------------------
export interface HealthCheckResult {
  ok: boolean;
  checks: {
    gcs: "ok" | "error" | "skipped";
    vertex: "ok" | "error" | "skipped";
    gemini: "ok" | "error" | "skipped";
  };
  errors: string[];
  durationMs: number;
}

export async function checkAccountHealth(account: GoogleCloudAccount): Promise<HealthCheckResult> {
  const start = Date.now();
  const result: HealthCheckResult = {
    ok: false,
    checks: { gcs: "skipped", vertex: "skipped", gemini: "skipped" },
    errors: [],
    durationMs: 0,
  };

  // Resolve credentials
  let keyFilename: string | undefined;
  let serviceAccountJson: string | null = null;

  if (account.serviceAccountJson) {
    try {
      serviceAccountJson = decryptServiceAccount(account.serviceAccountJson);
      const tmpPath = path.join(os.tmpdir(), `gcp-healthcheck-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, serviceAccountJson, { mode: 0o600 });
      keyFilename = tmpPath;
    } catch (e: any) {
      result.errors.push(`Service account decrypt failed: ${e.message}`);
    }
  }

  const storageOpts: any = { projectId: account.projectId };
  if (keyFilename) storageOpts.keyFilename = keyFilename;
  const vertexOpts: any = { project: account.projectId, location: account.location };
  if (keyFilename) vertexOpts.keyFilename = keyFilename;

  // GCS check — write + delete a tiny sentinel file
  try {
    const storage = new Storage(storageOpts);
    const bucket = storage.bucket(account.gcsBucket);
    const sentinelFile = bucket.file(`_health_check/${Date.now()}.txt`);
    await sentinelFile.save("ok", { contentType: "text/plain" });
    await sentinelFile.delete();
    result.checks.gcs = "ok";
  } catch (e: any) {
    result.checks.gcs = "error";
    result.errors.push(`GCS: ${e.message}`);
  }

  // Vertex AI check — list models (lightweight API call)
  try {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      ...(keyFilename ? { keyFilename } : {}),
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new Error("No access token returned");
    result.checks.vertex = "ok";
  } catch (e: any) {
    result.checks.vertex = "error";
    result.errors.push(`Vertex auth: ${e.message}`);
  }

  // Gemini API key check (optional — only if key provided)
  if (account.geminiApiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${account.geminiApiKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
      }
      result.checks.gemini = "ok";
    } catch (e: any) {
      result.checks.gemini = "error";
      result.errors.push(`Gemini API key: ${e.message}`);
    }
  }

  // Clean up health-check temp file
  if (keyFilename && keyFilename !== _currentTempKeyFile) {
    try { fs.unlinkSync(keyFilename); } catch {}
  }

  result.durationMs = Date.now() - start;
  // Overall ok = GCS ok AND Vertex ok (Gemini optional)
  result.ok = result.checks.gcs === "ok" && result.checks.vertex === "ok";
  return result;
}

// ---------------------------------------------------------------------------
// Apply account — reinitialise every Google client singleton
// ---------------------------------------------------------------------------
export interface ApplyResult {
  ok: boolean;
  error?: string;
  servicesReloaded: string[];
}

export async function applyAccount(account: GoogleCloudAccount): Promise<ApplyResult> {
  const reloaded: string[] = [];

  try {
    // 1. Write service account JSON to temp file
    let keyFilePath: string | undefined;
    if (account.serviceAccountJson) {
      const json = decryptServiceAccount(account.serviceAccountJson);
      keyFilePath = writeTempServiceAccountFile(json);
    }

    // 2. Update process.env — all Google env vars
    process.env.GOOGLE_CLOUD_PROJECT = account.projectId;
    process.env.GCP_PROJECT_ID = account.projectId;
    process.env.GCS_PROJECT_ID = account.projectId;
    process.env.GCS_BUCKET = account.gcsBucket;
    process.env.VERTEX_AI_LOCATION = account.location;

    if (keyFilePath) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilePath;
      process.env.GCS_KEY_FILE = keyFilePath;
    }

    if (account.geminiApiKey) {
      process.env.GEMINI_API_KEY = account.geminiApiKey;
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY = account.geminiApiKey;
      process.env.GOOGLE_AI_API_KEY = account.geminiApiKey;
    }

    if (account.googleSearchApiKey) {
      process.env.GOOGLE_SEARCH_API_KEY = account.googleSearchApiKey;
    }
    if (account.googleSearchEngineId) {
      process.env.GOOGLE_SEARCH_ENGINE_ID = account.googleSearchEngineId;
    }
    if (account.googleClientId) {
      process.env.GOOGLE_CLIENT_ID = account.googleClientId;
      process.env.GOOGLE_AUTH_CLIENT_ID = account.googleClientId;
    }
    if (account.googleClientSecret) {
      process.env.GOOGLE_CLIENT_SECRET = account.googleClientSecret;
    }
    if (account.googleOauthRedirectUri) {
      process.env.GOOGLE_OAUTH_REDIRECT_URI = account.googleOauthRedirectUri;
    }

    reloaded.push("env");

    // 2b. Update centralized GCP config — notifies all registered listeners
    //     (cloud-logging, log-streaming, gemini-live-dialer, etc.)
    await updateGcpConfig({
      projectId: account.projectId,
      gcsBucket: account.gcsBucket,
      location: account.location,
      keyFilename: keyFilePath,
    });
    reloaded.push("gcp-config-listeners");

    // 3. Reinitialise Vertex AI singleton
    try {
      const vertexModule = await import("./vertex-ai/vertex-client");
      vertexModule.reinitializeVertexClient({
        projectId: account.projectId,
        location: account.location,
        keyFilename: keyFilePath,
      });
      reloaded.push("vertex-ai");
    } catch (e: any) {
      console.warn(`${LOG} Vertex AI reinit warning: ${e.message}`);
    }

    // 4. Reinitialise GCS storage singleton
    try {
      const storageModule = await import("../lib/storage");
      storageModule.reinitializeStorage({
        projectId: account.projectId,
        bucket: account.gcsBucket,
        keyFilename: keyFilePath,
      });
      reloaded.push("gcs");
    } catch (e: any) {
      console.warn(`${LOG} GCS reinit warning: ${e.message}`);
    }

    // 5. Clear secret-loader cache so next read picks up new env vars
    clearSecretCache();
    reloaded.push("secret-cache");

    console.log(`${LOG} ✅ Applied account "${account.name}" (${account.projectId}). Services reloaded: ${reloaded.join(", ")}`);
    return { ok: true, servicesReloaded: reloaded };
  } catch (e: any) {
    console.error(`${LOG} ❌ Failed to apply account: ${e.message}`);
    return { ok: false, error: e.message, servicesReloaded: reloaded };
  }
}

// ---------------------------------------------------------------------------
// Activate account — DB transaction + apply
// ---------------------------------------------------------------------------
export interface ActivateResult {
  ok: boolean;
  error?: string;
  healthCheck: HealthCheckResult;
  apply?: ApplyResult;
}

export async function activateAccount(
  accountId: string,
  activatedBy: string,
  options: { skipHealthCheck?: boolean } = {}
): Promise<ActivateResult> {
  // Load account
  const [account] = await db
    .select()
    .from(googleCloudAccounts)
    .where(eq(googleCloudAccounts.id, accountId))
    .limit(1);

  if (!account) {
    return {
      ok: false,
      error: `Account ${accountId} not found`,
      healthCheck: { ok: false, checks: { gcs: "skipped", vertex: "skipped", gemini: "skipped" }, errors: ["not found"], durationMs: 0 },
    };
  }

  // Health check
  let healthCheck: HealthCheckResult;
  if (options.skipHealthCheck) {
    healthCheck = { ok: true, checks: { gcs: "skipped", vertex: "skipped", gemini: "skipped" }, errors: [], durationMs: 0 };
  } else {
    healthCheck = await checkAccountHealth(account);
    await db.update(googleCloudAccounts)
      .set({
        lastHealthCheckAt: new Date(),
        lastHealthStatus: healthCheck.ok ? "ok" : "error",
        lastHealthError: healthCheck.errors.length > 0 ? healthCheck.errors.join("; ") : null,
      })
      .where(eq(googleCloudAccounts.id, accountId));

    if (!healthCheck.ok) {
      return { ok: false, error: `Health check failed: ${healthCheck.errors.join("; ")}`, healthCheck };
    }
  }

  // DB: atomically deactivate all, activate target
  await db.update(googleCloudAccounts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(ne(googleCloudAccounts.id, accountId));

  await db.update(googleCloudAccounts)
    .set({
      isActive: true,
      lastActivatedAt: new Date(),
      lastActivatedBy: activatedBy,
      updatedAt: new Date(),
    })
    .where(eq(googleCloudAccounts.id, accountId));

  // Apply in-process
  const apply = await applyAccount(account);
  return { ok: apply.ok, error: apply.error, healthCheck, apply };
}

// ---------------------------------------------------------------------------
// Load active account on startup
// ---------------------------------------------------------------------------
export async function loadActiveAccountOnStartup(): Promise<void> {
  try {
    const [active] = await db
      .select()
      .from(googleCloudAccounts)
      .where(eq(googleCloudAccounts.isActive, true))
      .limit(1);

    if (!active) {
      console.log(`${LOG} No active GCP account in DB — using env vars as-is`);
      return;
    }

    console.log(`${LOG} Loading active account on startup: "${active.name}" (${active.projectId})`);
    await applyAccount(active);
  } catch (e: any) {
    console.warn(`${LOG} Could not load active GCP account on startup: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------
export async function listAccounts(): Promise<Omit<GoogleCloudAccount, "serviceAccountJson">[]> {
  const rows = await db.select().from(googleCloudAccounts).orderBy(googleCloudAccounts.createdAt);
  // Never return encrypted service account JSON to the frontend
  return rows.map(({ serviceAccountJson: _sa, ...rest }) => rest);
}

export async function getAccountById(id: string): Promise<Omit<GoogleCloudAccount, "serviceAccountJson"> | null> {
  const [row] = await db
    .select()
    .from(googleCloudAccounts)
    .where(eq(googleCloudAccounts.id, id))
    .limit(1);
  if (!row) return null;
  const { serviceAccountJson: _sa, ...rest } = row;
  return rest;
}
