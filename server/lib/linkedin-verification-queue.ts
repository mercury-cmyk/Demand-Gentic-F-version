/**
 * LinkedIn Verification Queue
 * BullMQ queue for async LinkedIn image verification
 */

import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from './queue';
import { verifyLinkedInData } from '../services/linkedin-vision';
import { db } from '../db';
import { leads, activityLog } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface LinkedInVerificationJob {
  leadId: string;
  imageUrl: string;
  contactName: string;
  companyName: string | null;
}

// Create BullMQ queue for LinkedIn verification
const redisConnection = getRedisConnection();

if (!redisConnection) {
  console.warn('[LINKEDIN-QUEUE] No Redis connection - LinkedIn verification will not work');
}

export const linkedinVerificationQueue = redisConnection ? new Queue<LinkedInVerificationJob>(
  'linkedin-verification',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500, // Keep last 500 failed jobs for debugging
    },
  }
) : null;

// Worker to process LinkedIn verification jobs
export const linkedinVerificationWorker = (redisConnection ? new Worker<LinkedInVerificationJob>(
  'linkedin-verification',
  async (job) => {
    const { leadId, imageUrl, contactName, companyName } = job.data;

    console.log('[LINKEDIN-WORKER] Processing verification for lead:', leadId);

    try {
      // Call Gemini Vision API to verify LinkedIn image
      const result = await verifyLinkedInData(imageUrl, {
        fullName: contactName,
        companyName: companyName,
      });

      console.log('[LINKEDIN-WORKER] Verification result:', {
        leadId,
        verified: result.verified,
        matchScore: result.matchScore,
        success: result.success,
      });

      // Determine verification status based on results
      let verificationStatus: 'ai_verified' | 'flagged_review' | 'rejected' = 'flagged_review';
      
      if (result.verified && result.matchScore >= 80) {
        verificationStatus = 'ai_verified';
      } else if (result.errors.length > 0 || result.matchScore < 50) {
        verificationStatus = 'rejected';
      }

      // Update lead with verification results
      await db.update(leads)
        .set({
          verificationStatus,
          linkedinVerificationData: {
            extracted: result.extracted,
            matchScore: result.matchScore,
            verified: result.verified,
            errors: result.errors,
            suggestions: result.suggestions,
            verifiedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));

      // Log activity
      await db.insert(activityLog).values({
        entityType: 'lead',
        entityId: leadId,
        eventType: 'lead_verification_linkedin',
        payload: {
          verificationStatus,
          matchScore: result.matchScore,
          verified: result.verified,
          extracted: result.extracted,
        },
      });

      console.log('[LINKEDIN-WORKER] Verification completed for lead:', leadId);

      return {
        success: true,
        leadId,
        verificationStatus,
        matchScore: result.matchScore,
      };

    } catch (error) {
      console.error('[LINKEDIN-WORKER] Verification failed:', error);

      // Update lead with error status
      await db.update(leads)
        .set({
          verificationStatus: 'rejected',
          linkedinVerificationData: {
            error: error instanceof Error ? error.message : String(error),
            verifiedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));

      throw error; // Re-throw to trigger retry
    }
  },
  {
    connection: redisConnection,
    concurrency: 3, // Process 3 verifications in parallel
  }
) : null);

// Worker event handlers
if (linkedinVerificationWorker) {
  linkedinVerificationWorker.on('completed', (job) => {
    console.log(`[LINKEDIN-WORKER] Job ${job.id} completed for lead:`, job.data.leadId);
  });

  linkedinVerificationWorker.on('failed', (job, err) => {
    console.error(`[LINKEDIN-WORKER] Job ${job?.id} failed:`, err.message);
  });

  linkedinVerificationWorker.on('error', (err) => {
    console.error('[LINKEDIN-WORKER] Worker error:', err);
  });

  console.log('[LINKEDIN-QUEUE] LinkedIn verification queue and worker initialized');
} else {
  console.warn('[LINKEDIN-QUEUE] LinkedIn verification worker not initialized - Redis not available');
}
