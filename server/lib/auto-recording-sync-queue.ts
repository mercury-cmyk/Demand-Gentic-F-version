import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL || '', {
  maxRetriesPerRequest: null,
});

export interface AutoRecordingSyncJobData {
  leadId: string;
  contactFirstName: string | null;
  agentId: string | null;
  telnyxCallId: string | null;
  dialedNumber: string | null;
  campaignId: string | null;
}

export const autoRecordingSyncQueue = new Queue<AutoRecordingSyncJobData>('auto-recording-sync', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
      count: 500,
    },
  },
});

/**
 * Schedule auto recording sync job with 60-second delay
 */
export async function scheduleAutoRecordingSync(data: AutoRecordingSyncJobData): Promise<void> {
  try {
    // Add job with 60-second delay
    await autoRecordingSyncQueue.add(
      'fetch-and-transcribe',
      data,
      {
        delay: 60000, // 60 seconds
        jobId: `auto-sync-${data.leadId}`, // Prevent duplicate jobs for same lead
      }
    );

    console.log(`[AutoRecordingSync] Scheduled job for lead ${data.leadId} (will execute in 60s)`);
  } catch (error) {
    console.error(`[AutoRecordingSync] Error scheduling job for lead ${data.leadId}:`, error);
    throw error;
  }
}

/**
 * Cancel pending auto recording sync job
 */
export async function cancelAutoRecordingSync(leadId: string): Promise<void> {
  try {
    const jobId = `auto-sync-${leadId}`;
    const job = await autoRecordingSyncQueue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[AutoRecordingSync] Cancelled job for lead ${leadId}`);
    }
  } catch (error) {
    console.error(`[AutoRecordingSync] Error cancelling job for lead ${leadId}:`, error);
  }
}
