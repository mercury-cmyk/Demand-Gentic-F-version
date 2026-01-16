import Redis from 'ioredis';
import { getRedisUrl, getRedisConnectionOptions } from './redis-config';

interface PendingAuthorization {
  codeVerifier: string;
  userId: string;
  createdAt: number;
}

export class OAuthStateStore {
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
    // Redis TTL handles cleanup automatically, but this method exists for compatibility
    // In the future, we could scan and delete expired keys if needed
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

// Singleton instance
let oauthStateStore: OAuthStateStore | null = null;

export function hasRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

export function getOAuthStateStore(): OAuthStateStore {
  if (!oauthStateStore) {
    const redisUrl = process.env.REDIS_URL || '';
    if (!redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }
    oauthStateStore = new OAuthStateStore(redisUrl, {
      prefix: 'oauth:m365:',
      ttlSeconds: 15 * 60, // 15 minutes
    });
  }
  return oauthStateStore;
}
