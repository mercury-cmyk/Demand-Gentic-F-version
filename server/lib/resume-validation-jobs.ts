/**
 * Auto-Resume Stuck Email Validation Jobs
 * Automatically resumes email validation jobs that were interrupted by server restarts
 */

import { db } from "../db";
import { verificationEmailValidationJobs } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { processEmailValidationJob } from "../routes/verification-contacts";

/**
 * Resume all stuck email validation jobs on server startup
 * Finds jobs that have been "processing" for more than 5 minutes without updates
 */
export async function resumeStuckEmailValidationJobs() {
  try {
    console.log('[VALIDATION RESUME] Checking for stuck email validation jobs...');
    
    // Find jobs stuck in "processing" status for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const stuckJobs = await db
      .select()
      .from(verificationEmailValidationJobs)
      .where(
        sql`${verificationEmailValidationJobs.status} = 'processing' AND ${verificationEmailValidationJobs.updatedAt} < ${fiveMinutesAgo}`
      );
    
    if (stuckJobs.length === 0) {
      console.log('[VALIDATION RESUME] No stuck jobs found');
      return;
    }
    
    console.log(`[VALIDATION RESUME] Found ${stuckJobs.length} stuck job(s), resuming...`);
    
    for (const job of stuckJobs) {
      console.log(`[VALIDATION RESUME] Resuming job ${job.id} (created: ${job.createdAt}, processed: ${job.processedContacts}/${job.totalContacts})`);
      
      // Resume processing using setImmediate (same as new jobs)
      setImmediate(async () => {
        try {
          await processEmailValidationJob(job.id);
        } catch (error) {
          console.error(`[VALIDATION RESUME] Job ${job.id} failed during resume:`, error);
          
          // Mark as failed
          await db.update(verificationEmailValidationJobs)
            .set({
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : String(error),
              finishedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(verificationEmailValidationJobs.id, job.id))
            .catch(err => console.error(`[VALIDATION RESUME] Failed to update job status:`, err));
        }
      });
    }
    
    console.log(`[VALIDATION RESUME] All ${stuckJobs.length} job(s) queued for resumption`);
  } catch (error) {
    console.error('[VALIDATION RESUME] Error checking for stuck jobs:', error);
  }
}
