/**
 * BullMQ Queue Configuration
 *
 * Provides Redis connection and queue setup for background job processing.
 * Supports both development (in-memory) and production (Redis) modes.
 */

// Suppress BullMQ eviction policy warning using synchronous require pattern
// This must run BEFORE BullMQ is loaded to intercept its warnings
const FILTER_KEY = Symbol.for('eviction-policy-filter-installed');
if (!(global as any)[FILTER_KEY]) {
  (global as any)[FILTER_KEY] = true;

  const shouldSuppress = (chunk: any): boolean => {
    const str = chunk?.toString?.() || '';
    return str.includes('IMPORTANT!') && str.includes('Eviction policy');
  };

  // Intercept stdout
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = function(chunk: any, ...args: any[]): boolean {
    if (shouldSuppress(chunk)) return true;
    return originalStdoutWrite(chunk, ...args);
  };

  // Intercept stderr (console.warn writes here)
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  (process.stderr as any).write = function(chunk: any, ...args: any[]): boolean {
    if (shouldSuppress(chunk)) return true;
    return originalStderrWrite(chunk, ...args);
  };
}

import { Queue, Worker, QueueEvents, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { getRedisUrl, getRedisConnectionOptions, isRedisConfigured, setRedisAvailable } from './redis-config';

/**
 * Redis connection configuration
 */
const REDIS_URL = getRedisUrl();

// Global connection state
let redisConnection: IORedis | undefined;
let redisSubscriber: IORedis | undefined; // Separate connection for subscribers (required by BullMQ)

function shouldLogQueueWarnings(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.LOG_QUEUE_WARNINGS === 'true';
}

/**
 * Initialize Redis connection asynchronously
 * This ensures we know if Redis is available before successful startup
 */
async function initializeRedisConnection(): Promise<IORedis | undefined> {
  if (!isRedisConfigured() || !REDIS_URL) {
    console.log('[Queue] Redis not configured - background jobs disabled');
    setRedisAvailable(false);
    return undefined;
  }

  try {
    // Mask password in URL for logging
    const maskedUrl = REDIS_URL.replace(/:[^@]*@/, ':***@');
    console.log(`[Queue] Attempting Redis connection to ${maskedUrl}`);

    const options = getRedisConnectionOptions();
    // Force lazy connect to handle initial connection errors ourselves
    options.lazyConnect = true;

    // Use standard connection options (removed aggressive dev timeouts to support remote Redis)
    const connection = new IORedis(REDIS_URL, options);

    // Set up error handlers BEFORE connecting
    connection.on('error', (err) => {
      if (err.message?.includes('ETIMEDOUT') || err.message?.includes('ECONNREFUSED') || err.code === 'ECONNREFUSED') {
        // Suppress spam for expected connection failures in dev
        setRedisAvailable(false);
      } else {
        console.error('[Queue] Redis error:', err.message);
      }
    });

    connection.on('connect', () => {
      console.log(`[Queue] Redis connected to ${maskedUrl}`);
      setRedisAvailable(true);
    });

    connection.on('close', () => {
      // Only log once when initially closing
      if (redisConnection) {
        console.log('[Queue] Redis connection closed');
        setRedisAvailable(false);
      }
    });

    connection.on('reconnecting', () => {
      console.log('[Queue] Redis reconnecting...');
    });

    // Attempt initial connection
    await connection.connect();
    
    // Check status
    if (connection.status === 'ready' || connection.status === 'connect') {
      return connection;
    } else {
      console.warn(`[Queue] Redis connection status: ${connection.status}, treating as unavailable`);
      return undefined;
    }

  } catch (error) {
    console.warn(`[Queue] Failed to establish initial Redis connection: ${(error as Error).message}`);
    console.warn('[Queue] Running without Redis (background jobs disabled)');
    setRedisAvailable(false);
    return undefined;
  }
}

/**
 * Initialize separate subscriber connection for QueueEvents
 * Required by BullMQ; cannot share subscriber connection with regular commands
 */
async function initializeSubscriberConnection(): Promise<IORedis | undefined> {
  if (!isRedisConfigured() || !REDIS_URL || !redisConnection) {
    return undefined;
  }

  try {
    const options = getRedisConnectionOptions();
    const subscriber = new IORedis(REDIS_URL, {
      ...options,
      lazyConnect: true,
    });

    subscriber.on('error', (err) => {
      if (!err.message?.includes('ETIMEDOUT') && !err.message?.includes('ECONNREFUSED')) {
        console.error('[Queue:Subscriber] Error:', err.message);
      }
    });

    await subscriber.connect();
    
    if (subscriber.status === 'ready' || subscriber.status === 'connect') {
      console.log('[Queue:Subscriber] Subscriber connection established');
      return subscriber;
    } else {
      console.warn(`[Queue:Subscriber] Status: ${subscriber.status}`);
      return undefined;
    }
  } catch (error) {
    console.warn(`[Queue:Subscriber] Failed to initialize: ${(error as Error).message}`);
    return undefined;
  }
}

// Connection initialization state
let connectionInitialized = false;
let connectionInitPromise: Promise<IORedis | undefined> | null = null;

/**
 * Initialize Redis connection (called on first queue access, not at module load)
 * This is non-blocking to allow server to start before Redis connects
 */
async function ensureRedisInitialized(): Promise<IORedis | undefined> {
  if (connectionInitialized) {
    return redisConnection;
  }
  
  if (connectionInitPromise) {
    return connectionInitPromise;
  }
  
  connectionInitPromise = (async () => {
    try {
      redisConnection = await initializeRedisConnection();
      connectionInitialized = true;
      
      // Initialize subscriber connection after main connection is ready
      if (redisConnection) {
        redisSubscriber = await initializeSubscriberConnection();
      }
      
      return redisConnection;
    } catch (err) {
      console.error('[Queue] Redis initialization failed:', err);
      connectionInitialized = true; // Mark as initialized (to failed state)
      redisConnection = undefined;
      redisSubscriber = undefined;
      return undefined;
    }
  })();
  
  return connectionInitPromise;
}

// Start Redis initialization in background (non-blocking)
// This allows module to load without waiting for Redis
setImmediate(() => {
  ensureRedisInitialized().catch((err) => {
    console.error('[Queue] Background Redis initialization failed:', err);
  });
});

/**
 * Get connection options for BullMQ that suppress eviction policy warnings
 */
export function getQueueConnectionOptions(): { connection: IORedis; skipVersionCheck?: boolean } | undefined {
  const connection = getRedisConnection();
  if (!connection) return undefined;
  return { connection };
}

/**
 * Get Redis connection for BullMQ
 */
export function getRedisConnection(): IORedis | undefined {
  // If connection is closed or ended, don't return it
  if (redisConnection && (redisConnection.status === 'end' || redisConnection.status === 'closed')) {
    return undefined;
  }
  return redisConnection;
}

/**
 * Async version of getRedisConnection that waits for initialization
 */
export async function getRedisConnectionAsync(): Promise<IORedis | undefined> {
  await ensureRedisInitialized();
  return getRedisConnection();
}

/**
 * Check if Redis/Queue system is available
 */
export function isQueueAvailable(): boolean {
  if (redisConnection && redisConnection.status !== 'end' && redisConnection.status !== 'close') {
    return true;
  }

  // If Redis is configured but not connected yet, trigger async initialization
  // and report as available so queue initializers don't skip permanently on startup.
  if (isRedisConfigured()) {
    ensureRedisInitialized().catch((err) => {
      console.error('[Queue] Deferred Redis initialization failed:', err);
    });
    return true;
  }

  return false;
}

/**
 * Create a BullMQ queue
 * @param queueName - Name of the queue
 * @param defaultJobOptions - Default options for jobs in this queue
 */
export function createQueue<T = any>(
  queueName: string,
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  }
): Queue<T> | null {
  const redisUrl = getRedisUrl();
  if (!isRedisConfigured() || !redisUrl) {
    if (shouldLogQueueWarnings()) {
      console.warn(`[Queue] Queue "${queueName}" created without Redis - jobs will not persist`);
    }
    return null;
  }

  // Use shared connection pool instead of creating new connections per queue
  // This prevents connection pool exhaustion at Redis Labs
  const connection = getRedisConnection();
  if (!connection) {
    if (shouldLogQueueWarnings()) {
      console.warn(`[Queue] Redis not yet connected for queue "${queueName}"`);
    }
    return null;
  }

  return new Queue<T>(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500, // Keep last 500 failed jobs
      ...defaultJobOptions,
    },
  });
}

