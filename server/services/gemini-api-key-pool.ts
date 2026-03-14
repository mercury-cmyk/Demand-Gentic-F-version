/**
 * Gemini API Key Pool — Multi-account load distribution for native voice concurrency
 *
 * Securely distributes Gemini Live voice calls across multiple Google Cloud accounts.
 * VM hosting is decoupled from API usage — one account hosts the VM while others
 * provide API quota for voice calls.
 *
 * Architecture:
 *  - Accounts loaded from DB with poolEnabled=true
 *  - Least-loaded selection with priority weighting
 *  - Each account authenticates independently via its own service account
 *  - Token caching with TTL (tokens refresh before expiry)
 *  - Auto-failover: rate-limited keys disabled temporarily
 *  - Auto-reload: pool refreshes when accounts are added/updated/removed
 *  - Secure: service account keys decrypted in-memory, temp files cleaned up
 *
 * Pool Roles:
 *  - "host"     = VM infrastructure account (GCS, Compute, etc.) — also provides API
 *  - "api_only" = Only provides Gemini API quota — no infra access
 *  - "full"     = Both infrastructure and API (same as host + api_only)
 */

import { db } from "../db";
import { googleCloudAccounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { GoogleAuth } from "google-auth-library";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

const LOG_PREFIX = "[GeminiKeyPool]";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

export interface PooledKey {
  accountId: string;
  accountName: string;
  projectId: string;
  location: string;
  geminiApiKey: string | null;
  serviceAccountJson: string | null;
  poolRole: string;
  poolPriority: number;
  // Runtime state
  activeSessions: number;
  maxSessions: number;
  totalUsed: number;
  totalErrors: number;
  failureCount: number;      // consecutive failures (resets on success)
  lastFailureAt: number | null;
  disabledUntil: number | null;
  lastUsedAt: number | null;
  // Auth (for Vertex AI)
  googleAuth: GoogleAuth | null;
  tempKeyPath: string | null;
  cachedToken: CachedToken | null;
}

export interface AcquiredSlot {
  accountId: string;
  accountName: string;
  projectId: string;
  location: string;
  apiKey: string | null;
  useVertexAI: boolean;
  poolRole: string;
  getAccessToken: () => Promise<string>;
  release: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pool Implementation
// ═══════════════════════════════════════════════════════════════════════════

class GeminiApiKeyPool {
  private keys: PooledKey[] = [];
  private loaded = false;
  private reloadTimer: ReturnType<typeof setInterval> | null = null;
  private lastReloadAt = 0;

  // Configurable
  private defaultMaxSessions: number;
  private failureCooldownMs: number;
  private maxConsecutiveFailures: number;
  private tokenTtlMs: number;     // how long to cache access tokens
  private reloadIntervalMs: number; // auto-reload from DB interval

  constructor() {
    this.defaultMaxSessions = parseInt(process.env.GEMINI_MAX_SESSIONS_PER_KEY || "20", 10);
    this.failureCooldownMs = parseInt(process.env.GEMINI_KEY_COOLDOWN_MS || "60000", 10);
    this.maxConsecutiveFailures = parseInt(process.env.GEMINI_KEY_MAX_FAILURES || "5", 10);
    this.tokenTtlMs = parseInt(process.env.GEMINI_TOKEN_TTL_MS || "2700000", 10); // 45 min (tokens last 60 min)
    this.reloadIntervalMs = parseInt(process.env.GEMINI_POOL_RELOAD_MS || "300000", 10); // 5 min
  }

  /**
   * Start periodic auto-reload from DB (picks up new accounts automatically).
   */
  startAutoReload(): void {
    if (this.reloadTimer) return;
    this.reloadTimer = setInterval(() => {
      this.reload().catch(err => {
        console.error(`${LOG_PREFIX} Auto-reload failed:`, err.message);
      });
    }, this.reloadIntervalMs);
    console.log(`${LOG_PREFIX} Auto-reload started (interval: ${this.reloadIntervalMs / 1000}s)`);
  }

  stopAutoReload(): void {
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  /**
   * Load/reload keys from all pool-enabled GCP accounts.
   * Preserves runtime state (active sessions, counters) for existing accounts.
   */
  async reload(): Promise<void> {
    try {
      const accounts = await db
        .select()
        .from(googleCloudAccounts);

      const existingMap = new Map(this.keys.map(k => [k.accountId, k]));

      const newKeys: PooledKey[] = accounts
        .filter(a => {
          // Must have pool enabled and at least one auth method
          const enabled = a.poolEnabled !== false; // default true for backwards compat
          const hasAuth = !!a.projectId || !!a.geminiApiKey;
          return enabled && hasAuth;
        })
        .map(a => {
          const existing = existingMap.get(a.id);
          const maxSessions = (a as any).poolMaxSessions || this.defaultMaxSessions;
          return {
            accountId: a.id,
            accountName: a.name,
            projectId: a.projectId,
            location: a.location || "us-central1",
            geminiApiKey: a.geminiApiKey || null,
            serviceAccountJson: a.serviceAccountJson || null,
            poolRole: (a as any).poolRole || "api_only",
            poolPriority: (a as any).poolPriority || 0,
            // Preserve runtime state
            activeSessions: existing?.activeSessions || 0,
            maxSessions,
            totalUsed: existing?.totalUsed || 0,
            totalErrors: existing?.totalErrors || 0,
            failureCount: existing?.failureCount || 0,
            lastFailureAt: existing?.lastFailureAt || null,
            disabledUntil: existing?.disabledUntil || null,
            lastUsedAt: existing?.lastUsedAt || null,
            googleAuth: existing?.googleAuth || null,
            tempKeyPath: existing?.tempKeyPath || null,
            cachedToken: existing?.cachedToken || null,
          };
        })
        // Sort by priority (highest first), then by name for stability
        .sort((a, b) => b.poolPriority - a.poolPriority || a.accountName.localeCompare(b.accountName));

      // Clean up temp files for removed accounts
      for (const [id, existing] of existingMap) {
        if (!newKeys.find(k => k.accountId === id) && existing.tempKeyPath) {
          try { fs.unlinkSync(existing.tempKeyPath); } catch (_) {}
        }
      }

      this.keys = newKeys;
      this.loaded = true;
      this.lastReloadAt = Date.now();

      const totalCapacity = this.keys.reduce((s, k) => s + k.maxSessions, 0);
      console.log(
        `${LOG_PREFIX} Pool reloaded: ${this.keys.length} account(s), ` +
        `total capacity: ${totalCapacity} sessions. ` +
        `Accounts: ${this.keys.map(k => `${k.accountName}[${k.poolRole},${k.maxSessions}]`).join(", ")}`
      );

      // Start auto-reload if not already running
      this.startAutoReload();
    } catch (err: any) {
      console.error(`${LOG_PREFIX} Failed to load keys:`, err.message);
      if (this.keys.length === 0) {
        this.loadFromEnv();
      }
    }
  }

  /**
   * Fallback: load from environment variables if DB is unavailable.
   */
  private loadFromEnv(): void {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || "";

    if (!apiKey && !projectId) {
      console.warn(`${LOG_PREFIX} No API keys available from DB or env`);
      return;
    }

    this.keys = [{
      accountId: "env-default",
      accountName: "Environment Default",
      projectId,
      location: process.env.VERTEX_AI_LOCATION || "us-central1",
      geminiApiKey: apiKey || null,
      serviceAccountJson: null,
      poolRole: "full",
      poolPriority: 0,
      activeSessions: 0,
      maxSessions: this.defaultMaxSessions,
      totalUsed: 0,
      totalErrors: 0,
      failureCount: 0,
      lastFailureAt: null,
      disabledUntil: null,
      lastUsedAt: null,
      googleAuth: null,
      tempKeyPath: null,
      cachedToken: null,
    }];

    this.loaded = true;
    console.log(`${LOG_PREFIX} Loaded 1 key from environment variables (fallback)`);
  }

  /**
   * Acquire a slot from the pool using least-loaded selection with priority.
   *
   * Selection algorithm:
   *  1. Filter out disabled and at-capacity keys
   *  2. Sort by: priority (desc) → load ratio (asc) → total used (asc)
   *  3. Pick the best candidate
   */
  async acquire(): Promise<AcquiredSlot> {
    if (!this.loaded) {
      await this.reload();
    }

    if (this.keys.length === 0) {
      throw new Error("No Gemini API keys available in pool");
    }

    const now = Date.now();

    // Collect eligible keys
    const candidates: PooledKey[] = [];

    for (const key of this.keys) {
      // Re-enable if cooldown passed
      if (key.disabledUntil && now >= key.disabledUntil) {
        key.disabledUntil = null;
        key.failureCount = 0;
        console.log(`${LOG_PREFIX} Re-enabled: ${key.accountName} (cooldown expired)`);
      }

      // Skip disabled
      if (key.disabledUntil && now < key.disabledUntil) continue;

      // Skip at capacity
      if (key.activeSessions >= key.maxSessions) continue;

      candidates.push(key);
    }

    if (candidates.length === 0) {
      const status = this.keys.map(k =>
        `${k.accountName}: ${k.activeSessions}/${k.maxSessions}` +
        `${k.disabledUntil ? ` (disabled until ${new Date(k.disabledUntil).toISOString()})` : ""}`
      ).join(" | ");
      throw new Error(`All Gemini API keys at capacity or disabled. Pool: ${status}`);
    }

    // Least-loaded selection: sort by priority desc, then load ratio asc
    candidates.sort((a, b) => {
      // Higher priority first
      if (a.poolPriority !== b.poolPriority) return b.poolPriority - a.poolPriority;
      // Lower load ratio first
      const loadA = a.activeSessions / a.maxSessions;
      const loadB = b.activeSessions / b.maxSessions;
      if (loadA !== loadB) return loadA - loadB;
      // Fewer total uses first (spread load over time)
      return a.totalUsed - b.totalUsed;
    });

    const key = candidates[0];
    key.activeSessions++;
    key.totalUsed++;
    key.lastUsedAt = now;

    const useVertexAI = !!key.projectId;
    const loadPct = Math.round((key.activeSessions / key.maxSessions) * 100);

    console.log(
      `${LOG_PREFIX} ✅ Acquired: ${key.accountName} [${key.poolRole}] ` +
      `(${key.activeSessions}/${key.maxSessions}, ${loadPct}% load, ` +
      `pool: ${this.getActiveCount()}/${this.getTotalCapacity()} total)`
    );

    return {
      accountId: key.accountId,
      accountName: key.accountName,
      projectId: key.projectId,
      location: key.location,
      apiKey: key.geminiApiKey,
      useVertexAI,
      poolRole: key.poolRole,
      getAccessToken: () => this.getAccessTokenForKey(key),
      release: () => {
        key.activeSessions = Math.max(0, key.activeSessions - 1);
        const newLoadPct = Math.round((key.activeSessions / key.maxSessions) * 100);
        console.log(
          `${LOG_PREFIX} 🔓 Released: ${key.accountName} ` +
          `(${key.activeSessions}/${key.maxSessions}, ${newLoadPct}% load)`
        );
      },
    };
  }

  /**
   * Report a failure (rate limit, auth error, etc.).
   * After N consecutive failures, key is disabled for cooldown period.
   */
  reportFailure(accountId: string, error?: string): void {
    const key = this.keys.find(k => k.accountId === accountId);
    if (!key) return;

    key.failureCount++;
    key.totalErrors++;
    key.lastFailureAt = Date.now();

    // Invalidate cached token on auth errors
    if (error && (error.includes('401') || error.includes('403') || error.includes('UNAUTHENTICATED'))) {
      key.cachedToken = null;
      key.googleAuth = null; // Force re-auth
      console.warn(`${LOG_PREFIX} Auth failure for ${key.accountName} — cleared token cache`);
    }

    if (key.failureCount >= this.maxConsecutiveFailures) {
      key.disabledUntil = Date.now() + this.failureCooldownMs;
      console.warn(
        `${LOG_PREFIX} ⛔ DISABLED: ${key.accountName} for ${this.failureCooldownMs / 1000}s ` +
        `(${key.failureCount} consecutive failures)${error ? `. Last error: ${error}` : ""}`
      );
    } else {
      console.warn(
        `${LOG_PREFIX} ⚠️ Failure ${key.failureCount}/${this.maxConsecutiveFailures} ` +
        `for ${key.accountName}${error ? `: ${error}` : ""}`
      );
    }
  }

  /** Report success — resets consecutive failure count. */
  reportSuccess(accountId: string): void {
    const key = this.keys.find(k => k.accountId === accountId);
    if (!key) return;
    if (key.failureCount > 0) {
      console.log(`${LOG_PREFIX} ✅ ${key.accountName} recovered (was at ${key.failureCount} failures)`);
    }
    key.failureCount = 0;
  }

  /** Get total active sessions across all keys. */
  getActiveCount(): number {
    return this.keys.reduce((s, k) => s + k.activeSessions, 0);
  }

  /** Get total capacity across all keys. */
  getTotalCapacity(): number {
    return this.keys.reduce((s, k) => s + k.maxSessions, 0);
  }

  /** Pool stats for monitoring dashboard. */
  getStats() {
    const now = Date.now();
    return {
      totalKeys: this.keys.length,
      totalCapacity: this.getTotalCapacity(),
      totalActive: this.getActiveCount(),
      totalUsed: this.keys.reduce((s, k) => s + k.totalUsed, 0),
      totalErrors: this.keys.reduce((s, k) => s + k.totalErrors, 0),
      utilizationPct: this.getTotalCapacity() > 0
        ? Math.round((this.getActiveCount() / this.getTotalCapacity()) * 100)
        : 0,
      lastReloadAt: this.lastReloadAt ? new Date(this.lastReloadAt).toISOString() : null,
      autoReloadEnabled: !!this.reloadTimer,
      keys: this.keys.map(k => ({
        accountId: k.accountId,
        accountName: k.accountName,
        projectId: k.projectId,
        poolRole: k.poolRole,
        poolPriority: k.poolPriority,
        activeSessions: k.activeSessions,
        maxSessions: k.maxSessions,
        utilizationPct: k.maxSessions > 0 ? Math.round((k.activeSessions / k.maxSessions) * 100) : 0,
        totalUsed: k.totalUsed,
        totalErrors: k.totalErrors,
        failureCount: k.failureCount,
        healthy: !k.disabledUntil || now >= k.disabledUntil,
        disabled: k.disabledUntil ? now < k.disabledUntil : false,
        disabledUntil: k.disabledUntil && now < k.disabledUntil
          ? new Date(k.disabledUntil).toISOString() : null,
        lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
        hasServiceAccount: !!k.serviceAccountJson,
        hasApiKey: !!k.geminiApiKey,
        authMethod: k.projectId ? "vertex_ai" : "api_key",
      })),
    };
  }

  /**
   * Get a Vertex AI access token for a specific key.
   * Tokens are cached and refreshed before expiry.
   */
  private async getAccessTokenForKey(key: PooledKey): Promise<string> {
    // Return cached token if still valid (with 5 min safety margin)
    if (key.cachedToken && Date.now() < key.cachedToken.expiresAt - 300000) {
      return key.cachedToken.token;
    }

    // Create GoogleAuth if needed
    if (!key.googleAuth) {
      if (key.serviceAccountJson && key.accountId !== "env-default") {
        try {
          const { decryptJson } = await import("../lib/encryption");
          const saJson = decryptJson(key.serviceAccountJson);

          // Write temp file with random suffix for security
          const suffix = crypto.randomBytes(4).toString('hex');
          const tmpFile = path.join(os.tmpdir(), `gpool-${suffix}.json`);
          fs.writeFileSync(tmpFile, saJson, { mode: 0o600 });
          key.tempKeyPath = tmpFile;

          key.googleAuth = new GoogleAuth({
            keyFile: tmpFile,
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
            projectId: key.projectId,
          });

          console.log(`${LOG_PREFIX} Initialized auth for ${key.accountName} via service account`);
        } catch (err: any) {
          console.warn(`${LOG_PREFIX} SA init failed for ${key.accountName}, using ADC:`, err.message);
          key.googleAuth = new GoogleAuth({
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
          });
        }
      } else {
        // Use Application Default Credentials (from GOOGLE_APPLICATION_CREDENTIALS)
        key.googleAuth = new GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
      }
    }

    const token = await key.googleAuth.getAccessToken();
    if (!token) {
      throw new Error(`Failed to get access token for ${key.accountName}`);
    }

    // Cache the token
    key.cachedToken = {
      token,
      expiresAt: Date.now() + this.tokenTtlMs,
    };

    return token;
  }

  /**
   * Clean up all temp files and auth state.
   */
  destroy(): void {
    this.stopAutoReload();
    for (const key of this.keys) {
      if (key.tempKeyPath) {
        try { fs.unlinkSync(key.tempKeyPath); } catch (_) {}
      }
    }
    this.keys = [];
    this.loaded = false;
  }
}

// Singleton
export const geminiApiKeyPool = new GeminiApiKeyPool();
