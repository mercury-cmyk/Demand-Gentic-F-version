/**
 * Email Worker
 * 
 * BullMQ worker for processing email send jobs asynchronously.
 * Handles provider-routed email delivery, retries, and failure tracking.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { db } from '../db';
import { emailSends } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { campaignEmailProviderService } from '../services/campaign-email-provider-service';

/**
 * Email job data structure
 */
export interface EmailJobData {
  sendId: string;
  options: {
    to: string;
    from: string;
    fromName?: string;
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
    providerId?: string;
    providerKey?: string;
    espAdapter?: string;
    listUnsubscribeUrl?: string;
    campaignId: string;
    contactId: string;
    sendId: string;
    tags?: string[];
    customVariables?: Record<string, string>;
  };
}

/**
 * Email job result
 */
export interface EmailJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: number;
}

let emailQueue: Queue<EmailJobData> | null = null;

/**
 * Initialize email queue (called from server startup)
 */
export function initializeEmailQueue(): Queue<EmailJobData> {
  if (emailQueue) return emailQueue;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[Email Queue] REDIS_URL not configured, creating in-memory queue');
    // Create a mock queue for development without Redis
    return {
      add: async (name: string, data: EmailJobData) => {
        // Process immediately in development
        await processEmailJob(data);
        return { id: name } as any;
      },
    } as any;
  }

  emailQueue = new Queue<EmailJobData>('email-send', {
    connection: {
      url: redisUrl,
    },
  });

  // Process jobs with concurrency of 5
  const emailWorker = new Worker('email-send', async (job: Job<EmailJobData>) => {
    return processEmailJob(job.data);
  }, {
    connection: {
      url: redisUrl,
    },
    concurrency: 5,
  });

  emailWorker.on('error', (err: Error & { code?: string }) => {
    // Suppress Redis connection errors - they're expected when Redis is unavailable
    if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      return; // Silent - Redis is optional
    }
    console.error('[email-send] Worker error:', err);
  });

  return emailQueue;
}

/**
 * Process individual email job
 */
async function processEmailJob(data: EmailJobData): Promise<EmailJobResult> {
  const { sendId, options } = data;

  try {
    const result = await campaignEmailProviderService.sendCampaignEmail({
      providerId: options.providerId,
      providerKey: options.providerKey || options.espAdapter,
      options: {
        to: options.to,
        from: options.from,
        fromName: options.fromName,
        replyTo: options.replyTo,
        subject: options.subject,
        html: options.html,
        text: options.text,
        listUnsubscribeUrl: options.listUnsubscribeUrl,
        campaignId: options.campaignId,
        contactId: options.contactId,
        sendId: options.sendId,
        tags: options.tags,
      },
    });
    
    // Update database record
    await db
      .update(emailSends)
      .set({
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: result.messageId,
        provider: result.providerKey,
      })
      .where(eq(emailSends.id, sendId));

    console.log(`[Email Worker] Successfully sent email to ${options.to} via ${result.providerName} (${sendId})`);

    return {
      success: true,
      messageId: result.messageId,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error(`[Email Worker] Failed to send email ${sendId}:`, error);

    // Update database record with failure
    await db
      .update(emailSends)
      .set({
        status: 'failed',
        provider: options.providerKey || options.espAdapter || null,
      })
      .where(eq(emailSends.id, sendId));

    return {
      success: false,
      error: error.message,
      timestamp: Date.now(),
    };
  }
}

/**
 * Queue an email for sending
 */
export async function queueEmail(jobData: EmailJobData): Promise<void> {
  if (!emailQueue) {
    const queue = initializeEmailQueue();
    emailQueue = queue;
  }

  if (emailQueue && 'add' in emailQueue) {
    await emailQueue.add(`send-${jobData.sendId}`, jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}

// Export queue (lazy initialized on first use)
export { emailQueue };