/**
 * Create a BullMQ worker
 * @param queueName - Name of the queue to process
 * @param processor - Job processor function
 * @param workerOptions - Worker options including concurrency, lock duration, and rate limiting
 */
export function createWorker<T = any>(
  queueName: string,
  processor: (job: any) => Promise<any>,
  workerOptions: {
    concurrency?: number;
    lockDuration?: number;
    lockRenewTime?: number;
    stalledInterval?: number;
    limiter?: {
      max: number;
      duration: number;
    };
  } = {}
): Worker<T> | null {
  const redisUrl = getRedisUrl();
  if (!isRedisConfigured() || !redisUrl) {
    if (shouldLogQueueWarnings()) {
      console.warn(`[Queue] Worker for "${queueName}" not started - no Redis connection`);
    }
    return null;
  }

  // Use shared connection pool - BullMQ workers can share connections efficiently
  const connection = getRedisConnection();
  if (!connection) {
    if (shouldLogQueueWarnings()) {
      console.warn(`[Queue] Redis not yet connected for worker "${queueName}"`);
    }
    return null;
  }

  // Build worker options conditionally to avoid passing undefined values to BullMQ
  const workerConfig: any = {
    connection,
    concurrency: workerOptions.concurrency || 1,
    autorun: true,
  };
  
  // Only include lock options if explicitly set (allows 0 values)
  if (workerOptions.lockDuration !== undefined) {
    workerConfig.lockDuration = workerOptions.lockDuration;
  }
  if (workerOptions.lockRenewTime !== undefined) {
    workerConfig.lockRenewTime = workerOptions.lockRenewTime;
  }
  if (workerOptions.stalledInterval !== undefined) {
    workerConfig.stalledInterval = workerOptions.stalledInterval;
  }
  if (workerOptions.limiter !== undefined) {
    workerConfig.limiter = workerOptions.limiter;
  }

  const worker = new Worker<T>(queueName, processor, workerConfig);

  worker.on('active', (job) => {
    console.log(`[Queue:${queueName}] Job ${job.id} started processing`);
  });

  worker.on('completed', (job) => {
    console.log(`[Queue:${queueName}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Queue:${queueName}] Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    // Suppress Redis connection errors - they're expected when Redis is unavailable
    if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      return; // Silent - Redis is optional
    }
    console.error(`[Queue:${queueName}] Worker error:`, err);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[Queue:${queueName}] Job ${jobId} stalled`);
  });

  return worker;
}

/**
 * Create queue events listener for monitoring
 */
export function createQueueEvents(queueName: string): QueueEvents | null {
  const redisUrl = getRedisUrl();
  if (!isRedisConfigured() || !redisUrl) {
    return null;
  }

  // Use shared subscriber connection instead of creating new connections per queue
  const subscriber = redisSubscriber || getRedisConnection();
  
  if (!subscriber) {
    if (shouldLogQueueWarnings()) {
      console.warn(`[Queue:Events] No subscriber connection for queue "${queueName}"`);
    }
    return null;
  }

  return new QueueEvents(queueName, {
    connection: subscriber,
  });
}

/**
 * Gracefully close all Redis connections
 */
export async function closeQueueConnections(): Promise<void> {
  if (redisSubscriber) {
    try {
      await redisSubscriber.quit();
      console.log('[Queue] Subscriber connection closed');
    } catch (err) {
      console.warn('[Queue] Error closing subscriber:', err);
    }
  }
  
  if (redisConnection) {
    try {
      await redisConnection.quit();
      console.log('[Queue] Main Redis connection closed');
    } catch (err) {
      console.warn('[Queue] Error closing main connection:', err);
    }
  }
}
