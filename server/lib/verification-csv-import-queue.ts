/**
 * Verification CSV Import Queue Setup
 * High-performance queue for verification contact imports using PostgreSQL COPY
 */

import { Queue, Worker } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable } from './queue';
import { processVerificationCSVImport, VerificationCSVImportJobData, VerificationCSVImportJobResult } from '../workers/verification-csv-import-worker';

/**
 * Verification CSV Import Queue
 */
export let verificationCSVImportQueue: Queue<VerificationCSVImportJobData> | null = null;

/**
 * Verification CSV Import Worker
 */
let verificationCSVImportWorker: Worker<VerificationCSVImportJobData> | null = null;

/**
 * Initialize verification CSV import queue and worker
 */
export function initializeVerificationCSVImportQueue(): void {
  if (!isQueueAvailable()) {
    console.warn('[VerificationCSVImportQueue] Redis not available - queue will not be initialized');
    return;
  }

  // Create queue
  verificationCSVImportQueue = createQueue<VerificationCSVImportJobData>('verification-csv-import', {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  });

  if (!verificationCSVImportQueue) {
    console.error('[VerificationCSVImportQueue] Failed to create queue');
    return;
  }

  // OPTIMIZED: 4 concurrent workers for verification imports
  // Each job uses ~3 connections peak, so 4 jobs × 3 = 12 connections (safe for worker pool)
  verificationCSVImportWorker = createWorker<VerificationCSVImportJobData>(
    'verification-csv-import',
    async (job) => {
      try {
        // Import poolMetrics dynamically to check circuit breaker
        const { poolMetrics } = await import('../db');
        
        // CIRCUIT BREAKER: Fail fast if pool is unhealthy
        if (poolMetrics.isCircuitOpen()) {
          const stats = poolMetrics.getStats();
          console.error('[VerificationCSVImportQueue] Circuit breaker OPEN - rejecting job', stats);
          throw new Error(`Circuit breaker open: pool unhealthy (failures: ${stats.failureRate}, waiting: ${stats.waiting})`);
        }
        
        return await processVerificationCSVImport(job);
      } catch (error) {
        console.error(`[VerificationCSVImportQueue] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      concurrency: 4, // 4 concurrent workers
      lockDuration: 1800000, // 30 minutes for large uploads with eligibility/suppression checks
      stalledInterval: 300000, // 5 minutes stall check interval (prevents false stall detection for large imports)
      limiter: {
        max: 8, // 8 jobs/sec
        duration: 1000,
      },
    }
  );

  if (verificationCSVImportWorker) {
    console.log('[VerificationCSVImportQueue] Worker started successfully with 4 concurrent jobs (5k batch size, 8 jobs/sec rate limit)');
    console.log('[VerificationCSVImportQueue] Circuit breaker enabled - will fail fast if pool becomes unhealthy');
  } else {
    console.warn('[VerificationCSVImportQueue] Worker could not be started');
  }
}

/**
 * Add a verification CSV import job to the queue
 */
export async function addVerificationCSVImportJob(jobData: VerificationCSVImportJobData): Promise<string | null> {
  if (!verificationCSVImportQueue) {
    console.warn('[VerificationCSVImportQueue] Queue not available');
    return null;
  }

  const job = await verificationCSVImportQueue.add('import-verification-contacts', jobData, {
    jobId: `verification-csv-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  });

  console.log(`[VerificationCSVImportQueue] Job ${job.id} added to queue`);
  return job.id ?? null;
}

/**
 * Get job status and progress
 */
export async function getVerificationCSVImportJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: any;
  result?: VerificationCSVImportJobResult;
  error?: string | undefined;
} | null> {
  if (!verificationCSVImportQueue) {
    return null;
  }

  const job = await verificationCSVImportQueue.getJob(jobId);
  
  if (!job) {
    return null;
  }

  return {
    id: job.id!,
    state: await job.getState(),
    progress: job.progress,
    result: (await job.isCompleted()) ? job.returnvalue : undefined,
    error: (await job.isFailed()) ? job.failedReason : undefined,
  };
}
