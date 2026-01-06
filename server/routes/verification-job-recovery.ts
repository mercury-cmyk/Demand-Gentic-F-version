/**
 * Job Recovery Routes
 * Handles restarting stuck/failed email validation jobs
 */

import { Router } from "express";
import { db } from "../db";
import { verificationEmailValidationJobs, verificationContacts } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../auth";

const router = Router();

/**
 * Get email validation job status
 * GET /api/verification-campaigns/:campaignId/email-validation-jobs/:jobId
 */
router.get("/api/verification-campaigns/:campaignId/email-validation-jobs/:jobId", requireAuth, async (req, res) => {
  try {
    const { campaignId, jobId } = req.params;
    
    const [job] = await db
      .select()
      .from(verificationEmailValidationJobs)
      .where(and(
        eq(verificationEmailValidationJobs.id, jobId),
        eq(verificationEmailValidationJobs.campaignId, campaignId)
      ));
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    res.json({
      jobId: job.id,
      campaignId: job.campaignId,
      status: job.status,
      totalContacts: job.totalContacts,
      processedContacts: job.processedContacts,
      totalBatches: job.totalBatches,
      currentBatch: job.currentBatch,
      successCount: job.successCount,
      failureCount: job.failureCount,
      statusCounts: job.statusCounts,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      updatedAt: job.updatedAt,
    });
    
  } catch (error) {
    console.error("[JOB STATUS] Error fetching job status:", error);
    res.status(500).json({ 
      error: "Failed to fetch job status", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

/**
 * Restart a stuck or failed email validation job
 * POST /api/verification-campaigns/:campaignId/email-validation-jobs/:jobId/restart
 */
router.post("/api/verification-campaigns/:campaignId/email-validation-jobs/:jobId/restart", requireAuth, async (req, res) => {
  try {
    const { campaignId, jobId } = req.params;
    
    // Fetch the job
    const [job] = await db
      .select()
      .from(verificationEmailValidationJobs)
      .where(and(
        eq(verificationEmailValidationJobs.id, jobId),
        eq(verificationEmailValidationJobs.campaignId, campaignId)
      ));
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Only allow restarting stuck or failed jobs
    if (job.status === 'completed') {
      return res.status(400).json({ error: "Cannot restart a completed job" });
    }
    
    console.log(`[JOB RECOVERY] Restarting job ${jobId} (status: ${job.status}, processed: ${job.processedContacts}/${job.totalContacts})`);
    
    // Reset job to processing status (keep existing progress)
    await db.update(verificationEmailValidationJobs)
      .set({
        status: 'processing',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(verificationEmailValidationJobs.id, jobId));
    
    // Import and restart the processing function
    const { processEmailValidationJob } = await import("./verification-contacts");
    
    // Start background processing with setImmediate (more reliable than Promise)
    setImmediate(async () => {
      try {
        console.log(`[JOB RECOVERY] setImmediate triggered for job ${jobId}`);
        await (processEmailValidationJob as any)(jobId);
      } catch (error) {
        console.error(`[JOB RECOVERY] Job ${jobId} failed during restart:`, error);
        await db.update(verificationEmailValidationJobs)
          .set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(verificationEmailValidationJobs.id, jobId))
          .catch(err => console.error(`[JOB RECOVERY] Failed to update job status:`, err));
      }
    });
    
    res.json({
      message: "Job restarted successfully",
      jobId,
      status: 'processing',
      processedContacts: job.processedContacts,
      totalContacts: job.totalContacts,
    });
    
  } catch (error) {
    console.error("[JOB RECOVERY] Error restarting job:", error);
    res.status(500).json({ 
      error: "Failed to restart job", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

/**
 * Recover all stuck jobs for a campaign
 * POST /api/verification-campaigns/:campaignId/email-validation-jobs/recover-stuck
 */
router.post("/api/verification-campaigns/:campaignId/email-validation-jobs/recover-stuck", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Find stuck jobs (processing status for more than 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const stuckJobs = await db
      .select()
      .from(verificationEmailValidationJobs)
      .where(and(
        eq(verificationEmailValidationJobs.campaignId, campaignId),
        eq(verificationEmailValidationJobs.status, 'processing'),
        sql`${verificationEmailValidationJobs.updatedAt} < ${thirtyMinutesAgo}`
      ));
    
    if (stuckJobs.length === 0) {
      return res.json({
        message: "No stuck jobs found",
        recoveredCount: 0,
      });
    }
    
    console.log(`[JOB RECOVERY] Found ${stuckJobs.length} stuck jobs for campaign ${campaignId}`);
    
    // Import processing function
    const { processEmailValidationJob } = await import("./verification-contacts");
    
    // Restart each stuck job
    for (const job of stuckJobs) {
      console.log(`[JOB RECOVERY] Restarting stuck job ${job.id}`);
      
      // Start background processing with setImmediate (more reliable than Promise)
      setImmediate(async () => {
        try {
          console.log(`[JOB RECOVERY] setImmediate triggered for stuck job ${job.id}`);
          await (processEmailValidationJob as any)(job.id);
        } catch (error) {
          console.error(`[JOB RECOVERY] Job ${job.id} failed during recovery:`, error);
          await db.update(verificationEmailValidationJobs)
            .set({
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : String(error),
              finishedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(verificationEmailValidationJobs.id, job.id))
            .catch(err => console.error(`[JOB RECOVERY] Failed to update job status:`, err));
        }
      });
    }
    
    res.json({
      message: `Restarted ${stuckJobs.length} stuck job(s)`,
      recoveredCount: stuckJobs.length,
      jobs: stuckJobs.map(j => ({
        jobId: j.id,
        processedContacts: j.processedContacts,
        totalContacts: j.totalContacts,
      })),
    });
    
  } catch (error) {
    console.error("[JOB RECOVERY] Error recovering stuck jobs:", error);
    res.status(500).json({ 
      error: "Failed to recover stuck jobs", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;
