/**
 * CSV Import Queue Setup
 * Initializes BullMQ queue and worker for CSV imports from S3
 */

import { Queue, Worker } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable } from './queue';
import { processCSVImport, CSVImportJobData, CSVImportJobResult } from '../workers/csv-import-worker';

/**
 * CSV Import Queue
 */
export let csvImportQueue: Queue<CSVImportJobData> | null = null;

/**
 * CSV Import Worker
 */
let csvImportWorker: Worker<CSVImportJobData> | null = null;

/**
 * Initialize CSV import queue and worker
 */
export function initializeCSVImportQueue(): void {
  if (!isQueueAvailable()) {
    console.warn('[CSVImportQueue] Redis not available - queue will not be initialized');
    return;
  }

  // Create queue
  csvImportQueue = createQueue<CSVImportJobData>('csv-import', {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5 second delay
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs
  });

  if (!csvImportQueue) {
    console.error('[CSVImportQueue] Failed to create queue');
    return;
  }

  // Create worker
  csvImportWorker = createWorker<CSVImportJobData>(
    'csv-import',
    async (job) => {
      try {
        return await processCSVImport(job);
      } catch (error) {
        console.error(`[CSVImportQueue] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    2 // Process 2 jobs concurrently
  );

  if (csvImportWorker) {
    console.log('[CSVImportQueue] Worker started successfully');
  } else {
    console.warn('[CSVImportQueue] Worker could not be started');
  }
}

/**
 * Add a CSV import job to the queue
 * 
 * @param jobData - Job data including S3 key and campaign ID
 * @returns Job ID
 */
export async function addCSVImportJob(jobData: CSVImportJobData): Promise<string | null> {
  if (!csvImportQueue) {
    throw new Error('CSV import queue not initialized - Redis not available');
  }

  const job = await csvImportQueue.add('import', jobData, {
    jobId: `csv-import-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  });

  console.log(`[CSVImportQueue] Job ${job.id} added to queue`);
  return job.id;
}

/**
 * Get job status and progress
 * 
 * @param jobId - Job ID
 * @returns Job status and progress
 */
export async function getCSVImportJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: any;
  result?: CSVImportJobResult;
  error?: string;
} | null> {
  if (!csvImportQueue) {
    return null;
  }

  const job = await csvImportQueue.getJob(jobId);
  
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
    error: failedReason,
  };
}

/**
 * Close queue and worker connections
 */
export async function closeCSVImportQueue(): Promise<void> {
  if (csvImportWorker) {
    await csvImportWorker.close();
    console.log('[CSVImportQueue] Worker closed');
  }

  if (csvImportQueue) {
    await csvImportQueue.close();
    console.log('[CSVImportQueue] Queue closed');
  }
}
