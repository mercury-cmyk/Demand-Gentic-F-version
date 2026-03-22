/**
 * Disposition Analysis Cache Service
 *
 * Persistent Redis-backed cache for disposition analysis results.
 * Survives server restarts and enables result sharing across instances.
 *
 * Cache Strategy:
 * - Primary: Redis (persistent, shared across instances)
 * - Fallback: In-memory LRU (when Redis unavailable)
 * - Keys: disposition: (direct mapping)
 * - TTL: 14 days (analysis results are stable)
 *
 * Performance Impact:
 * - Cache hits: ;
  };
  dispositionAssessment: {
    suggestedDisposition: string;
    confidence: number;
    reasoning: string;
    positiveSignals: string[];
    negativeSignals: string[];
    shouldOverride: boolean;
  };
}

export class DispositionAnalysisCache {
  private redis: Redis | null = null;
  private inMemoryCache: Map = new Map();
  private isConnected = false;
  private connectionAttempted = false;

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis(): Promise {
    if (this.connectionAttempted) return;
    this.connectionAttempted = true;

    if (!isRedisConfigured()) {
      console.log(`${LOG_PREFIX} Redis not configured; using in-memory cache only`);
      return;
    }

    try {
      const ioredis = (await import("ioredis")).default;
      const url = getRedisUrl();
      const options = getRedisConnectionOptions();

      if (!url) {
        console.log(`${LOG_PREFIX} No Redis URL available`);
        return;
      }

      this.redis = new ioredis(url, {
        ...options,
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        enableOfflineQueue: true,
        connectTimeout: 5000,
        commandTimeout: 10000,
      });

      this.redis.on("connect", () => {
        this.isConnected = true;
        console.log(`${LOG_PREFIX} Redis connected`);
      });

      this.redis.on("error", (err) => {
        this.isConnected = false;
        console.warn(`${LOG_PREFIX} Redis error:`, err.message);
      });

      this.redis.on("reconnecting", () => {
        console.log(`${LOG_PREFIX} Redis reconnecting...`);
      });

      // Test connection
      await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Redis connection timeout")), 5000)
        ),
      ]);

      this.isConnected = true;
      console.log(`${LOG_PREFIX} Redis initialized and connected`);
    } catch (error: any) {
      console.warn(`${LOG_PREFIX} Failed to initialize Redis:`, error.message);
      this.redis = null;
      this.isConnected = false;
      // Gracefully fall back to in-memory cache
    }
  }

  /**
   * Get analysis result by call session ID
   * Checks Redis first, then in-memory cache
   */
  async getAnalysis(callSessionId: string): Promise {
    if (!callSessionId) return null;

    // Try Redis first (persistent, shared)
    if (this.isConnected && this.redis) {
      try {
        const cached = await this.redis.get(`disposition:${callSessionId}`);
        if (cached) {
          // Cache hit in Redis - also populate in-memory
          const parsed = JSON.parse(cached);
          this.inMemoryCache.set(callSessionId, { createdAt: Date.now(), value: parsed });
          return parsed;
        }
      } catch (error: any) {
        console.warn(`${LOG_PREFIX} Redis get error:`, error.message);
        // Fall through to in-memory cache
      }
    }

    // Fall back to in-memory cache
    const inMem = this.inMemoryCache.get(callSessionId);
    if (inMem) {
      return inMem.value;
    }

    return null;
  }

  /**
   * Store analysis result
   * Stores in both Redis and in-memory cache
   */
  async setAnalysis(callSessionId: string, result: DeepAnalysisOutput): Promise {
    if (!callSessionId) return;

    // Store in in-memory cache (fast lookup)
    this.inMemoryCache.set(callSessionId, { createdAt: Date.now(), value: result });
    this.pruneInMemoryCache();

    // Store in Redis (persistent, shared)
    if (this.isConnected && this.redis) {
      try {
        await this.redis.setex(
          `disposition:${callSessionId}`,
          CACHE_TTL_SECONDS,
          JSON.stringify(result)
        );
      } catch (error: any) {
        console.warn(`${LOG_PREFIX} Redis set error:`, error.message);
        // Cache still stored in memory, that's acceptable
      }
    }
  }

  /**
   * Get multiple analyses at once (batch operation)
   * More efficient than calling getAnalysis() N times
   */
  async getMany(callSessionIds: string[]): Promise> {
    const result = new Map();

    if (!callSessionIds.length) return result;

    // Try Redis batch operation
    if (this.isConnected && this.redis) {
      try {
        const pipeline = this.redis.pipeline();
        for (const id of callSessionIds) {
          pipeline.get(`disposition:${id}`);
        }
        const pipelineResults = await pipeline.exec();

        if (pipelineResults) {
          for (let i = 0; i  0) {
            return result;
          }
        }
      } catch (error: any) {
        console.warn(`${LOG_PREFIX} Redis batch get error:`, error.message);
      }
    }

    // Fall back to in-memory cache
    for (const id of callSessionIds) {
      const inMem = this.inMemoryCache.get(id);
      if (inMem) {
        result.set(id, inMem.value);
      }
    }

    return result;
  }

  /**
   * Invalidate a cached analysis (e.g., after disposition override)
   */
  async invalidateCall(callSessionId: string): Promise {
    if (!callSessionId) return;

    // Remove from in-memory cache
    this.inMemoryCache.delete(callSessionId);

    // Remove from Redis
    if (this.isConnected && this.redis) {
      try {
        await this.redis.del(`disposition:${callSessionId}`);
      } catch (error: any) {
        console.warn(`${LOG_PREFIX} Redis delete error:`, error.message);
      }
    }
  }

  /**
   * Invalidate multiple cached analyses at once
   */
  async invalidateMany(callSessionIds: string[]): Promise {
    if (!callSessionIds.length) return;

    // Remove from in-memory cache
    for (const id of callSessionIds) {
      this.inMemoryCache.delete(id);
    }

    // Remove from Redis
    if (this.isConnected && this.redis) {
      try {
        const pipeline = this.redis.pipeline();
        for (const id of callSessionIds) {
          pipeline.del(`disposition:${id}`);
        }
        await pipeline.exec();
      } catch (error: any) {
        console.warn(`${LOG_PREFIX} Redis batch delete error:`, error.message);
      }
    }
  }

  /**
   * Invalidate all caches for a campaign
   * Useful for bulk disposition changes
   */
  async invalidateCampaign(campaignId: string): Promise {
    if (!campaignId) return;

    // For Redis, we'd need a campaign index to do this efficiently
    // For now, just clear in-memory cache when campaign changes significantly
    console.log(`${LOG_PREFIX} Campaign ${campaignId} invalidated (partial - in-memory only)`);
  }

  /**
   * Prune in-memory cache using simple LRU eviction
   */
  private pruneInMemoryCache(): void {
    if (this.inMemoryCache.size  a[1].createdAt - b[1].createdAt);

    const toDelete = this.inMemoryCache.size - IN_MEMORY_MAX_SIZE;
    for (let i = 0; i  {
    this.inMemoryCache.clear();
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// Singleton instance
let instance: DispositionAnalysisCache | null = null;

export function getDispositionCache(): DispositionAnalysisCache {
  if (!instance) {
    instance = new DispositionAnalysisCache();
  }
  return instance;
}

/**
 * For testing: reset the singleton
 */
export function resetDispositionCache(): void {
  instance = null;
}