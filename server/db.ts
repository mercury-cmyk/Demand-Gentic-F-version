// Database connection setup - referenced from blueprint:javascript_database
import { config } from "dotenv";
// Load environment variables from .env.local
config({ path: ".env.local" });

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// PRODUCTION DATABASE OVERRIDE
// Workaround for Replit deployment secret bug - allow overriding production database URL
// This bypasses the deployment secret that keeps reverting to an outdated database value
let databaseUrl = process.env.DATABASE_URL;

if (process.env.REPLIT_DEPLOYMENT === '1') {
  // Running in production deployment - use deployment-provided production database URL
  const productionDbUrl = process.env.REPLIT_PRODUCTION_DATABASE_URL;

  if (!productionDbUrl) {
    throw new Error(
      'REPLIT_PRODUCTION_DATABASE_URL must be set when REPLIT_DEPLOYMENT=1'
    );
  }

  console.log('[DB] Production deployment detected - using override database URL');
  const endpoint = productionDbUrl.match(/ep-[^.]+/)?.[0] ?? 'unknown';
  console.log(`[DB] Target database: ${endpoint} (Production)`);
  databaseUrl = productionDbUrl;
} else {
  console.log('[DB] Development mode - using DATABASE_URL from environment');
  console.log('[DB] Database endpoint:', databaseUrl.match(/ep-[^.]+/)?.[0] || 'unknown');
}

// Ensure DATABASE_URL uses Neon's connection pooler for high concurrency
// This prevents "too many connections" errors by using pooling infrastructure
// Only add -pooler if it's not already present
const hasPooler = databaseUrl.includes('-pooler');

if (!hasPooler) {
  // Replace .region.neon.tech with -pooler.region.neon.tech
  databaseUrl = databaseUrl.replace(
    /\.([a-z0-9-]+)\.neon\.tech/,
    '-pooler.$1.neon.tech'
  );
}

console.log('[DB] Using Neon connection pooler:', hasPooler ? 'YES ✓ (already configured)' : 'YES ✓ (added -pooler)');

// Production-optimized connection pool for 3M+ contacts scale
// Neon guidance: Keep total connections <50 per project
// API processes: 25 connections, Workers: 15-20 connections (total ~40-45)
export const pool = new Pool({ 
  connectionString: databaseUrl,
  max: 25, // API server pool - leaves 15-20 for workers
  min: 2, // Keep 2 warm connections to reduce Neon handshake latency
  idleTimeoutMillis: 60000, // 60s - keep connections warm longer to reduce reconnect storms
  connectionTimeoutMillis: 20000, // 20s - more time for Neon pooler during load spikes
  maxUses: 5000, // Recycle after 5k uses to prevent stale connections
});

// Log connection pool events to help diagnose issues
pool.on('error', (err: Error) => {
  console.error('[DB Pool] Unexpected error on idle client:', err);
  
  // Prevent crash on connection errors - log and continue
  // These errors are usually recovered automatically by the pool
  if (err.message?.includes('Cannot set property message')) {
    console.error('[DB Pool] Neon WebSocket error detected - connection will be recycled');
  }
});

pool.on('connect', () => {
  const { totalCount, idleCount, waitingCount } = pool;
  console.log(`[DB Pool] Client connected | Total: ${totalCount}, Idle: ${idleCount}, Waiting: ${waitingCount}`);
});

pool.on('remove', () => {
  const { totalCount, idleCount, waitingCount } = pool;
  console.log(`[DB Pool] Client removed | Total: ${totalCount}, Idle: ${idleCount}, Waiting: ${waitingCount}`);
});

// Database health monitoring with improved circuit breaker
let operationFailures = 0; // Track operation failures, not individual retry attempts
const FAILURE_THRESHOLD = 10; // Higher threshold for concurrent operations
const FAILURE_WINDOW = 60000; // 1 minute window
let failureWindowStart = Date.now();

// Pool health metrics for monitoring and circuit breaking
export const poolMetrics = {
  getStats() {
    return {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      failureRate: operationFailures,
      isHealthy: operationFailures < FAILURE_THRESHOLD && pool.waitingCount < 10
    };
  },
  isCircuitOpen() {
    // Circuit opens if too many failures or too many waiting connections
    return operationFailures >= FAILURE_THRESHOLD || pool.waitingCount >= 15;
  }
};

/**
 * Database query wrapper with retry logic and jittered exponential backoff
 * Use this for critical operations that need resilience against transient failures
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5, // Increased from 3 to 5 per architect guidance
  context = 'database operation'
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Success - reset failure counter if in new window
      if (Date.now() - failureWindowStart > FAILURE_WINDOW) {
        operationFailures = 0;
        failureWindowStart = Date.now();
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Determine if error is retryable
      const isRetryable = 
        error.message?.includes('connection') ||
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('pool') ||
        error.message?.includes('ETIMEDOUT') ||
        error.message?.includes('too many clients') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';
      
      if (!isRetryable || attempt === maxRetries) {
        // Track operation failure only on final failure
        if (attempt === maxRetries) {
          operationFailures++;
          
          // Reset window if needed
          if (Date.now() - failureWindowStart > FAILURE_WINDOW) {
            operationFailures = 1;
            failureWindowStart = Date.now();
          }
          
          // Log warning if failure rate is high
          if (operationFailures >= FAILURE_THRESHOLD) {
            console.error(`[DB Health] High failure rate detected: ${operationFailures} failures in last minute`);
            console.error(`[DB Health] Pool stats:`, poolMetrics.getStats());
          }
        }
        
        console.error(`[DB] ${context} failed after ${attempt} attempts:`, error.message);
        throw error;
      }
      
      // Jittered exponential backoff per architect guidance
      const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      const jitter = Math.random() * 1000; // 0-1000ms random jitter
      const delay = baseDelay + jitter;
      
      console.warn(`[DB] ${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay.toFixed(0)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Operation failed');
}

export const db = drizzle({ client: pool, schema });

// Separate connection pool for background workers (BullMQ)
// Workers get 15-20 connections, limiting per-worker pools to max 5 connections
export const workerPool = new Pool({
  connectionString: databaseUrl,
  max: 20, // Worker pool: 6-8 workers × ~3 connections each
  min: 2, // Keep 2 warm connections to reduce Neon handshake latency
  idleTimeoutMillis: 60000, // 60s - keep connections warm for bursty workloads
  connectionTimeoutMillis: 20000, // 20s - more time for Neon pooler during load spikes
  maxUses: 5000, // Recycle after 5k uses
});

// Log worker pool events
workerPool.on('error', (err: Error) => {
  console.error('[Worker Pool] Unexpected error on idle client:', err);
});

workerPool.on('connect', () => {
  const { totalCount, idleCount, waitingCount } = workerPool;
  console.log(`[Worker Pool] Client connected | Total: ${totalCount}, Idle: ${idleCount}, Waiting: ${waitingCount}`);
});

export const workerDb = drizzle({ client: workerPool, schema });
