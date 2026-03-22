/**
 * Production Logger
 * 
 * Reduces Cloud Logging volume to stay under ReadRequestsPerMinutePerProject quota.
 * 
 * Features:
 * - LOG_LEVEL environment variable (debug, info, warn, error) - default: 'info'
 * - Sampling: high-frequency logs only emit every Nth call
 * - Deduplication: identical messages within a window are suppressed
 * - Structured JSON output for efficient Cloud Logging ingestion
 * 
 * Usage:
 *   import { logger } from './production-logger';
 *   logger.info('[MyService]', 'Processing call', callId);
 *   logger.debug('[MyService]', 'Detailed info', data); // Only in debug mode
 *   logger.sampled('[MyService]', 10, 'Frequent event', data); // Log every 10th occurrence
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Read level from env, default to 'warn' in production for minimal output
const ENV_LEVEL = (process.env.LOG_LEVEL || 
  (process.env.NODE_ENV === 'production' ? 'warn' : 'info')
).toLowerCase() as LogLevel;

const currentLevel = LOG_LEVELS[ENV_LEVEL] ?? LOG_LEVELS.info;

// Sampling counters for high-frequency log points
const sampleCounters: Map = new Map();

// Deduplication: track recent messages to suppress repeats
const recentMessages: Map = new Map();
const DEDUP_WINDOW_MS = 5_000; // 5 seconds

// Cleanup dedup cache periodically
setInterval(() => {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, timestamp] of recentMessages.entries()) {
    if (timestamp = currentLevel;
}

function isDuplicate(message: string): boolean {
  const now = Date.now();
  const last = recentMessages.get(message);
  if (last && now - last  {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return `${a.message}`;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}

export const logger = {
  debug(...args: any[]): void {
    if (shouldLog('debug')) {
      console.log(...args);
    }
  },

  info(...args: any[]): void {
    if (shouldLog('info')) {
      const msg = formatArgs(args);
      if (!isDuplicate(msg)) {
        console.log(...args);
      }
    }
  },

  warn(...args: any[]): void {
    if (shouldLog('warn')) {
      console.warn(...args);
    }
  },

  error(...args: any[]): void {
    // Errors always log
    console.error(...args);
  },

  /**
   * Sampled logging - only emit every Nth occurrence.
   * Use for high-frequency events that would flood logs.
   * 
   * @param prefix - Log prefix for grouping (e.g., '[TelnyxAiBridge]')
   * @param sampleRate - Log every Nth call (e.g., 10 = log every 10th)
   * @param args - Log arguments
   */
  sampled(prefix: string, sampleRate: number, ...args: any[]): void {
    if (!shouldLog('info')) return;
    
    const key = `${prefix}:${args[0]}`;
    const count = (sampleCounters.get(key) || 0) + 1;
    sampleCounters.set(key, count);

    if (count % sampleRate === 1 || count === 1) {
      console.log(prefix, `[sample ${count}]`, ...args);
    }
  },

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return ENV_LEVEL;
  },
};