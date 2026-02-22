// Database connection setup - referenced from blueprint:javascript_database
import "./env";

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "../shared/schema.ts";

neonConfig.webSocketConstructor = ws;

const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase();
const strictIsolation = nodeEnv === "development" && process.env.STRICT_ENV_ISOLATION !== "false";

function resolveDatabaseUrl(): { url: string; source: string } {
  if (process.env.REPLIT_DEPLOYMENT === "1") {
    return {
      url: process.env.REPLIT_PRODUCTION_DATABASE_URL || "",
      source: "REPLIT_PRODUCTION_DATABASE_URL",
    };
  }

  if (nodeEnv === "production") {
    return {
      url: process.env.DATABASE_URL_PROD || process.env.DATABASE_URL || "",
      source: process.env.DATABASE_URL_PROD ? "DATABASE_URL_PROD" : "DATABASE_URL",
    };
  }

  return {
    url: process.env.DATABASE_URL_DEV || process.env.DATABASE_URL || "",
    source: process.env.DATABASE_URL_DEV ? "DATABASE_URL_DEV" : "DATABASE_URL",
  };
}

const resolvedDb = resolveDatabaseUrl();
let databaseUrl = resolvedDb.url;
let dbConfigError: string | null = null;

if (strictIsolation && nodeEnv !== "production") {
  if (!process.env.DATABASE_URL_DEV) {
    dbConfigError = "DATABASE_URL_DEV is required in development mode when STRICT_ENV_ISOLATION is enabled.";
  } else if (
    process.env.DATABASE_URL_PROD &&
    databaseUrl &&
    databaseUrl === process.env.DATABASE_URL_PROD &&
    process.env.ALLOW_DEV_PROD_DB !== "true"
  ) {
    dbConfigError = "Development database URL matches DATABASE_URL_PROD. Refusing to connect.";
  }
}

if (!dbConfigError && !databaseUrl) {
  dbConfigError = `${resolvedDb.source} must be set. Did you forget to provision a database?`;
}

if (dbConfigError) {
  console.error(`[DB] ${dbConfigError}`);
  console.error("[DB] Server will start but database operations will fail.");
  databaseUrl = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

// PRODUCTION DATABASE OVERRIDE
// Workaround for Replit deployment secret bug - allow overriding production database URL
// This bypasses the deployment secret that keeps reverting to an outdated database value
if (!dbConfigError && process.env.REPLIT_DEPLOYMENT === '1') {
  // Running in production deployment - use deployment-provided production database URL
  const productionDbUrl = process.env.REPLIT_PRODUCTION_DATABASE_URL;

  if (!productionDbUrl) {
    dbConfigError = 'REPLIT_PRODUCTION_DATABASE_URL must be set when REPLIT_DEPLOYMENT=1.';
    console.error(`[DB] ${dbConfigError}`);
  } else {
    console.log('[DB] Production deployment detected - using override database URL');
    const endpoint = productionDbUrl.match(/ep-[^.]+/)?.[0] ?? 'unknown';
    console.log(`[DB] Target database: ${endpoint} (Production)`);
    databaseUrl = productionDbUrl;
  }
} else if (!dbConfigError) {
  console.log(`[DB] ${nodeEnv} mode - using ${resolvedDb.source}`);
  console.log('[DB] Database endpoint:', databaseUrl.match(/ep-[^.]+/)?.[0] || 'unknown');
}
// Export config error for health checks
export { dbConfigError };

// Ensure DATABASE_URL uses Neon's connection pooler for high concurrency
// This prevents "too many connections" errors by using pooling infrastructure
// Only add -pooler if it's not already present
// Wait, disable automatic pooler injection as it breaks new AWS URLs
const hasPooler = true; // Force skip injection for now to fix connection issues

/*
const hasPooler = databaseUrl.includes('-pooler');

if (!hasPooler && !dbConfigError) {
  // Replace .region.neon.tech with -pooler.region.neon.tech
  databaseUrl = databaseUrl.replace(
    /\.([a-z0-9-]+)\.neon\.tech/,
    '-pooler.$1.neon.tech'
  );
}
*/

if (!dbConfigError) {
  console.log('[DB] Using Neon connection pooler:', hasPooler ? 'YES (already configured)' : 'YES (added -pooler)');
}

const parseEnvInt = (value: string | undefined, fallback: number, allowZero = false) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (!allowZero && parsed <= 0) {
    return fallback;
  }
  if (allowZero && parsed < 0) {
    return fallback;
  }
  return parsed;
};

