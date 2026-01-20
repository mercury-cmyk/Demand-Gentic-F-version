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
    // Fast fail in dev if cannot connect immediately
    if (process.env.NODE_ENV !== 'production') {
      options.connectTimeout = 3000;
      options.retryStrategy = (times) => {
        if (times > 2) return null; // Give up fast
        return 500;
      };
    }

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

// Perform top-level await for connection
try {
  redisConnection = await initializeRedisConnection();
} catch (err) {
  console.error('[Queue] Top-level Redis initialization failed:', err);
  redisConnection = undefined;
}

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
 * Check if Redis/Queue system is available
 */
export function isQueueAvailable(): boolean {
  return !!redisConnection;
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
  const connection = getRedisConnection();
  
  if (!connection) {
    console.warn(`[Queue] Queue "${queueName}" created without Redis - jobs will not persist`);
    // Return a mock queue that logs warnings
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
    console.warn(`[Queue] Worker for "${queueName}" not started - no Redis connection`);
    return null;
  }

  // Create a DEDICATED connection for this worker to prevent blocking issues
  // BullMQ workers use blocking commands (BRPOP) which lock the connection
  const connection = new IORedis(redisUrl, {
    ...getRedisConnectionOptions(),
    maxRetriesPerRequest: null // Ensure this is set for BullMQ
  });

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

  // QueueEvents require a dedicated connection (Subscriber mode)
  // Reusing a shared connection would break other operations
  const connection = new IORedis(redisUrl, {
    ...getRedisConnectionOptions(),
    maxRetriesPerRequest: null
  });

  return new QueueEvents(queueName, {
    connection,
  });
}

/**
 * Gracefully close all Redis connections
 */
export async function closeQueueConnections(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    console.log('[Queue] Redis connection closed');
  }
}
