/**
 * Number Pool Scheduled Tasks
 * 
 * Cron jobs for maintaining the number pool:
 * - Hourly: Reset hourly call counters
 * - Daily: Reset daily call counters, archive metrics
 * - Every 5 min: Process expired cooldowns
 * - Hourly: Recalculate reputation scores
 * 
 * @see docs/NUMBER_POOL_MANAGEMENT_SYSTEM.md
 */

import {
  resetHourlyCounters,
  resetDailyCounters,
  getPoolSummary,
} from './number-pool/number-service';
import {
  processExpiredCooldowns,
  getNumbersInCooldown,
} from './number-pool/cooldown-manager';
import {
  recalculateAllReputations,
} from './number-pool/reputation-engine';
import { db } from '../db';
import { telnyxNumbers, numberCooldowns } from '@shared/number-pool-schema';
import { ne, eq } from 'drizzle-orm';
import { forceReleaseAllNumbers, invalidatePoolCache } from './number-pool/number-router-service';

// ==================== TYPES ====================

interface ScheduledTask {
  name: string;
  intervalMs: number;
  lastRun: Date | null;
  nextRun: Date;
  isRunning: boolean;
  runCount: number;
  lastError: string | null;
  handler: () => Promise<void>;
}

// ==================== STATE ====================

const tasks: Map<string, ScheduledTask> = new Map();
const intervals: Map<string, NodeJS.Timeout> = new Map();
let isInitialized = false;

// ==================== TASK DEFINITIONS ====================

const TASK_DEFINITIONS = {
  // Reset hourly counters at the top of each hour
  resetHourlyCounters: {
    intervalMs: 60 * 60 * 1000, // 1 hour
    handler: async () => {
      const count = await resetHourlyCounters();
      console.log(`[NumberPoolScheduler] Reset hourly counters for ${count} numbers`);
    },
  },

  // Reset daily counters at midnight
  resetDailyCounters: {
    intervalMs: 24 * 60 * 60 * 1000, // 24 hours
    handler: async () => {
      const count = await resetDailyCounters();
      console.log(`[NumberPoolScheduler] Reset daily counters for ${count} numbers`);
    },
  },

  // Process expired cooldowns every 5 minutes
  processExpiredCooldowns: {
    intervalMs: 5 * 60 * 1000, // 5 minutes
    handler: async () => {
      const processed = await processExpiredCooldowns();
      if (processed > 0) {
        console.log(`[NumberPoolScheduler] Processed ${processed} expired cooldowns`);
      }
    },
  },

  // Recalculate all reputation scores every hour
  recalculateReputations: {
    intervalMs: 60 * 60 * 1000, // 1 hour
    handler: async () => {
      const result = await recalculateAllReputations();
      console.log(`[NumberPoolScheduler] Recalculated reputations: ${result.processed} success, ${result.failed} failed`);
    },
  },

  // Log pool summary every 15 minutes (for monitoring)
  logPoolSummary: {
    intervalMs: 15 * 60 * 1000, // 15 minutes
    handler: async () => {
      const summary = await getPoolSummary();
      console.log('[NumberPoolScheduler] Pool Summary:', {
        total: summary.totalNumbers,
        active: summary.activeNumbers,
        cooldown: summary.cooldownNumbers,
        healthy: summary.healthyNumbers,
        warning: summary.warningNumbers,
        risk: summary.riskNumbers,
        burned: summary.burnedNumbers,
      });
    },
  },
};

// ==================== STARTUP ACTIVATION ====================

/**
 * On startup: activate all non-retired numbers, clear cooldowns, release locks.
 * Ensures the pool starts at maximum capacity every time the server boots.
 */
async function activateAllNumbersOnStartup(): Promise<void> {
  try {
    // 1. Activate all non-retired numbers
    const activated = await db
      .update(telnyxNumbers)
      .set({
        status: 'active',
        statusReason: 'startup-auto-activated',
        statusChangedAt: new Date(),
      })
      .where(ne(telnyxNumbers.status, 'retired'))
      .returning({ id: telnyxNumbers.id });

    // 2. Clear all active cooldowns
    await db
      .update(numberCooldowns)
      .set({ isActive: false, endedEarlyAt: new Date() })
      .where(eq(numberCooldowns.isActive, true));

    // 3. Release all in-memory number locks
    forceReleaseAllNumbers();

    // 4. Invalidate pool cache so next query picks up fresh data
    invalidatePoolCache();

    console.log(`[NumberPoolScheduler] Startup activation: ${activated.length} numbers activated, all cooldowns cleared, all locks released`);
  } catch (err) {
    console.error('[NumberPoolScheduler] Startup activation error:', err);
  }
}

// ==================== SCHEDULER FUNCTIONS ====================

/**
 * Initialize all scheduled tasks
 */
