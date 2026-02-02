import Redis from "ioredis";
import {
  getRedisConnectionOptions,
  getRedisUrl,
  isRedisConfigured,
} from "../lib/redis-config";

const STATE_TTL_MS = 5 * 60 * 1000;
const STATE_TTL_SECONDS = Math.max(1, Math.floor(STATE_TTL_MS / 1000));
const REDIS_KEY_PREFIX = "pending_call_state:";

interface PendingCallState {
  context: Record<string, any>;
  createdAt: number;
}

const pendingCallState = new Map<string, PendingCallState>();
const CLEANUP_INTERVAL_MS = 60 * 1000;

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let redisClient: Redis | null = null;
let redisAvailable = false;
let redisInitPromise: Promise<void> | null = null;

async function initializeRedis(): Promise<void> {
  if (!isRedisConfigured()) {
    console.log("[PendingCallState] Redis not configured - using in-memory store.");
    return;
  }

  if (redisClient || redisInitPromise) {
    return redisInitPromise ?? Promise.resolve();
  }

  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    return;
  }

  redisInitPromise = (async () => {
    try {
      redisClient = new Redis(redisUrl, getRedisConnectionOptions());
      redisClient.on("error", (err) => {
        console.warn("[PendingCallState] Redis error:", err?.message || err);
        redisAvailable = false;
      });
      await redisClient.ping();
      redisAvailable = true;
      console.log("[PendingCallState] Redis connected - pending call context will survive restarts.");
    } catch (error) {
      console.warn(
        "[PendingCallState] Redis connection failed - falling back to in-memory store:",
        error
      );
      redisClient?.disconnect();
      redisClient = null;
      redisAvailable = false;
    } finally {
      redisInitPromise = null;
    }
  })();

  return redisInitPromise;
}

function startCleanupInterval(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [callId, state] of pendingCallState.entries()) {
      if (now - state.createdAt > STATE_TTL_MS) {
        pendingCallState.delete(callId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(
        `[PendingCallState] Cleaned ${cleaned} expired entries. Remaining: ${pendingCallState.size}`
      );
    }
  }, CLEANUP_INTERVAL_MS);
}

startCleanupInterval();
initializeRedis().catch((err) => {
  console.error("[PendingCallState] Redis init error:", err);
});

function buildRedisKey(callId: string): string {
  return `${REDIS_KEY_PREFIX}${callId}`;
}

function storeInMemory(callId: string, context: Record<string, any>): void {
  pendingCallState.set(callId, {
    context,
    createdAt: Date.now(),
  });
  console.log(
    `[PendingCallState] Stored state for call ${callId}. Total pending: ${pendingCallState.size}`
  );
}

async function removeFromRedis(callId: string): Promise<void> {
  if (!redisAvailable || !redisClient) return;
  try {
    await redisClient.del(buildRedisKey(callId));
  } catch (error) {
    console.warn("[PendingCallState] Failed to delete Redis key:", error);
  }
}

async function readFromRedis(callId: string, consume: boolean): Promise<Record<string, any> | null> {
  if (!redisAvailable || !redisClient) return null;
  try {
    const raw = await redisClient.get(buildRedisKey(callId));
    if (!raw) {
      return null;
    }
    if (consume) {
      await redisClient.del(buildRedisKey(callId));
    }
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    console.warn("[PendingCallState] Redis lookup failed:", error);
    return null;
  }
}

/**
 * Store call context for later retrieval by voice-dialer
 */
export async function storePendingCallState(
  callId: string,
  context: Record<string, any>
): Promise<void> {
  storeInMemory(callId, context);

  if (redisAvailable && redisClient) {
    try {
      await redisClient.setex(buildRedisKey(callId), STATE_TTL_SECONDS, JSON.stringify(context));
      console.log(`[PendingCallState] Persisted state for ${callId} in Redis.`);
    } catch (error) {
      console.warn(`[PendingCallState] Redis setex failed for ${callId}:`, error);
    }
  }
}

/**
 * Retrieve and optionally consume call context
 */
export async function getPendingCallState(
  callId: string,
  consume: boolean = true
): Promise<Record<string, any> | null> {
  const memoryState = pendingCallState.get(callId);
  if (memoryState) {
    if (consume) {
      pendingCallState.delete(callId);
      removeFromRedis(callId).catch(() => {});
      console.log(`[PendingCallState] Retrieved and consumed state for ${callId} (memory).`);
    } else {
      console.log(`[PendingCallState] Retrieved state for ${callId} (memory, not consumed).`);
    }
    return memoryState.context;
  }

  const redisState = await readFromRedis(callId, consume);
  if (redisState) {
    if (!consume) {
      storeInMemory(callId, redisState);
    }
    console.log(`[PendingCallState] Retrieved state for ${callId} from Redis.`);
    return redisState;
  }

  console.log(`[PendingCallState] No state found for call ${callId}`);
  return null;
}

/**
 * Check if state exists for a call ID
 */
export async function hasPendingCallState(callId: string): Promise<boolean> {
  if (pendingCallState.has(callId)) {
    return true;
  }
  if (!redisAvailable || !redisClient) {
    return false;
  }
  try {
    const exists = await redisClient.exists(buildRedisKey(callId));
    return exists > 0;
  } catch (error) {
    console.warn("[PendingCallState] Redis exists check failed:", error);
    return false;
  }
}

/**
 * Get count of pending call states (for monitoring)
 */
export function getPendingCallStateCount(): number {
  return pendingCallState.size;
}
