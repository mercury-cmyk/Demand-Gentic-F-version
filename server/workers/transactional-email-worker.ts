/**
 * Transactional Email Worker
 *
 * BullMQ worker for processing transactional email jobs asynchronously.
 * Handles SMTP delivery via OAuth2-authenticated providers.
 */

import { Queue, Worker, type Job } from "bullmq";
import { db } from "../db";
import { smtpProviders, transactionalEmailLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { smtpOAuthService } from "../services/smtp-oauth-service";

/**
 * Transactional email job data structure
 */
export interface TransactionalEmailJobData {
  logId: string;
  providerId: string;
  to: string;
  toName?: string;
  from: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Transactional email job result
 */
export interface TransactionalEmailJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: number;
}

let transactionalEmailQueue: Queue<TransactionalEmailJobData> | null = null;

/**
 * Process individual transactional email job
 */
async function processTransactionalEmailJob(
  data: TransactionalEmailJobData
): Promise<TransactionalEmailJobResult> {
  const { logId, providerId } = data;

  try {
    // Update log status to sending
    await db
      .update(transactionalEmailLogs)
      .set({ status: "sending" })
      .where(eq(transactionalEmailLogs.id, logId));

    // Get provider
    const [provider] = await db
      .select()
      .from(smtpProviders)
      .where(eq(smtpProviders.id, providerId));

    if (!provider) {
      throw new Error(`SMTP provider not found: ${providerId}`);
    }

    if (!provider.isActive) {
      throw new Error(`SMTP provider is inactive: ${provider.name}`);
    }

    // Check rate limits
    const rateLimitCheck = await smtpOAuthService.checkRateLimits(provider);
    if (!rateLimitCheck.allowed) {
      throw new Error(rateLimitCheck.reason);
    }

    // Create transporter and send
    const transporter = await smtpOAuthService.createTransporter(provider);

    const toAddress = data.toName
      ? `${data.toName} <${data.to}>`
      : data.to;

    const mailOptions: any = {
      from: `${data.fromName} <${data.from}>`,
      to: toAddress,
      subject: data.subject,
      html: data.html,
    };

    if (data.text) {
      mailOptions.text = data.text;
    }

    if (data.replyTo) {
      mailOptions.replyTo = data.replyTo;
    }

    const info = await transporter.sendMail(mailOptions);

    // Update log with success
    await db
      .update(transactionalEmailLogs)
      .set({
        status: "sent",
        messageId: info.messageId,
        sentAt: new Date(),
      })
      .where(eq(transactionalEmailLogs.id, logId));

    // Update rate limits
    await smtpOAuthService.updateRateLimits(providerId);

    console.log(
      `[Transactional Email Worker] Successfully sent email to ${data.to} (${logId})`
    );

    return {
      success: true,
      messageId: info.messageId,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error(
      `[Transactional Email Worker] Failed to send email ${logId}:`,
      error
    );

    // Get current retry count
    const [log] = await db
      .select()
      .from(transactionalEmailLogs)
      .where(eq(transactionalEmailLogs.id, logId));

    const retryCount = (log?.retryCount || 0) + 1;
    const maxRetries = log?.maxRetries || 3;
    const isFinalFailure = retryCount >= maxRetries;

    // Update log with failure
    await db
      .update(transactionalEmailLogs)
      .set({
        status: isFinalFailure ? "failed" : "pending",
        errorMessage: error.message,
        errorCode: error.code || error.responseCode?.toString(),
        retryCount,
        failedAt: isFinalFailure ? new Date() : null,
      })
      .where(eq(transactionalEmailLogs.id, logId));

    // Re-throw to trigger BullMQ retry if not final failure
    if (!isFinalFailure) {
      throw error;
    }

    return {
      success: false,
      error: error.message,
      timestamp: Date.now(),
    };
  }
}

/**
 * Initialize transactional email queue
 */
export function initializeTransactionalEmailQueue(): Queue<TransactionalEmailJobData> {
  if (transactionalEmailQueue) return transactionalEmailQueue;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn(
      "[Transactional Email Queue] REDIS_URL not configured, creating in-memory queue"
    );
    // Create a mock queue for development without Redis
    return {
      add: async (name: string, data: TransactionalEmailJobData) => {
        // Process immediately in development
        await processTransactionalEmailJob(data);
        return { id: name } as any;
      },
    } as any;
  }

  transactionalEmailQueue = new Queue<TransactionalEmailJobData>(
    "transactional-email-send",
    {
      connection: {
        url: redisUrl,
      },
    }
  );

  // Process jobs with concurrency of 3 (lower than marketing emails)
  const worker = new Worker(
    "transactional-email-send",
    async (job: Job<TransactionalEmailJobData>) => {
      return processTransactionalEmailJob(job.data);
    },
    {
      connection: {
        url: redisUrl,
      },
      concurrency: 3,
    }
  );

  worker.on("completed", (job) => {
    console.log(
      `[Transactional Email Worker] Job ${job.id} completed successfully`
    );
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[Transactional Email Worker] Job ${job?.id} failed:`,
      err.message
    );
  });

  worker.on("error", (err) => {
    // Suppress Redis connection errors - they're expected when Redis is unavailable
    if (
      err.code === "ECONNREFUSED" ||
      err.message?.includes("ECONNREFUSED")
    ) {
      return; // Silent - Redis is optional
    }
    console.error("[Transactional Email Worker] Worker error:", err);
  });

  console.log("[Transactional Email Worker] Queue initialized");

  return transactionalEmailQueue;
}

/**
 * Queue a transactional email for sending
 */
export async function queueTransactionalEmail(
  jobData: TransactionalEmailJobData
): Promise<void> {
  if (!transactionalEmailQueue) {
    const queue = initializeTransactionalEmailQueue();
    transactionalEmailQueue = queue;
  }

  if (transactionalEmailQueue && "add" in transactionalEmailQueue) {
    await transactionalEmailQueue.add(
      `transactional-${jobData.logId}`,
      jobData,
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // Start with 5 second delay
        },
        removeOnComplete: true,
        removeOnFail: false,
        priority: 1, // High priority for transactional emails
      }
    );
  }
}

// Export queue
export { transactionalEmailQueue };
