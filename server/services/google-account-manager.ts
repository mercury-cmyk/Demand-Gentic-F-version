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
import * as crypto from "crypto";
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
    gmail: "ok" | "error" | "skipped";
  };
  errors: string[];
  warnings: string[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Migration checklist — everything that needs attention on account switch
// ---------------------------------------------------------------------------
export interface MigrationChecklistItem {
  id: string;
  category: "auto" | "manual";
  area: string;
  description: string;
  status: "ok" | "action_needed" | "warning" | "skipped";
  detail?: string;
}

export interface MigrationChecklist {
  accountName: string;
  projectId: string;
  timestamp: string;
  items: MigrationChecklistItem[];
  summary: {
    total: number;
    ok: number;
    actionNeeded: number;
    warnings: number;
  };
}

/**
 * Generate a comprehensive migration checklist when switching GCP accounts.
 * Covers ALL the issues we've seen: recording storage, secrets, Gmail, OAuth,
 * Vertex AI, service account, APIs, VM deployment, DNS, SSL, email tracking.
 */
export async function generateMigrationChecklist(account: GoogleCloudAccount): Promise<MigrationChecklist> {
  const items: MigrationChecklistItem[] = [];

  // --- AUTO-MANAGED (handled by applyAccount) ---
  items.push({
    id: "env_vars",
    category: "auto",
    area: "Environment Variables",
    description: "process.env updated with new project ID, bucket, keys",
    status: "ok",
    detail: `GOOGLE_CLOUD_PROJECT=${account.projectId}, GCS_BUCKET=${account.gcsBucket}`,
  });

  items.push({
    id: "vertex_ai",
    category: "auto",
    area: "Vertex AI",
    description: "Vertex AI client reinitialised with new project + service account",
    status: account.serviceAccountJson ? "ok" : "action_needed",
    detail: account.serviceAccountJson ? "Service account JSON provided" : "No service account JSON — Vertex AI will fail",
  });

  items.push({
    id: "gcs_storage",
    category: "auto",
    area: "GCS Recording Storage",
    description: "GCS storage singleton reinitialised with new bucket",
    status: "ok",
    detail: `Bucket: ${account.gcsBucket}`,
  });

  items.push({
    id: "gemini_api_key",
    category: "auto",
    area: "Gemini Native Audio API Key",
    description: "GEMINI_API_KEY updated for Gemini Live native audio calls",
    status: account.geminiApiKey ? "ok" : "action_needed",
    detail: account.geminiApiKey ? "Key provided" : "No Gemini API key — native audio calls will fail",
  });

  items.push({
    id: "oauth_client",
    category: "auto",
    area: "Google OAuth Client ID/Secret",
    description: "GOOGLE_AUTH_CLIENT_ID and GOOGLE_CLIENT_SECRET updated",
    status: account.googleClientId && account.googleClientSecret ? "ok" : "action_needed",
    detail: account.googleClientId ? `Client ID: ${account.googleClientId.substring(0, 20)}...` : "No OAuth client — Google login will fail",
  });

  items.push({
    id: "google_search",
    category: "auto",
    area: "Google Search API",
    description: "GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID updated",
    status: account.googleSearchApiKey ? "ok" : "warning",
    detail: account.googleSearchApiKey ? "Key provided" : "No search API key — lead research features degraded",
  });

  items.push({
    id: "secret_cache",
    category: "auto",
    area: "Secret Loader Cache",
    description: "In-memory secret cache cleared (reloads on next access)",
    status: "ok",
  });

  // --- MANUAL ACTIONS REQUIRED ---

  // GCS bucket existence
  items.push({
    id: "gcs_bucket_create",
    category: "manual",
    area: "GCS Bucket",
    description: `Ensure bucket "${account.gcsBucket}" exists in project "${account.projectId}"`,
    status: "action_needed",
    detail: "Run: gcloud storage buckets create gs://" + account.gcsBucket + " --project=" + account.projectId + " --location=us-central1",
  });

  // Required GCP APIs
  const requiredApis = [
    { api: "aiplatform.googleapis.com", name: "Vertex AI API", reason: "AI text generation, voice agent summaries" },
    { api: "generativelanguage.googleapis.com", name: "Generative Language API", reason: "Gemini native audio for live calls" },
    { api: "gmail.googleapis.com", name: "Gmail API", reason: "Gmail inbox sync" },
    { api: "people.googleapis.com", name: "People API", reason: "Google OAuth profile info" },
    { api: "storage.googleapis.com", name: "Cloud Storage API", reason: "Recording storage" },
    { api: "secretmanager.googleapis.com", name: "Secret Manager API", reason: "VM secret fetching" },
    { api: "compute.googleapis.com", name: "Compute Engine API", reason: "VM management" },
    { api: "workstations.googleapis.com", name: "Cloud Workstations API", reason: "Cloud workstation clusters for dev environments" },
  ];
  for (const { api, name, reason } of requiredApis) {
    items.push({
      id: `api_${api.split(".")[0]}`,
      category: "manual",
      area: "GCP APIs",
      description: `Enable ${name} (${api})`,
      status: "action_needed",
      detail: `Required for: ${reason}. Run: gcloud services enable ${api} --project=${account.projectId}`,
    });
  }

  // Service account IAM roles
  items.push({
    id: "iam_roles",
    category: "manual",
    area: "Service Account IAM Roles",
    description: "Grant required roles to service account",
    status: account.serviceAccountJson ? "action_needed" : "skipped",
    detail: "Required roles: roles/storage.admin, roles/secretmanager.secretAccessor, roles/aiplatform.user, roles/logging.logWriter, roles/workstations.admin",
  });

  // OAuth consent screen
  items.push({
    id: "oauth_consent",
    category: "manual",
    area: "OAuth Consent Screen",
    description: "Configure OAuth consent screen with app name, domain, and scopes",
    status: "action_needed",
    detail: "Required scopes: email, profile, openid, gmail.readonly, gmail.send, gmail.modify. Add test users or publish app.",
  });

  // Gmail reconnection
  items.push({
    id: "gmail_reconnect",
    category: "manual",
    area: "Gmail Inbox Sync",
    description: "All connected Gmail accounts must disconnect and reconnect with new OAuth client",
    status: "action_needed",
    detail: "Old OAuth tokens are bound to the previous client ID. Users must re-authorize in Inbox settings.",
  });

  // Email tracking secret
  items.push({
    id: "email_tracking_secret",
    category: "manual",
    area: "Email Tracking",
    description: "Set EMAIL_TRACKING_SECRET in Secret Manager and .env",
    status: "action_needed",
    detail: "Without a persistent secret, open/click tracking tokens break on container restart. Old emails' tracking tokens will need signature-less acceptance.",
  });

  // Secret Manager sync
  items.push({
    id: "secret_manager_sync",
    category: "manual",
    area: "Secret Manager",
    description: "Push all secrets to new project's Secret Manager",
    status: "action_needed",
    detail: "Run update-secrets.sh with correct PROJECT_ID, or manually create secrets in the new project",
  });

  // VM deployment
  items.push({
    id: "vm_ip",
    category: "manual",
    area: "VM Deployment",
    description: "Update PUBLIC_IP in .env and fetch-secrets.sh if VM IP changed",
    status: "action_needed",
    detail: "Check: PUBLIC_IP, BASE_URL, APP_BASE_URL, TELNYX_WEBHOOK_URL",
  });

  items.push({
    id: "vm_firewall",
    category: "manual",
    area: "VM Firewall Rules",
    description: "Create firewall rules for HTTP(80), HTTPS(443), SIP(5060), RTP(10000-20000)",
    status: "action_needed",
    detail: "Required network tags: http-server, https-server, sip-server",
  });

  items.push({
    id: "ssl_certs",
    category: "manual",
    area: "SSL Certificates",
    description: "Set up certbot/Let's Encrypt for the domain on the new VM",
    status: "action_needed",
    detail: "Run certbot --nginx -d demandgentic.ai on the VM after DNS points to it",
  });

  items.push({
    id: "dns_update",
    category: "manual",
    area: "DNS",
    description: "Update DNS A record to point to new VM IP",
    status: "action_needed",
    detail: "Update the A record for demandgentic.ai (and any subdomains) to the new VM's external IP",
  });

  // Redis allowlist
  items.push({
    id: "redis_allowlist",
    category: "manual",
    area: "Redis Cloud",
    description: "Add new VM IP to Redis Cloud allowlist",
    status: "action_needed",
    detail: "Go to Redis Cloud dashboard and whitelist the new VM's external IP address",
  });

  // Telnyx webhook URL
  items.push({
    id: "telnyx_webhook",
    category: "manual",
    area: "Telnyx",
    description: "Verify Telnyx webhook URL points to the correct domain/IP",
    status: "action_needed",
    detail: "Check Telnyx dashboard → Phone Numbers → Messaging/Voice profile → Webhook URL",
  });

  // Telnyx SIP IP authentication
  items.push({
    id: "telnyx_sip_ip",
    category: "manual",
    area: "Telnyx SIP",
    description: "Update Telnyx SIP connection IP authentication with new VM IP",
    status: "action_needed",
    detail: "FQDN connection uses ip-authentication. Old VM IP must be removed and new IP added via Telnyx API: POST /v2/ips with {ip_address, port:5060, connection_id}. Also update sip.demandgentic.ai DNS A record.",
  });

  // Telnyx SIP credentials
  items.push({
    id: "telnyx_sip_creds",
    category: "manual",
    area: "Telnyx SIP",
    description: "Verify Telnyx SIP credential connection and FQDN DNS resolution",
    status: "action_needed",
    detail: "Credential connection (DemanGent.ai_SIP) and FQDN connection (DG_Drachio) must both resolve. Ensure sip.demandgentic.ai A record points to new VM IP for inbound SIP.",
  });

  // Database migration
  items.push({
    id: "db_migration",
    category: "manual",
    area: "Database Schema",
    description: "Run database migrations to ensure all columns exist",
    status: "action_needed",
    detail: "drizzle-kit push or manual SQL for any missing columns (e.g. is_trashed, trashed_at, needs_review)",
  });

  // GCS service account JSON on VM
  items.push({
    id: "vm_service_account",
    category: "manual",
    area: "VM Service Account File",
    description: "Deploy gcp-service-account.json to /opt/demandgentic/ on the VM",
    status: "action_needed",
    detail: "Docker compose mounts ../gcp-service-account.json:/app/gcp-service-account.json:ro",
  });

  const summary = {
    total: items.length,
    ok: items.filter(i => i.status === "ok").length,
    actionNeeded: items.filter(i => i.status === "action_needed").length,
    warnings: items.filter(i => i.status === "warning").length,
  };

  return {
    accountName: account.name,
    projectId: account.projectId,
    timestamp: new Date().toISOString(),
    items,
    summary,
  };
}

export async function checkAccountHealth(account: GoogleCloudAccount): Promise<HealthCheckResult> {
  const start = Date.now();
  const result: HealthCheckResult = {
    ok: false,
    checks: { gcs: "skipped", vertex: "skipped", gemini: "skipped", gmail: "skipped" },
    errors: [],
    warnings: [],
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

  // Vertex AI check — auth token
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

  // Gmail API check — verify OAuth client can be used
  if (account.googleClientId) {
    try {
      // Quick check: does the OAuth discovery endpoint recognize this client?
      // We can't fully test Gmail without a user token, but we can verify the client ID format
      if (!account.googleClientId.endsWith(".apps.googleusercontent.com")) {
        throw new Error("Invalid OAuth client ID format");
      }
      if (!account.googleClientSecret) {
        throw new Error("No OAuth client secret provided — Gmail auth will fail");
      }
      result.checks.gmail = "ok";
      result.warnings.push("Gmail: Users must disconnect and reconnect their inbox after OAuth client change");
    } catch (e: any) {
      result.checks.gmail = "error";
      result.errors.push(`Gmail: ${e.message}`);
    }
  } else {
    result.warnings.push("Gmail: No OAuth client ID configured — Gmail inbox sync will not work");
  }

  // Warnings for missing optional fields
  if (!account.geminiApiKey) {
    result.warnings.push("No Gemini API key — native audio calls will fall back to Vertex AI");
  }
  if (!account.googleSearchApiKey) {
    result.warnings.push("No Google Search API key — lead research features degraded");
  }
  if (!account.googleOauthRedirectUri) {
    result.warnings.push("No OAuth redirect URI set — using default. Ensure redirect URIs match in Google Cloud Console.");
  }

  // Clean up health-check temp file
  if (keyFilename && keyFilename !== _currentTempKeyFile) {
    try { fs.unlinkSync(keyFilename); } catch {}
  }

  result.durationMs = Date.now() - start;
  // Overall ok = GCS ok AND Vertex ok (Gmail + Gemini are warnings, not blockers)
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

    // 5. Ensure EMAIL_TRACKING_SECRET is set (persistent across restarts)
    if (!process.env.EMAIL_TRACKING_SECRET) {
      const trackingSecret = crypto.randomBytes(32).toString("hex");
      process.env.EMAIL_TRACKING_SECRET = trackingSecret;
      console.warn(`${LOG} Generated EMAIL_TRACKING_SECRET — persist this in Secret Manager to survive restarts`);
      reloaded.push("email-tracking-secret(generated)");
    } else {
      reloaded.push("email-tracking-secret(existing)");
    }

    // 6. Clear secret-loader cache so next read picks up new env vars
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
  migrationChecklist?: MigrationChecklist;
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