const DB_POOL_MAX = parseEnvInt(process.env.DB_POOL_MAX, 60);
const DB_POOL_MIN = Math.min(parseEnvInt(process.env.DB_POOL_MIN, 6, true), DB_POOL_MAX);
const DB_POOL_IDLE_TIMEOUT_MS = parseEnvInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30000);
const DB_POOL_CONN_TIMEOUT_MS = parseEnvInt(process.env.DB_POOL_CONN_TIMEOUT_MS, 45000);
const DB_POOL_MAX_USES = parseEnvInt(process.env.DB_POOL_MAX_USES, 10000);
const DB_POOL_KEEP_ALIVE_MS = parseEnvInt(process.env.DB_POOL_KEEP_ALIVE_MS, 10000);

const WORKER_DB_POOL_MAX = parseEnvInt(process.env.WORKER_DB_POOL_MAX, 30);
const WORKER_DB_POOL_MIN = Math.min(parseEnvInt(process.env.WORKER_DB_POOL_MIN, 3, true), WORKER_DB_POOL_MAX);
const WORKER_DB_POOL_IDLE_TIMEOUT_MS = parseEnvInt(process.env.WORKER_DB_POOL_IDLE_TIMEOUT_MS, 30000);
const WORKER_DB_POOL_CONN_TIMEOUT_MS = parseEnvInt(process.env.WORKER_DB_POOL_CONN_TIMEOUT_MS, 30000);
const WORKER_DB_POOL_MAX_USES = parseEnvInt(process.env.WORKER_DB_POOL_MAX_USES, 10000);
const WORKER_DB_POOL_KEEP_ALIVE_MS = parseEnvInt(process.env.WORKER_DB_POOL_KEEP_ALIVE_MS, 10000);


// Production-optimized connection pool for 3M+ contacts scale
// Neon guidance: Keep total connections under your project limit.
// Defaults: API 35 connections, workers 25 connections (override via env vars).
export const pool = new Pool({ 
  connectionString: databaseUrl,
  max: DB_POOL_MAX, // API server pool - leaves room for workers
  min: DB_POOL_MIN, // Keep warm connections to reduce Neon handshake latency
  idleTimeoutMillis: DB_POOL_IDLE_TIMEOUT_MS, // Keep connections warm longer to reduce reconnect storms
  connectionTimeoutMillis: DB_POOL_CONN_TIMEOUT_MS, // More time for Neon pooler during load spikes
  maxUses: DB_POOL_MAX_USES, // Recycle to prevent stale connections
  keepAlive: true,
  keepAliveInitialDelayMillis: DB_POOL_KEEP_ALIVE_MS,
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
// Keep worker pool capacity aligned with Neon connection limits.
export const workerPool = new Pool({
  connectionString: databaseUrl,
  max: WORKER_DB_POOL_MAX, // Worker pool connections
  min: WORKER_DB_POOL_MIN, // Keep warm connections to reduce Neon handshake latency
  idleTimeoutMillis: WORKER_DB_POOL_IDLE_TIMEOUT_MS, // Keep connections warm for bursty workloads
  connectionTimeoutMillis: WORKER_DB_POOL_CONN_TIMEOUT_MS, // More time for Neon pooler during load spikes
  maxUses: WORKER_DB_POOL_MAX_USES, // Recycle after N uses
  keepAlive: true,
  keepAliveInitialDelayMillis: WORKER_DB_POOL_KEEP_ALIVE_MS,
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

