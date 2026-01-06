/**
 * Cap Enforcement Queue Setup
 * Initializes BullMQ queue and worker for smart lead cap enforcement
 */

import { Queue, Worker } from 'bullmq';
import { createQueue, createWorker, isQueueAvailable } from './queue';
import { 
  processCapEnforcement, 
  CapEnforcementJobData, 
  CapEnforcementJobResult 
} from '../workers/cap-enforcement-worker';

/**
 * Cap Enforcement Queue
 */
export let capEnforcementQueue: Queue<CapEnforcementJobData> | null = null;

/**
 * Cap Enforcement Worker
 */
let capEnforcementWorker: Worker<CapEnforcementJobData> | null = null;

/**
 * Initialize cap enforcement queue and worker
 */
export function initializeCapEnforcementQueue(): void {
  if (!isQueueAvailable()) {
    console.warn('[CapEnforcementQueue] Redis not available - queue will not be initialized');
    return;
  }

  // Create queue
  capEnforcementQueue = createQueue<CapEnforcementJobData>('cap-enforcement', {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000, // Start with 10 second delay
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs
  });

  if (!capEnforcementQueue) {
    console.error('[CapEnforcementQueue] Failed to create queue');
    return;
  }

  // Create worker - process one job at a time to avoid DB contention
  // Long lock duration for large dataset processing with priority calculations
  capEnforcementWorker = createWorker<CapEnforcementJobData>(
    'cap-enforcement',
    async (job) => {
      try {
        return await processCapEnforcement(job);
      } catch (error) {
        console.error(`[CapEnforcementQueue] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      concurrency: 1, // Process 1 job at a time (these jobs are CPU/DB intensive)
      lockDuration: 720000, // 12 minutes - cap enforcement can process large datasets
      lockRenewTime: 120000, // Renew lock every 2 minutes to keep Redis load predictable
    }
  );

  if (capEnforcementWorker) {
    console.log('[CapEnforcementQueue] Worker started successfully');
  } else {
    console.warn('[CapEnforcementQueue] Worker could not be started');
  }
}

/**
 * Add a cap enforcement job to the queue
 * 
 * @param jobData - Job data including campaign ID and cap
 * @returns Job ID
 */
export async function addCapEnforcementJob(
  jobData: CapEnforcementJobData
): Promise<string | null> {
  if (!capEnforcementQueue) {
    throw new Error('Cap enforcement queue not initialized - Redis not available');
  }

  const job = await capEnforcementQueue.add('enforce-caps', jobData, {
    jobId: `cap-enforcement-${jobData.campaignId}-${Date.now()}`,
  });

  console.log(`[CapEnforcementQueue] Job ${job.id} added to queue for campaign ${jobData.campaignId}`);
  return job.id ?? null;
}

/**
 * Get job status and progress
 * 
 * @param jobId - Job ID
 * @returns Job status and progress
 */
export async function getCapEnforcementJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: any;
  result?: CapEnforcementJobResult;
  error?: string;
} | null> {
  if (!capEnforcementQueue) {
    return null;
  }

  const job = await capEnforcementQueue.getJob(jobId);
  
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
export async function closeCapEnforcementQueue(): Promise<void> {
  if (capEnforcementWorker) {
    await capEnforcementWorker.close();
    console.log('[CapEnforcementQueue] Worker closed');
  }

  if (capEnforcementQueue) {
    await capEnforcementQueue.close();
    console.log('[CapEnforcementQueue] Queue closed');
  }
}
