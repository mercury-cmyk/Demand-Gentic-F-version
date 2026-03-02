/**
 * Redis Configuration Helper
 *
 * Provides environment-aware Redis URL configuration:
 * - Development: Uses local Redis (localhost:6379) or REDIS_URL_DEV
 * - Production: Uses Google Cloud Memorystore or REDIS_URL_PROD
 *
 * IMPORTANT: In production (Cloud Run), the VPC Connector must be configured
 * to allow connections to the internal GCP Memorystore Redis IP.
 */

// Track Redis availability state to avoid spamming logs
let redisAvailable: boolean | null = null;
let lastRedisWarningTime = 0;
const REDIS_WARNING_INTERVAL = 60000; // Only warn once per minute

/**
 * Get the Redis URL based on NODE_ENV
 * @returns {string | null} Redis connection URL or null if not configured
 */
export function getRedisUrl(): string | null {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const strictIsolation = nodeEnv === 'development' && process.env.STRICT_ENV_ISOLATION !== 'false';
  const allowSharedRedisInDev = process.env.ALLOW_SHARED_REDIS_IN_DEV === 'true';

  // Check if Redis is explicitly disabled
  if (process.env.DISABLE_REDIS === 'true') {
    return null;
  }

  if (nodeEnv === 'production') {
    // Production: Use Google Cloud Memorystore Redis
    // Primary: REDIS_URL_PROD
    // Fallback: REDIS_URL (legacy)
    const prodUrl = process.env.REDIS_URL_PROD || process.env.REDIS_URL;

    // Only use default Memorystore IP if explicitly enabled
    // This prevents connection timeouts when VPC connector isn't configured
    if (!prodUrl && process.env.USE_MEMORYSTORE === 'true') {
      return 'redis://10.181.0.35:6379';
    }

    return prodUrl || null;
  }

  // Development: Use local Redis or development-specific Redis
  // Primary: REDIS_URL_DEV
  // Optional fallback: REDIS_URL only when ALLOW_SHARED_REDIS_IN_DEV=true
  const devUrl = process.env.REDIS_URL_DEV || (allowSharedRedisInDev ? process.env.REDIS_URL : undefined);

  if (!devUrl && strictIsolation && process.env.REDIS_URL && !allowSharedRedisInDev) {
    logRedisWarning('REDIS_URL_DEV is missing; refusing REDIS_URL fallback in development (STRICT_ENV_ISOLATION=true).');
  }

  if (
    strictIsolation &&
    devUrl &&
    process.env.REDIS_URL_PROD &&
    devUrl === process.env.REDIS_URL_PROD &&
    process.env.ALLOW_DEV_PROD_REDIS !== 'true'
  ) {
    logRedisWarning('Dev Redis resolved to REDIS_URL_PROD; Redis disabled until REDIS_URL_DEV is configured.');
    return null;
  }

  // Only fall back to localhost if Redis is explicitly required
  if (!devUrl && process.env.REQUIRE_REDIS === 'true') {
    return 'redis://localhost:6379';
  }

  return devUrl || null;
}

/**
 * Check if Redis is configured (URL is available)
 * @returns {boolean} True if Redis URL is configured
 */
export function isRedisConfigured(): boolean {
  return !!getRedisUrl();
}

/**
 * Log Redis warning with rate limiting to avoid spam
 */
function logRedisWarning(message: string): void {
  const now = Date.now();
  if (now - lastRedisWarningTime > REDIS_WARNING_INTERVAL) {
    console.warn(`[Redis] ${message}`);
    lastRedisWarningTime = now;
  }
}

/**
 * Set Redis availability state (called by queue.ts after connection attempt)
 */
export function setRedisAvailable(available: boolean): void {
  if (redisAvailable !== available) {
    redisAvailable = available;
    if (available) {
      console.log('[Redis] Connection established');
    } else {
      logRedisWarning('Connection unavailable - background jobs will not persist');
    }
  }
}

/**
 * Check if Redis is actually available (has connected successfully)
 */
export function isRedisAvailable(): boolean {
  return redisAvailable === true;
}

/**
 * Get Redis connection options for ioredis
 * Includes timeout and retry settings for production reliability
 * @returns {object} ioredis connection options
 */
export function getRedisConnectionOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    // Required for BullMQ - allows infinite retries for blocking operations
    maxRetriesPerRequest: null,

    // Disable ready check to speed up connection
    enableReadyCheck: false,

    // Connection timeouts (shorter in dev, longer in prod for VPC latency)
    // Increased to 60s globally to handle remote Redis latency in dev and VPC issues in prod
    connectTimeout: 60000,

    // Command timeout - prevent hanging on slow responses
    // Increased for Cloud Run VPC connector latency and remote dev connections
    commandTimeout: 60000,

    // Retry strategy with exponential backoff and max attempts
    retryStrategy: (times: number) => {
      // In production, be more patient with retries (VPC connector may need time)
      // Increased max retries to handle transient network issues
      const maxRetries = 50; 

      if (times > maxRetries) {
        logRedisWarning(`Max retries (${maxRetries}) exceeded - giving up`);
        setRedisAvailable(false);
        return null; // Stop retrying
      }

      // Exponential backoff: 200ms default start, max 10s
      const delay = Math.min(Math.pow(2, times - 1) * 200, 10000);

      // Log less often in dev to reduce noise unless it persists
      if (times > 5) {
        logRedisWarning(`Connection retry ${times}/${maxRetries} in ${delay}ms`);
      }

      return delay;
    },

    // Queue commands while disconnected (for transient failures)
    enableOfflineQueue: true,

    // Auto-reconnect on disconnect
    lazyConnect: false,

    // Keep-alive to detect dead connections
    keepAlive: isProduction ? 30000 : 10000,
  };
}

