import { createQueue } from './queue';
import { Queue } from 'bullmq';

export interface AutoRecordingSyncJobData {
  leadId?: string;
  callAttemptId?: string;
  contactFirstName: string | null;
  agentId: string | null;
  telnyxCallId: string | null;
  dialedNumber: string | null;
  campaignId: string | null;
}

// Create queue using shared connection logic
// This returns null if Redis is unavailable
export const autoRecordingSyncQueue = createQueue('auto-recording-sync', {
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
});

/**
 * Schedule auto recording sync job with 60-second delay
 */
export async function scheduleAutoRecordingSync(data: AutoRecordingSyncJobData): Promise {
  try {
    if (!data.leadId && !data.callAttemptId) {
      throw new Error("scheduleAutoRecordingSync requires leadId or callAttemptId");
    }

    if (!autoRecordingSyncQueue) {
      console.warn('[AutoRecordingSync] Redis unavailable - skipping auto-recording sync schedule');
      return;
    }

    const jobId = data.leadId
      ? `auto-sync-${data.leadId}`
      : `auto-sync-attempt-${data.callAttemptId}`;

    // Add job with 60-second delay
    await autoRecordingSyncQueue.add(
      'fetch-and-transcribe',
      data,
      {
        delay: 60000, // 60 seconds
        jobId, // Prevent duplicate jobs for same lead/attempt
      }
    );

    const target = data.leadId ? `lead ${data.leadId}` : `call attempt ${data.callAttemptId}`;
    console.log(`[AutoRecordingSync] Scheduled job for ${target} (will execute in 60s)`);
  } catch (error) {
    const target = data.leadId ? `lead ${data.leadId}` : `call attempt ${data.callAttemptId}`;
    console.error(`[AutoRecordingSync] Error scheduling job for ${target}:`, error);
    // Don't throw to prevent disrupting the call flow for a background task
    // throw error; 
  }
}

/**
 * Cancel pending auto recording sync job
 */
export async function cancelAutoRecordingSync(leadId: string): Promise {
  try {
    if (!autoRecordingSyncQueue) return;
    
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