/**
 * Redis Configuration Helper
 * 
 * Provides environment-aware Redis URL configuration:
 * - Development: Uses local Redis (localhost:6379) or REDIS_URL_DEV
 * - Production: Uses Google Cloud Memorystore or REDIS_URL_PROD
 */

/**
 * Get the Redis URL based on NODE_ENV
 * @returns {string} Redis connection URL
 */
export function getRedisUrl(): string {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production') {
    // Production: Use Google Cloud Memorystore Redis
    // Primary: REDIS_URL (set via Secret Manager)
    // Fallback: REDIS_URL_PROD environment variable
    return (
      process.env.REDIS_URL ||
      process.env.REDIS_URL_PROD ||
      'redis://10.181.0.35:6379' // Internal GCS Memorystore IP (default)
    );
  }
  
  // Development: Use local Redis or development-specific Redis
  // Primary: REDIS_URL_DEV (for explicit dev Redis Cloud instance)
  // Fallback: REDIS_URL (for backward compatibility)
  // Final fallback: Local Redis
  return (
    process.env.REDIS_URL_DEV ||
    process.env.REDIS_URL ||
    'redis://localhost:6379' // Local Redis (default for development)
  );
}

/**
 * Check if Redis is available
 * @returns {boolean} True if Redis URL is configured
 */
export function isRedisConfigured(): boolean {
  return !!getRedisUrl();
}

/**
 * Get Redis connection options for ioredis
 * @returns {object} ioredis connection options
 */
export function getRedisConnectionOptions() {
  return {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    enableOfflineQueue: true,
  };
}
