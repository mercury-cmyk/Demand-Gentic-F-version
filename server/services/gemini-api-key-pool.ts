/**
 * Gemini API Key Pool — Multi-account round-robin for native voice concurrency
 *
 * Distributes Gemini Live voice calls across multiple Google Cloud accounts
 * to increase concurrency limits. Each account has its own API key and
 * service account, with independent rate limits from Google.
 *
 * Architecture:
 *  - Keys are loaded from the googleCloudAccounts table (all rows, not just active)
 *  - Round-robin selection with concurrency tracking per key
 *  - Automatic failover: if a key hits rate limits, skip to next
 *  - Health tracking: keys that fail repeatedly are temporarily disabled
 *  - Hot-reload: pool refreshes from DB when accounts change
 */

import { db } from "../db";
import { googleCloudAccounts } from "@shared/schema";
import { GoogleAuth } from "google-auth-library";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const LOG_PREFIX = "[GeminiKeyPool]";

export interface PooledKey {
  accountId: string;
  accountName: string;
  projectId: string;
  location: string;
  geminiApiKey: string | null;
  serviceAccountJson: string | null;
  // Runtime state
  activeSessions: number;
  maxSessions: number;
  totalUsed: number;
  failureCount: number;
  lastFailureAt: number | null;
  disabledUntil: number | null;
  // Auth (for Vertex AI)
  googleAuth: GoogleAuth | null;
  tempKeyPath: string | null;
}

export interface AcquiredSlot {
  accountId: string;
  accountName: string;
  projectId: string;
  location: string;
  apiKey: string | null;
  useVertexAI: boolean;
  getAccessToken: () => Promise<string>;
  release: () => void;
}

class GeminiApiKeyPool {
  private keys: PooledKey[] = [];
  private roundRobinIndex = 0;
  private maxSessionsPerKey: number;
  private failureCooldownMs: number;
  private maxFailuresBeforeDisable: number;
  private loaded = false;

  constructor() {
    // Default: 20 sessions per key (Google's typical Gemini Live limit)
    this.maxSessionsPerKey = parseInt(process.env.GEMINI_MAX_SESSIONS_PER_KEY || "20", 10);
    this.failureCooldownMs = parseInt(process.env.GEMINI_KEY_COOLDOWN_MS || "60000", 10); // 1 min
    this.maxFailuresBeforeDisable = parseInt(process.env.GEMINI_KEY_MAX_FAILURES || "5", 10);
  }

  /**
   * Load keys from all GCP accounts in the database.
   * Called lazily on first acquire, or manually after account changes.
   */
  async reload(): Promise<void> {
    try {
      const accounts = await db
        .select()
        .from(googleCloudAccounts);

      // Keep existing runtime state for accounts that haven't changed
      const existingMap = new Map(this.keys.map(k => [k.accountId, k]));

      this.keys = accounts
        .filter(a => a.projectId || a.geminiApiKey) // Must have at least one auth method
        .map(a => {
          const existing = existingMap.get(a.id);
          return {
            accountId: a.id,
            accountName: a.name,
            projectId: a.projectId,
            location: a.location || "us-central1",
            geminiApiKey: a.geminiApiKey || null,
            serviceAccountJson: a.serviceAccountJson || null,
            // Preserve runtime state if account exists
            activeSessions: existing?.activeSessions || 0,
            maxSessions: this.maxSessionsPerKey,
            totalUsed: existing?.totalUsed || 0,
            failureCount: existing?.failureCount || 0,
            lastFailureAt: existing?.lastFailureAt || null,
            disabledUntil: existing?.disabledUntil || null,
            googleAuth: existing?.googleAuth || null,
            tempKeyPath: existing?.tempKeyPath || null,
          };
        });

      this.loaded = true;
      console.log(`${LOG_PREFIX} Loaded ${this.keys.length} account(s) into pool: ${this.keys.map(k => k.accountName).join(", ")}`);
    } catch (err: any) {
      console.error(`${LOG_PREFIX} Failed to load keys:`, err.message);
      // If pool is empty, fall back to env vars
      if (this.keys.length === 0) {
        this.loadFromEnv();
      }
    }
  }

