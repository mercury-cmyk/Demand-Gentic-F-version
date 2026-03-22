/**
 * Enrichment Jobs API Routes
 * 
 * Handles verification contact enrichment job management
 */

import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import { verificationEnrichmentJobs, verificationContacts, verificationCampaigns } from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { queueEnrichmentJob, cancelEnrichmentJob } from '../lib/enrichment-queue';

const router = Router();

/**
 * POST /api/enrichment-jobs
 * Queue a new enrichment job for a verification campaign
 */
router.post('/enrichment-jobs', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId, force = false } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    // Verify campaign exists
    const [campaign] = await db
      .select({ id: verificationCampaigns.id })
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Handle force flag - two-phase orchestration: remove from Redis first, then create new job
    if (force) {
      const [existingJob] = await db
        .select({ 
          id: verificationEnrichmentJobs.id,
          status: verificationEnrichmentJobs.status
        })
        .from(verificationEnrichmentJobs)
        .where(
          and(
            eq(verificationEnrichmentJobs.campaignId, campaignId),
            sql`${verificationEnrichmentJobs.status} IN ('pending', 'processing')`
          )
        )
        .orderBy(desc(verificationEnrichmentJobs.createdAt))
        .limit(1);

      if (existingJob) {
        console.log(`[EnrichmentAPI] Force flag set - canceling existing job ${existingJob.id} for campaign ${campaignId}`);
        
        // Phase 1: Remove from Redis (BullMQ) and update DB atomically
        // cancelEnrichmentJob does: discard() + remove() + DB status update
        const cancelled = await cancelEnrichmentJob(existingJob.id);
        
        if (!cancelled) {
          console.error(`[EnrichmentAPI] Failed to cancel existing job ${existingJob.id}`);
          return res.status(500).json({ 
            error: 'Failed to cancel existing enrichment job',
            existingJobId: existingJob.id
          });
        }

        // Phase 2: Verify cancellation persisted before proceeding
        const [verifyJob] = await db
          .select({ status: verificationEnrichmentJobs.status })
          .from(verificationEnrichmentJobs)
          .where(eq(verificationEnrichmentJobs.id, existingJob.id))
          .limit(1);

        if (verifyJob && (verifyJob.status === 'pending' || verifyJob.status === 'processing')) {
          console.error(`[EnrichmentAPI] Job ${existingJob.id} still active after cancellation attempt`);
          return res.status(500).json({ 
            error: 'Failed to cancel existing job - status verification failed',
            existingJobId: existingJob.id
          });
        }

        console.log(`[EnrichmentAPI] Successfully cancelled job ${existingJob.id}, proceeding with new job`);
      }
    }

    // Get RESERVED contacts for this campaign (reservedSlot=true after cap enforcement)
    // This ensures we only enrich contacts actually selected for delivery
    const contacts = await db
      .select({
        id: verificationContacts.id,
        accountId: verificationContacts.accountId
      })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.eligibilityStatus, 'Eligible'),
          eq(verificationContacts.reservedSlot, true),
          eq(verificationContacts.deleted, false),
          eq(verificationContacts.suppressed, false)
        )
      );

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No eligible contacts found in this campaign' });
    }

    const contactIds = contacts.map(c => c.id);
    const uniqueAccountIds = [...new Set(contacts.map(c => c.accountId).filter((id): id is string => !!id))];

    // Create enrichment job record (wrapped in try-catch for unique violation handling)
    let job;
    try {
      [job] = await db
        .insert(verificationEnrichmentJobs)
        .values({
          campaignId,
          totalContacts: contacts.length,
          totalAccounts: uniqueAccountIds.length,
          totalChunks: Math.ceil(contacts.length / 25),
          contactIds,
          accountIds: uniqueAccountIds,
          force,
          createdBy: req.user?.userId || undefined
        })
        .returning();
    } catch (dbError: any) {
      // Handle unique constraint violation (concurrent request created job)
      if (dbError.code === '23505' && dbError.constraint === 'verification_enrichment_jobs_unique_active_campaign') {
        console.log(`[EnrichmentAPI] Unique constraint violation - active job already exists for campaign ${campaignId}`);
        
        // Fetch the ACTIVE existing job (must filter by status to avoid returning completed jobs)
        const [existingJob] = await db
          .select({ 
            id: verificationEnrichmentJobs.id,
            status: verificationEnrichmentJobs.status,
            totalContacts: verificationEnrichmentJobs.totalContacts,
            totalAccounts: verificationEnrichmentJobs.totalAccounts,
            createdAt: verificationEnrichmentJobs.createdAt
          })
          .from(verificationEnrichmentJobs)
          .where(
            and(
              eq(verificationEnrichmentJobs.campaignId, campaignId),
              sql`${verificationEnrichmentJobs.status} IN ('pending', 'processing')`
            )
          )
          .orderBy(desc(verificationEnrichmentJobs.createdAt))
          .limit(1);

        if (existingJob) {
          return res.status(409).json({ 
            error: 'An enrichment job is already running for this campaign',
            existingJobId: existingJob.id,
            existingJob: {
              id: existingJob.id,
              status: existingJob.status,
              totalContacts: existingJob.totalContacts,
              totalAccounts: existingJob.totalAccounts,
              createdAt: existingJob.createdAt
            }
          });
        }
      }
      
      // Re-throw if not a unique violation or no existing job found
      throw dbError;
    }

    // Queue the job for processing
    await queueEnrichmentJob(
      job.id,
      campaignId,
      req.user?.userId || 'unknown',
      contactIds
    );

    console.log(`[EnrichmentAPI] Queued enrichment job ${job.id} for campaign ${campaignId} (${contacts.length} contacts)`);

    res.status(201).json({
      success: true,
      job: {
        id: job.id,
        campaignId: job.campaignId,
        status: job.status,
        totalContacts: job.totalContacts,
        totalAccounts: job.totalAccounts,
        createdAt: job.createdAt
      }
    });

  } catch (error: any) {
    console.error('[EnrichmentAPI] Error queuing enrichment job:', error);
    res.status(500).json({ error: error.message || 'Failed to queue enrichment job' });
  }
});

