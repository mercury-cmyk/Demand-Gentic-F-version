/**
 * OI Batch Pipeline Queue
 *
 * BullMQ queue for processing account intelligence generation
 * in configurable batches with progress tracking.
 */

import { Queue, Worker } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable } from './queue';
import { processOiBatchJob, OiBatchJobData, OiBatchJobResult } from '../workers/oi-batch-worker';

export let oiBatchQueue: Queue<OiBatchJobData> | null = null;
let oiBatchWorker: Worker<OiBatchJobData> | null = null;

export function initializeOiBatchQueue(): void {
  if (!isQueueAvailable()) {
    console.warn('[OiBatchQueue] Redis not available — queue will not be initialized');
    return;
  }

  oiBatchQueue = createQueue<OiBatchJobData>('oi-batch', {
    attempts: 1,       // Don't retry entire batch jobs (they track their own progress)
    removeOnComplete: 50,
    removeOnFail: 200,
  });

  if (!oiBatchQueue) {
    console.error('[OiBatchQueue] Failed to create queue');
    return;
  }

  oiBatchWorker = createWorker<OiBatchJobData>(
    'oi-batch',
    async (job) => {
      try {
        return await processOiBatchJob(job);
      } catch (error) {
        console.error(`[OiBatchQueue] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      concurrency: 1,      // One batch job at a time (concurrency is handled within the worker)
      lockDuration: 600000, // 10 min lock — batch jobs can run a long time
      lockRenewTime: 300000,
    }
  );

  if (oiBatchWorker) {
    console.log('[OiBatchQueue] Worker started successfully');
  } else {
    console.warn('[OiBatchQueue] Worker could not be started');
  }
}

export async function addOiBatchJob(jobData: OiBatchJobData): Promise<string | null> {
  if (!oiBatchQueue) {
    throw new Error('OI batch queue not initialized — Redis not available');
  }

  const job = await oiBatchQueue.add('oi-batch-process', jobData, {
    jobId: `oi-batch-${jobData.jobId}`,
  });

  console.log(`[OiBatchQueue] Job ${job.id} added — ${jobData.accountIds.length} accounts`);
  return job.id ?? null;
}

export async function getOiBatchQueueJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: any;
  result?: OiBatchJobResult;
  error?: string;
} | null> {
  if (!oiBatchQueue) return null;

  const job = await oiBatchQueue.getJob(jobId);
  if (!job) return null;

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

export async function closeOiBatchQueue(): Promise<void> {
  if (oiBatchWorker) {
    await oiBatchWorker.close();
    console.log('[OiBatchQueue] Worker closed');
  }

  if (oiBatchQueue) {
    await oiBatchQueue.close();
    console.log('[OiBatchQueue] Queue closed');
  }
}
