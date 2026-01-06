/**
 * Bulk List Operation Queue
 * Handles adding large numbers of contacts to lists using filter criteria
 */

import { Queue, Worker } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable } from './queue';
import { processBulkListOperation, BulkListJobData, BulkListJobResult } from '../workers/bulk-list-worker';

/**
 * Bulk List Operation Queue
 */
export let bulkListQueue: Queue<BulkListJobData> | null = null;

/**
 * Bulk List Worker
 */
let bulkListWorker: Worker<BulkListJobData> | null = null;

/**
 * Initialize bulk list queue and worker
 */
export function initializeBulkListQueue(): void {
  if (!isQueueAvailable()) {
    console.warn('[BulkListQueue] Redis not available - queue will not be initialized');
    return;
  }

  // Create queue
  bulkListQueue = createQueue<BulkListJobData>('bulk-list-operation', {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  });

  if (!bulkListQueue) {
    console.error('[BulkListQueue] Failed to create queue');
    return;
  }

  // Create worker
  bulkListWorker = createWorker<BulkListJobData>(
    'bulk-list-operation',
    async (job) => {
      try {
        return await processBulkListOperation(job);
      } catch (error) {
        console.error(`[BulkListQueue] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    3 // Process 3 jobs concurrently
  );

  if (bulkListWorker) {
    console.log('[BulkListQueue] Worker started successfully');
  } else {
    console.warn('[BulkListQueue] Worker could not be started');
  }
}

/**
 * Add a bulk list operation job to the queue
 * 
 * @param jobData - Job data including list ID and filter criteria
 * @returns Job ID
 */
export async function addBulkListJob(jobData: BulkListJobData): Promise<string | null> {
  if (!bulkListQueue) {
    throw new Error('Bulk list queue not initialized - Redis not available');
  }

  const job = await bulkListQueue.add('add-to-list', jobData, {
    jobId: `bulk-list-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  });

  console.log(`[BulkListQueue] Job ${job.id} added to queue - List: ${jobData.listId}, Filters: ${JSON.stringify(jobData.filterCriteria)}`);
  return job.id;
}

/**
 * Get job status and progress
 * 
 * @param jobId - Job ID
 * @returns Job status and progress
 */
export async function getBulkListJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: any;
  result?: BulkListJobResult;
  error?: string;
} | null> {
  if (!bulkListQueue) {
    return null;
  }

  const job = await bulkListQueue.getJob(jobId);
  
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
export async function closeBulkListQueue(): Promise<void> {
  if (bulkListWorker) {
    await bulkListWorker.close();
    console.log('[BulkListQueue] Worker closed');
  }

  if (bulkListQueue) {
    await bulkListQueue.close();
    console.log('[BulkListQueue] Queue closed');
  }
}
