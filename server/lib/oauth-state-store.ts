import Redis from 'ioredis';
import { getRedisUrl, getRedisConnectionOptions } from './redis-config';

interface PendingAuthorization {
  codeVerifier: string;
  userId: string;
  createdAt: number;
}

interface IOAuthStateStore {
  set(state: string, data: Omit<PendingAuthorization, 'createdAt'>): Promise<void>;
  get(state: string): Promise<PendingAuthorization | null>;
  delete(state: string): Promise<void>;
  cleanup(): Promise<void>;
  disconnect(): Promise<void>;
}

export class OAuthStateStore implements IOAuthStateStore {
  private redis: Redis;
  private readonly prefix: string;
  private readonly ttlSeconds: number;

  constructor(redisUrl?: string, options: { prefix?: string; ttlSeconds?: number } = {}) {
    // Use provided URL or get from environment-aware config
    const url = redisUrl || getRedisUrl();
    this.redis = new Redis(url, {
      ...getRedisConnectionOptions(),
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
    this.redis.on('error', () => {});
    this.prefix = options.prefix || 'oauth:m365:';
    this.ttlSeconds = options.ttlSeconds || 15 * 60; // 15 minutes default
  }

  async set(state: string, data: Omit<PendingAuthorization, 'createdAt'>): Promise<void> {
    const key = `${this.prefix}${state}`;
    const value: PendingAuthorization = {
      ...data,
      createdAt: Date.now(),
    };
    console.log('[OAuthStateStore] Setting state in Redis:', { key, userId: data.userId, ttl: this.ttlSeconds });
    await this.redis.setex(key, this.ttlSeconds, JSON.stringify(value));
    console.log('[OAuthStateStore] State set successfully in Redis');
  }

  async get(state: string): Promise<PendingAuthorization | null> {
    const key = `${this.prefix}${state}`;
    console.log('[OAuthStateStore] Getting state from Redis:', { key });
    const value = await this.redis.get(key);
    if (!value) {
      console.log('[OAuthStateStore] State not found in Redis');
      return null;
    }
    console.log('[OAuthStateStore] State found in Redis');
    return JSON.parse(value) as PendingAuthorization;
  }

  async delete(state: string): Promise<void> {
    const key = `${this.prefix}${state}`;
    console.log('[OAuthStateStore] Deleting state from Redis:', { key });
    await this.redis.del(key);
    console.log('[OAuthStateStore] State deleted from Redis');
  }

  async cleanup(): Promise<void> {
    // Redis TTL handles cleanup automatically
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * In-memory fallback OAuth state store for dev environments without Redis.
 * Uses a Map with periodic TTL-based expiration cleanup.
 */
export class InMemoryOAuthStateStore implements IOAuthStateStore {
  private store = new Map<string, { data: PendingAuthorization; expiresAt: number }>();
  private readonly prefix: string;
  private readonly ttlMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: { prefix?: string; ttlSeconds?: number } = {}) {
    this.prefix = options.prefix || 'oauth:m365:';
    this.ttlMs = (options.ttlSeconds || 15 * 60) * 1000;
    // Periodic cleanup every 60s
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    console.log('[OAuthStateStore] Using in-memory store (no Redis configured)');
  }

  async set(state: string, data: Omit<PendingAuthorization, 'createdAt'>): Promise<void> {
    const key = `${this.prefix}${state}`;
    const value: PendingAuthorization = { ...data, createdAt: Date.now() };
    this.store.set(key, { data: value, expiresAt: Date.now() + this.ttlMs });
    console.log('[OAuthStateStore:InMemory] State set:', { key, userId: data.userId });
  }

  async get(state: string): Promise<PendingAuthorization | null> {
    const key = `${this.prefix}${state}`;
    const entry = this.store.get(key);
    if (!entry) {
      console.log('[OAuthStateStore:InMemory] State not found:', { key });
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      console.log('[OAuthStateStore:InMemory] State expired:', { key });
      return null;
    }
    console.log('[OAuthStateStore:InMemory] State found:', { key });
    return entry.data;
  }

  async delete(state: string): Promise<void> {
    const key = `${this.prefix}${state}`;
    this.store.delete(key);
    console.log('[OAuthStateStore:InMemory] State deleted:', { key });
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[OAuthStateStore:InMemory] Cleaned ${cleaned} expired entries`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Singleton instance
let oauthStateStore: IOAuthStateStore | null = null;

export function hasRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

export function getOAuthStateStore(): IOAuthStateStore {
  if (!oauthStateStore) {
    const redisUrl = process.env.REDIS_URL || '';
    if (redisUrl) {
      oauthStateStore = new OAuthStateStore(redisUrl, {
        prefix: 'oauth:m365:',
        ttlSeconds: 15 * 60,
      });
    } else {
      // Fallback to in-memory store when Redis is not configured
      oauthStateStore = new InMemoryOAuthStateStore({
        prefix: 'oauth:m365:',
        ttlSeconds: 15 * 60,
      });
    }
  }
  return oauthStateStore;
}