export function initializeScheduler(): void {
  if (isInitialized) {
    console.warn('[NumberPoolScheduler] Already initialized');
    return;
  }

  const enabled = process.env.TELNYX_NUMBER_POOL_ENABLED === 'true';
  if (!enabled) {
    console.log('[NumberPoolScheduler] Number pool disabled, skipping scheduler initialization');
    return;
  }

  console.log('[NumberPoolScheduler] Initializing scheduled tasks...');

  // On startup: activate ALL numbers, clear ALL cooldowns, release ALL locks.
  // This ensures the pool starts fresh with maximum availability.
  activateAllNumbersOnStartup().catch(err => {
    console.error('[NumberPoolScheduler] Startup activation failed:', err);
  });

  for (const [name, definition] of Object.entries(TASK_DEFINITIONS)) {
    registerTask(name, definition.intervalMs, definition.handler);
  }

  isInitialized = true;
  console.log(`[NumberPoolScheduler] Initialized ${tasks.size} tasks`);
}

/**
 * Register a scheduled task
 */
function registerTask(
  name: string,
  intervalMs: number,
  handler: () => Promise<void>
): void {
  const now = new Date();
  const task: ScheduledTask = {
    name,
    intervalMs,
    lastRun: null,
    nextRun: new Date(now.getTime() + intervalMs),
    isRunning: false,
    runCount: 0,
    lastError: null,
    handler,
  };

  tasks.set(name, task);

  // Schedule the interval
  const interval = setInterval(async () => {
    await runTask(name);
  }, intervalMs);

  intervals.set(name, interval);

  console.log(`[NumberPoolScheduler] Registered task: ${name} (every ${formatDuration(intervalMs)})`);
}

/**
 * Run a specific task
 */
async function runTask(name: string): Promise<void> {
  const task = tasks.get(name);
  if (!task) {
    console.error(`[NumberPoolScheduler] Task not found: ${name}`);
    return;
  }

  if (task.isRunning) {
    console.warn(`[NumberPoolScheduler] Task ${name} already running, skipping`);
    return;
  }

  task.isRunning = true;
  const startTime = Date.now();

  try {
    await task.handler();
    task.lastRun = new Date();
    task.nextRun = new Date(Date.now() + task.intervalMs);
    task.runCount++;
    task.lastError = null;

    const duration = Date.now() - startTime;
    if (duration > 1000) {
      console.log(`[NumberPoolScheduler] Task ${name} completed in ${duration}ms`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    task.lastError = errorMessage;
    console.error(`[NumberPoolScheduler] Task ${name} failed:`, error);
  } finally {
    task.isRunning = false;
  }
}

/**
 * Manually trigger a task
 */
export async function triggerTask(name: string): Promise<void> {
  await runTask(name);
}

/**
 * Get status of all tasks
 */
export function getTaskStatus(): {
  name: string;
  intervalMs: number;
  lastRun: Date | null;
  nextRun: Date;
  isRunning: boolean;
  runCount: number;
  lastError: string | null;
}[] {
  return Array.from(tasks.values()).map(task => ({
    name: task.name,
    intervalMs: task.intervalMs,
    lastRun: task.lastRun,
    nextRun: task.nextRun,
    isRunning: task.isRunning,
    runCount: task.runCount,
    lastError: task.lastError,
  }));
}

/**
 * Shutdown the scheduler
 */
export function shutdownScheduler(): void {
  console.log('[NumberPoolScheduler] Shutting down...');

  for (const [name, interval] of intervals) {
    clearInterval(interval);
    console.log(`[NumberPoolScheduler] Stopped task: ${name}`);
  }

  intervals.clear();
  tasks.clear();
  isInitialized = false;

  console.log('[NumberPoolScheduler] Shutdown complete');
}

// ==================== ALIGNMENT HELPERS ====================

/**
 * Calculate initial delay to align task to clock boundary
 */
export function calculateAlignedDelay(intervalMs: number): number {
  const now = Date.now();
  const remainder = now % intervalMs;
  return intervalMs - remainder;
}

/**
 * Initialize scheduler with aligned start times
 */
export function initializeAlignedScheduler(): void {
  if (isInitialized) {
    console.warn('[NumberPoolScheduler] Already initialized');
    return;
  }

  const enabled = process.env.TELNYX_NUMBER_POOL_ENABLED === 'true';
  if (!enabled) {
    console.log('[NumberPoolScheduler] Number pool disabled, skipping scheduler initialization');
    return;
  }

  console.log('[NumberPoolScheduler] Initializing with aligned start times...');

  for (const [name, definition] of Object.entries(TASK_DEFINITIONS)) {
    const delay = calculateAlignedDelay(definition.intervalMs);
    
    console.log(`[NumberPoolScheduler] Task ${name} will start in ${formatDuration(delay)}`);

    // Start with initial delay to align
    setTimeout(() => {
      registerTask(name, definition.intervalMs, definition.handler);
      // Run immediately on first aligned interval
      runTask(name);
    }, delay);
  }

  isInitialized = true;
}

// ==================== UTILITY ====================

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
  return `${Math.round(ms / 86400000)}d`;
}

// ==================== EXPORTS ====================

export default {
  initializeScheduler,
  initializeAlignedScheduler,
  triggerTask,
  getTaskStatus,
  shutdownScheduler,
};
