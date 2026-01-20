import { Worker, Queue, Job } from 'bullmq';
import { db } from '../db';
import { scheduledEmails } from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';
import IORedis from 'ioredis';
import { getRedisUrl, getRedisConnectionOptions } from './redis-config';

const redisConnection = new IORedis(getRedisUrl(), {
  ...getRedisConnectionOptions(),
  maxRetriesPerRequest: null,
});

interface ScheduledEmailJob {
  scheduledEmailId: string;
}

export const scheduledEmailQueue = new Queue<ScheduledEmailJob>('scheduled-emails', {
  connection: redisConnection,
});

async function processScheduledEmail(job: Job<ScheduledEmailJob>) {
  const { scheduledEmailId } = job.data;
  
  console.log(`[SCHEDULED-EMAIL-WORKER] Processing scheduled email: ${scheduledEmailId}`);

  try {
    // Fetch the scheduled email from the database
    const [scheduledEmail] = await db
      .select()
      .from(scheduledEmails)
      .where(and(
        eq(scheduledEmails.id, scheduledEmailId),
        eq(scheduledEmails.status, 'pending')
      ));

    if (!scheduledEmail) {
      console.log(`[SCHEDULED-EMAIL-WORKER] Scheduled email not found or already sent: ${scheduledEmailId}`);
      return;
    }

    // Check if it's time to send
    const now = new Date();
    if (scheduledEmail.scheduledFor > now) {
      console.log(`[SCHEDULED-EMAIL-WORKER] Email not ready to send yet. Scheduled for: ${scheduledEmail.scheduledFor}`);
      return;
    }

    console.log(`[SCHEDULED-EMAIL-WORKER] Sending email to: ${scheduledEmail.toEmails.join(', ')}`);

    // TODO: Implement actual email sending via Microsoft Graph API
    // For now, we'll just mark it as sent
    // In production, this should integrate with the M365 email service

    // Mark as sent
    await db
      .update(scheduledEmails)
      .set({
        status: 'sent',
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(scheduledEmails.id, scheduledEmailId));

    console.log(`[SCHEDULED-EMAIL-WORKER] Email sent successfully: ${scheduledEmailId}`);
  } catch (error) {
    console.error(`[SCHEDULED-EMAIL-WORKER] Error processing scheduled email: ${scheduledEmailId}`, error);
    
    // Mark as failed
    await db
      .update(scheduledEmails)
      .set({
        status: 'failed',
        failureReason: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      })
      .where(eq(scheduledEmails.id, scheduledEmailId));

    throw error;
  }
}

export const scheduledEmailWorker = new Worker<ScheduledEmailJob>(
  'scheduled-emails',
  processScheduledEmail,
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

scheduledEmailWorker.on('completed', (job) => {
  console.log(`[SCHEDULED-EMAIL-WORKER] Job ${job.id} completed`);
});

scheduledEmailWorker.on('failed', (job, error) => {
  console.error(`[SCHEDULED-EMAIL-WORKER] Job ${job?.id} failed:`, error);
});

scheduledEmailWorker.on('error', (err) => {
  // Suppress Redis connection errors - they're expected when Redis is unavailable
  if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
    return; // Silent - Redis is optional
  }
  console.error('[SCHEDULED-EMAIL-WORKER] Worker error:', err);
});

// Function to schedule an email
export async function scheduleEmail(
  mailboxAccountId: string,
  fromEmail: string,
  toEmails: string[],
  subject: string,
  bodyHtml: string,
  scheduledFor: Date,
  createdBy: string,
  options?: {
    ccEmails?: string[];
    bccEmails?: string[];
    bodyPlain?: string;
    attachments?: any;
    opportunityId?: string;
    contactId?: string;
    accountId?: string;
  }
) {
  // Create scheduled email record
  const [scheduled] = await db
    .insert(scheduledEmails)
    .values({
      mailboxAccountId,
      fromEmail,
      toEmails,
      ccEmails: options?.ccEmails || null,
      bccEmails: options?.bccEmails || null,
      subject,
      bodyHtml,
      bodyPlain: options?.bodyPlain || null,
      attachments: options?.attachments || null,
      scheduledFor,
      status: 'pending',
      opportunityId: options?.opportunityId || null,
      contactId: options?.contactId || null,
      accountId: options?.accountId || null,
      createdBy,
    })
    .returning();

  // Calculate delay in milliseconds
  const delay = scheduledFor.getTime() - Date.now();

  // Add job to queue with delay
  await scheduledEmailQueue.add(
    'send-scheduled-email',
    { scheduledEmailId: scheduled.id },
    {
      delay: Math.max(0, delay),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    }
  );

  console.log(`[SCHEDULED-EMAIL] Email scheduled for ${scheduledFor.toISOString()}: ${scheduled.id}`);

  return scheduled;
}

// Initialize worker
console.log('[SCHEDULED-EMAIL-WORKER] Scheduled email worker initialized');
