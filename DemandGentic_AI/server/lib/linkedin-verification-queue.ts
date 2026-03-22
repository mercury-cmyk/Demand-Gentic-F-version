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
// DISABLED: LinkedIn verification feature is no longer active
const redisConnection = null; // Permanently disabled

console.log('[LINKEDIN-QUEUE] LinkedIn verification is disabled');

export const linkedinVerificationQueue = null;

// Worker to process LinkedIn verification jobs
// DISABLED: LinkedIn verification feature is no longer active
export const linkedinVerificationWorker = null;

// Disabled worker function (preserved for reference)
const _disabledWorkerFunction = async (job: any) => {
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
};