/**
 * GET /api/enrichment-jobs/:id
 * Get enrichment job progress
 */
router.get('/enrichment-jobs/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [job] = await db
      .select()
      .from(verificationEnrichmentJobs)
      .where(eq(verificationEnrichmentJobs.id, id))
      .limit(1);

    if (!job) {
      return res.status(404).json({ error: 'Enrichment job not found' });
    }

    // Calculate progress percentage
    const progressPercentage = job.totalContacts > 0 
      ? Math.round((job.processedContacts / job.totalContacts) * 100)
      : 0;

    res.json({
      success: true,
      job: {
        id: job.id,
        campaignId: job.campaignId,
        status: job.status,
        totalContacts: job.totalContacts,
        totalAccounts: job.totalAccounts,
        processedContacts: job.processedContacts,
        processedAccounts: job.processedAccounts,
        currentChunk: job.currentChunk,
        totalChunks: job.totalChunks,
        successCount: job.successCount,
        lowConfidenceCount: job.lowConfidenceCount,
        failedCount: job.failedCount,
        skippedCount: job.skippedCount,
        dedupeSnapshot: job.dedupeSnapshot,
        errors: job.errors,
        errorMessage: job.errorMessage,
        progressPercentage,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        updatedAt: job.updatedAt
      }
    });

  } catch (error: any) {
    console.error('[EnrichmentAPI] Error fetching enrichment job:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch enrichment job' });
  }
});

/**
 * GET /api/campaigns/:campaignId/enrichment-jobs
 * List all enrichment jobs for a campaign
 */
router.get('/campaigns/:campaignId/enrichment-jobs', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const jobs = await db
      .select({
        id: verificationEnrichmentJobs.id,
        status: verificationEnrichmentJobs.status,
        totalContacts: verificationEnrichmentJobs.totalContacts,
        totalAccounts: verificationEnrichmentJobs.totalAccounts,
        processedContacts: verificationEnrichmentJobs.processedContacts,
        processedAccounts: verificationEnrichmentJobs.processedAccounts,
        successCount: verificationEnrichmentJobs.successCount,
        lowConfidenceCount: verificationEnrichmentJobs.lowConfidenceCount,
        failedCount: verificationEnrichmentJobs.failedCount,
        skippedCount: verificationEnrichmentJobs.skippedCount,
        dedupeSnapshot: verificationEnrichmentJobs.dedupeSnapshot,
        createdAt: verificationEnrichmentJobs.createdAt,
        startedAt: verificationEnrichmentJobs.startedAt,
        finishedAt: verificationEnrichmentJobs.finishedAt
      })
      .from(verificationEnrichmentJobs)
      .where(eq(verificationEnrichmentJobs.campaignId, campaignId))
      .orderBy(desc(verificationEnrichmentJobs.createdAt))
      .limit(limit);

    res.json({
      success: true,
      jobs: jobs.map(job => ({
        ...job,
        progressPercentage: job.totalContacts > 0 
          ? Math.round((job.processedContacts / job.totalContacts) * 100)
          : 0
      }))
    });

  } catch (error: any) {
    console.error('[EnrichmentAPI] Error listing enrichment jobs:', error);
    res.status(500).json({ error: error.message || 'Failed to list enrichment jobs' });
  }
});

/**
 * POST /api/enrichment-jobs/:id/cancel
 * Cancel an enrichment job
 */
router.post('/enrichment-jobs/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if job exists
    const [job] = await db
      .select({ status: verificationEnrichmentJobs.status })
      .from(verificationEnrichmentJobs)
      .where(eq(verificationEnrichmentJobs.id, id))
      .limit(1);

    if (!job) {
      return res.status(404).json({ error: 'Enrichment job not found' });
    }

    if (job.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed job' });
    }

    if (job.status === 'cancelled') {
      return res.status(400).json({ error: 'Job is already cancelled' });
    }

    // Cancel the job
    const cancelled = await cancelEnrichmentJob(id);

    if (!cancelled) {
      return res.status(500).json({ error: 'Failed to cancel job' });
    }

    console.log(`[EnrichmentAPI] Cancelled enrichment job ${id}`);

    res.json({
      success: true,
      message: 'Enrichment job cancelled successfully'
    });

  } catch (error: any) {
    console.error('[EnrichmentAPI] Error cancelling enrichment job:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel enrichment job' });
  }
});

export default router;