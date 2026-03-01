/**
 * Email Worker
 * 
 * BullMQ worker for processing email send jobs asynchronously.
 * Handles Mailgun API delivery, retries, and failure tracking.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { db } from '../db';
import { emailSends } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { generateBulkEmailHeaders, validateSenderAuthentication } from '../lib/email-security';

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
 * Send email via Mailgun API
 */
async function sendViaMailgun(options: EmailJobData['options']): Promise<{ messageId: string }> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const apiBase = process.env.MAILGUN_API_BASE || 'https://api.mailgun.net/v3';
  const appBaseUrl = process.env.APP_BASE_URL || 'https://demandgentic.ai';

  if (!apiKey || !domain) {
    throw new Error('Mailgun not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables.');
  }

  // Validate sender authentication
  const authValidation = validateSenderAuthentication(options.from, appBaseUrl);
  if (authValidation.warnings.length > 0) {
    console.warn('[Email Security] Sender authentication warnings:');
    authValidation.warnings.forEach(warning => console.warn(`  ${warning}`));
  }

  const from = options.fromName 
    ? `${options.fromName} <${options.from}>`
    : options.from;

  // Generate all compliance headers
  const securityHeaders = generateBulkEmailHeaders({
    fromEmail: options.from,
    recipientEmail: options.to,
    campaignId: options.campaignId,
    unsubscribeBaseUrl: appBaseUrl,
    messageId: options.sendId,
  });

  // Build form data for Mailgun API
  const formData = new FormData();
  formData.append('from', from);
  formData.append('to', options.to);
  formData.append('subject', options.subject);
  formData.append('html', options.html);
  
  if (options.text) {
    formData.append('text', options.text);
  }
  
  if (options.replyTo) {
    formData.append('h:Reply-To', options.replyTo);
  }
  
  // Add all security headers (List-Unsubscribe, List-Unsubscribe-Post, etc.)
  Object.entries(securityHeaders).forEach(([header, value]) => {
    formData.append(`h:${header}`, value);
  });
  
  // Add Mailgun-specific tracking variables
  if (options.campaignId) {
    formData.append('v:campaign_id', options.campaignId);
  }
  
  if (options.contactId) {
    formData.append('v:contact_id', options.contactId);
  }
  
  if (options.sendId) {
    formData.append('v:send_id', options.sendId);
  }
  
  // Add tags
  if (options.tags && options.tags.length > 0) {
    options.tags.forEach(tag => formData.append('o:tag', tag));
  }
  
  // Enable tracking
  formData.append('o:tracking', 'yes');
  formData.append('o:tracking-clicks', 'yes');
  formData.append('o:tracking-opens', 'yes');

  const auth = Buffer.from(`api:${apiKey}`).toString('base64');
  
  const response = await fetch(`${apiBase}/${domain}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mailgun API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log(`[Email Security] Sent with compliance headers: List-Unsubscribe, List-Unsubscribe-Post, Precedence`);
  return { messageId: result.id || result.message };
}

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

  emailWorker.on('error', (err) => {
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
    // Send via Mailgun API
    const result = await sendViaMailgun(options);
    
    // Update database record
    await db
      .update(emailSends)
      .set({
        status: 'sent',
        sentAt: new Date(),
        messageId: result.messageId,
        metadata: {
          provider: 'mailgun',
          tags: options.tags || [],
        },
      })
      .where(eq(emailSends.id, sendId));

    console.log(`[Email Worker] Successfully sent email to ${options.to} via Mailgun (${sendId})`);

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
        failureReason: error.message,
        failedAt: new Date(),
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