  /**
   * Fallback: load from environment variables if DB is unavailable
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
      activeSessions: 0,
      maxSessions: this.maxSessionsPerKey,
      totalUsed: 0,
      failureCount: 0,
      lastFailureAt: null,
      disabledUntil: null,
      googleAuth: null,
      tempKeyPath: null,
    }];

    this.loaded = true;
    console.log(`${LOG_PREFIX} Loaded 1 key from environment variables (fallback)`);
  }

  /**
   * Acquire a slot from the pool. Returns the least-loaded available key.
   * Throws if no keys have capacity.
   */
  async acquire(): Promise<AcquiredSlot> {
    if (!this.loaded) {
      await this.reload();
    }

    if (this.keys.length === 0) {
      throw new Error("No Gemini API keys available in pool");
    }

    const now = Date.now();

    // Find the best key: round-robin among keys that have capacity and aren't disabled
    const startIndex = this.roundRobinIndex;
    let attempts = 0;

    while (attempts < this.keys.length) {
      const key = this.keys[this.roundRobinIndex % this.keys.length];
      this.roundRobinIndex = (this.roundRobinIndex + 1) % this.keys.length;
      attempts++;

      // Skip disabled keys
      if (key.disabledUntil && now < key.disabledUntil) {
        continue;
      }

      // Re-enable if cooldown passed
      if (key.disabledUntil && now >= key.disabledUntil) {
        key.disabledUntil = null;
        key.failureCount = 0;
        console.log(`${LOG_PREFIX} Re-enabled key: ${key.accountName}`);
      }

      // Skip if at capacity
      if (key.activeSessions >= key.maxSessions) {
        continue;
      }

      // Acquire this slot
      key.activeSessions++;
      key.totalUsed++;

      const useVertexAI = !!key.projectId;

      console.log(`${LOG_PREFIX} Acquired slot: ${key.accountName} (${key.activeSessions}/${key.maxSessions} active, total: ${key.totalUsed})`);

      return {
        accountId: key.accountId,
        accountName: key.accountName,
        projectId: key.projectId,
        location: key.location,
        apiKey: key.geminiApiKey,
        useVertexAI,
        getAccessToken: async () => {
          if (!useVertexAI) {
            throw new Error("Access token only available in Vertex AI mode");
          }
          return this.getAccessTokenForKey(key);
        },
        release: () => {
          key.activeSessions = Math.max(0, key.activeSessions - 1);
          console.log(`${LOG_PREFIX} Released slot: ${key.accountName} (${key.activeSessions}/${key.maxSessions} active)`);
        },
      };
    }

    // No capacity found
    const status = this.keys.map(k =>
      `${k.accountName}: ${k.activeSessions}/${k.maxSessions}${k.disabledUntil ? " (disabled)" : ""}`
    ).join(", ");
    throw new Error(`All Gemini API keys at capacity. Pool status: ${status}`);
  }

  /**
   * Report a failure for a key (e.g. rate limit hit, auth error).
   * After maxFailuresBeforeDisable failures, the key is temporarily disabled.
   */
  reportFailure(accountId: string, error?: string): void {
    const key = this.keys.find(k => k.accountId === accountId);
    if (!key) return;

    key.failureCount++;
    key.lastFailureAt = Date.now();

    if (key.failureCount >= this.maxFailuresBeforeDisable) {
      key.disabledUntil = Date.now() + this.failureCooldownMs;
      console.warn(`${LOG_PREFIX} Disabled key ${key.accountName} for ${this.failureCooldownMs / 1000}s after ${key.failureCount} failures${error ? `: ${error}` : ""}`);
    } else {
      console.warn(`${LOG_PREFIX} Failure ${key.failureCount}/${this.maxFailuresBeforeDisable} for ${key.accountName}${error ? `: ${error}` : ""}`);
    }
  }

  /**
   * Report success — resets failure count for a key.
   */
  reportSuccess(accountId: string): void {
    const key = this.keys.find(k => k.accountId === accountId);
    if (!key) return;
    key.failureCount = 0;
  }

  /**
   * Get pool stats for monitoring.
   */
  getStats() {
    return {
      totalKeys: this.keys.length,
      totalCapacity: this.keys.reduce((sum, k) => sum + k.maxSessions, 0),
      totalActive: this.keys.reduce((sum, k) => sum + k.activeSessions, 0),
      totalUsed: this.keys.reduce((sum, k) => sum + k.totalUsed, 0),
      keys: this.keys.map(k => ({
        accountId: k.accountId,
        accountName: k.accountName,
        projectId: k.projectId,
        activeSessions: k.activeSessions,
        maxSessions: k.maxSessions,
        totalUsed: k.totalUsed,
        failureCount: k.failureCount,
        disabled: k.disabledUntil ? k.disabledUntil > Date.now() : false,
        disabledUntil: k.disabledUntil ? new Date(k.disabledUntil).toISOString() : null,
      })),
    };
  }

  /**
   * Get a Vertex AI access token for a specific pooled key.
   */
  private async getAccessTokenForKey(key: PooledKey): Promise<string> {
    if (!key.googleAuth) {
      // If this key has its own service account JSON, write it to a temp file
      if (key.serviceAccountJson && key.accountId !== "env-default") {
        try {
          const { decryptJson } = await import("../lib/encryption");
          const saJson = decryptJson(key.serviceAccountJson);
          const tmpFile = path.join(os.tmpdir(), `gemini-pool-sa-${key.accountId}.json`);
          fs.writeFileSync(tmpFile, saJson, { mode: 0o600 });
          key.tempKeyPath = tmpFile;

          key.googleAuth = new GoogleAuth({
            keyFile: tmpFile,
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
            projectId: key.projectId,
          });
        } catch (err: any) {
          console.warn(`${LOG_PREFIX} Failed to use SA for ${key.accountName}, falling back to ADC:`, err.message);
          key.googleAuth = new GoogleAuth({
            scopes: ["https://www.googleapis.com/auth/cloud-platform"],
          });
        }
      } else {
        // Use Application Default Credentials
        key.googleAuth = new GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
      }
    }

    const token = await key.googleAuth.getAccessToken();
    if (!token) {
      throw new Error(`Failed to get access token for ${key.accountName}`);
    }
    return token;
  }
}

// Singleton
export const geminiApiKeyPool = new GeminiApiKeyPool();
