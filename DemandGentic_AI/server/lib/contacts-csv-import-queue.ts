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
export let contactsCSVImportQueue: Queue | null = null;

/**
 * Contacts CSV Import Worker
 */
let contactsCSVImportWorker: Worker | null = null;

/**
 * Initialize contacts CSV import queue and worker
 */
export function initializeContactsCSVImportQueue(): void {
  if (!isQueueAvailable()) {
    console.warn('[ContactsCSVImportQueue] Redis not available - queue will not be initialized');
    return;
  }

  // Create queue
  contactsCSVImportQueue = createQueue('contacts-csv-import', {
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
  contactsCSVImportWorker = createWorker(
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
      concurrency: 6, // REBALANCED: 6 concurrent workers (6 × 3 = 18 connections  {
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
export async function getContactsCSVImportJobStatus(jobId: string): Promise {
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
export async function closeContactsCSVImportQueue(): Promise {
  if (contactsCSVImportWorker) {
    await contactsCSVImportWorker.close();
    console.log('[ContactsCSVImportQueue] Worker closed');
  }

  if (contactsCSVImportQueue) {
    await contactsCSVImportQueue.close();
    console.log('[ContactsCSVImportQueue] Queue closed');
  }
}