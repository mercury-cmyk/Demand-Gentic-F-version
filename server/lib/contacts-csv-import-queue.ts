/**
 * Contacts CSV Import Queue Setup
 * Initializes BullMQ queue and worker for contacts CSV imports from S3
 */

import { Queue, Worker } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable } from './queue';
import { processContactsCSVImport, ContactsCSVImportJobData, ContactsCSVImportJobResult } from '../workers/contacts-csv-import-worker';

/**
 * Contacts CSV Import Queue
 */
export let contactsCSVImportQueue: Queue<ContactsCSVImportJobData> | null = null;

/**
 * Contacts CSV Import Worker
 */
let contactsCSVImportWorker: Worker<ContactsCSVImportJobData> | null = null;

/**
 * Initialize contacts CSV import queue and worker
 */
export function initializeContactsCSVImportQueue(): void {
  if (!isQueueAvailable()) {
    console.warn('[ContactsCSVImportQueue] Redis not available - queue will not be initialized');
    return;
  }

  // Create queue
  contactsCSVImportQueue = createQueue<ContactsCSVImportJobData>('contacts-csv-import', {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 10000, // Start with 10 second delay
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 200, // Keep last 200 failed jobs
  });

  if (!contactsCSVImportQueue) {
    console.error('[ContactsCSVImportQueue] Failed to create queue');
    return;
  }

  // SCALE OPTIMIZED: 6 concurrent workers for 3M+ contact imports (balanced for pool capacity)
  // With dedicated worker pool (max 20) and 5000 row batches, we run 6 concurrent jobs
  // Each job uses ~3 connections peak, so 6 jobs × 3 = 18 connections (safely fits in 20-connection pool)
  // Rate limiting (10 jobs/sec) allows fast processing while circuit breaker prevents pool exhaustion
  // IMPORTANT: Must check circuit breaker before processing jobs
  contactsCSVImportWorker = createWorker<ContactsCSVImportJobData>(
    'contacts-csv-import',
    async (job) => {
      try {
        // Import poolMetrics dynamically to check circuit breaker
        const { poolMetrics } = await import('../db');
        
        // CIRCUIT BREAKER: Fail fast if pool is unhealthy
        if (poolMetrics.isCircuitOpen()) {
          const stats = poolMetrics.getStats();
          console.error('[ContactsCSVImportQueue] Circuit breaker OPEN - rejecting job', stats);
          throw new Error(`Circuit breaker open: pool unhealthy (failures: ${stats.failureRate}, waiting: ${stats.waiting})`);
        }
        
        return await processContactsCSVImport(job);
      } catch (error) {
        console.error(`[ContactsCSVImportQueue] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      concurrency: 6, // REBALANCED: 6 concurrent workers (6 × 3 = 18 connections < 20 pool max)
      limiter: {
        max: 10, // OPTIMIZED: 10 jobs/sec (5x faster than before, safe with circuit breaker)
        duration: 1000, // 1 second window
      },
    }
  );

  if (contactsCSVImportWorker) {
    console.log('[ContactsCSVImportQueue] Worker started successfully with 6 concurrent jobs (5k batch size, 10 jobs/sec rate limit)');
    console.log('[ContactsCSVImportQueue] Circuit breaker enabled - will fail fast if pool becomes unhealthy');
  } else {
    console.warn('[ContactsCSVImportQueue] Worker could not be started');
  }
}

/**
 * Add a contacts CSV import job to the queue
 * 
 * @param jobData - Job data including S3 key and field mappings
 * @returns Job ID
 */
export async function addContactsCSVImportJob(jobData: ContactsCSVImportJobData): Promise<string | null> {
  if (!contactsCSVImportQueue) {
    console.warn('[ContactsCSVImportQueue] Queue not available');
    return null;
  }

  const job = await contactsCSVImportQueue.add('import-contacts', jobData, {
    jobId: `contacts-csv-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  });

  console.log(`[ContactsCSVImportQueue] Job ${job.id} added to queue`);
  return job.id ?? null;
}

/**
 * Get job status and progress
 * 
 * @param jobId - Job ID
 * @returns Job status and progress
 */
export async function getContactsCSVImportJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: any;
  result?: ContactsCSVImportJobResult;
  error?: string | undefined;
} | null> {
  if (!contactsCSVImportQueue) {
    return null;
  }

  const job = await contactsCSVImportQueue.getJob(jobId);
  
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;
  const returnValue = await job.returnvalue;
  const failedReason = job.failedReason;

  return {
    id: job.id || jobId,
    state,
    progress,
    result: returnValue,
    error: failedReason || undefined,
  };
}

/**
 * Close queue and worker connections
 */
export async function closeContactsCSVImportQueue(): Promise<void> {
  if (contactsCSVImportWorker) {
    await contactsCSVImportWorker.close();
    console.log('[ContactsCSVImportQueue] Worker closed');
  }

  if (contactsCSVImportQueue) {
    await contactsCSVImportQueue.close();
    console.log('[ContactsCSVImportQueue] Queue closed');
  }
}
