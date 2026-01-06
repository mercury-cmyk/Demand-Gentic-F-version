/**
 * Cap Enforcement Worker
 * Background worker for processing smart lead cap enforcement jobs
 */

import { Job } from 'bullmq';
import { enforceAccountCapWithPriority } from '../lib/verification-utils';

/**
 * Cap Enforcement Job Data
 */
export interface CapEnforcementJobData {
  campaignId: string;  // Campaign to enforce caps for
  cap: number;         // Number of contacts per account to select
}

/**
 * Cap Enforcement Job Result
 */
export interface CapEnforcementJobResult {
  accountsProcessed: number;
  processed: number;
  contactsMarkedEligible: number;
  contactsMarkedCapReached: number;
  errors: number | string[];
  duration: number;
}

/**
 * Cap Enforcement Worker Processor
 * Processes smart lead cap enforcement for a campaign
 */
export async function processCapEnforcement(
  job: Job<CapEnforcementJobData>
): Promise<CapEnforcementJobResult> {
  const startTime = Date.now();
  const { campaignId, cap } = job.data;

  console.log(`[CapEnforcementWorker] Starting job ${job.id} for campaign ${campaignId} with cap ${cap}`);

  // Update job progress
  await job.updateProgress({
    stage: 'starting',
    message: 'Initializing cap enforcement...',
  });

  try {
    // Get total accounts for progress tracking
    const { db } = await import('../db');
    const { verificationContacts } = await import('@shared/schema');
    const { eq, and, sql } = await import('drizzle-orm');
    
    const accountResults = await db
      .selectDistinct({ accountId: verificationContacts.accountId })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false),
          sql`${verificationContacts.accountId} IS NOT NULL`
        )
      );
    
    const totalAccounts = accountResults.length;
    
    // Run the cap enforcement logic with progress callback
    const stats = await enforceAccountCapWithPriority(
      campaignId, 
      cap,
      // Progress callback - update BullMQ job progress
      async (accountsProcessed: number) => {
        const percentage = Math.round((accountsProcessed / totalAccounts) * 100);
        await job.updateProgress({
          stage: 'processing',
          message: `Processing accounts: ${accountsProcessed}/${totalAccounts} (${percentage}%)`,
          accountsProcessed,
          totalAccounts,
          percentage,
        });
      }
    );

    const duration = Date.now() - startTime;

    // Update final progress
    await job.updateProgress({
      stage: 'complete',
      message: `Processed ${stats.accountsProcessed} accounts`,
      stats,
    });

    console.log(`[CapEnforcementWorker] Job ${job.id} completed in ${duration}ms`);

    return {
      accountsProcessed: stats.accountsProcessed,
      processed: stats.processed,
      contactsMarkedEligible: stats.contactsMarkedEligible,
      contactsMarkedCapReached: stats.contactsMarkedCapReached,
      errors: stats.errors,
      duration,
    };
  } catch (error) {
    console.error(`[CapEnforcementWorker] Job ${job.id} failed:`, error);
    
    await job.updateProgress({
      stage: 'failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}
