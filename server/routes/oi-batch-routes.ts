/**
 * OI Batch Pipeline Routes
 *
 * REST API for creating, monitoring, and cancelling batch
 * account intelligence generation jobs.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { addOiBatchJob } from '../lib/oi-batch-queue';
import {
  resolveAccountIdsFromLists,
  resolveAccountIdsFromCampaign,
  uniqueStrings,
} from '../services/account-resolution-service';

const router = Router();

/**
 * POST /jobs — Create a new batch intelligence job
 */
router.post('/jobs', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const listIds = uniqueStrings(body.listIds);
    const campaignIds = uniqueStrings(body.campaignIds);
    const explicitAccountIds = uniqueStrings(body.accountIds);
    const batchSize = Math.max(1, Math.min(Number(body.batchSize) || 5, 50));
    const concurrency = Math.max(1, Math.min(Number(body.concurrency) || 2, 5));
    const forceRefresh = body.forceRefresh === true;

    if (listIds.length === 0 && campaignIds.length === 0 && explicitAccountIds.length === 0) {
      return res.status(400).json({
        message: 'At least one selector is required: listIds, campaignIds, or accountIds',
      });
    }

    // Resolve all account IDs
    const resolvedAccountIds = new Set<string>(explicitAccountIds);

    if (listIds.length > 0) {
      const listResolution = await resolveAccountIdsFromLists(listIds);
      for (const id of listResolution.accountIds) resolvedAccountIds.add(id);
    }

    if (campaignIds.length > 0) {
      for (const campaignId of campaignIds) {
        const campaignResolution = await resolveAccountIdsFromCampaign(campaignId);
        for (const id of campaignResolution.accountIds) resolvedAccountIds.add(id);
      }
    }

    const accountIds = Array.from(resolvedAccountIds);
    if (accountIds.length === 0) {
      return res.status(400).json({
        message: 'No accounts matched the provided selectors',
      });
    }

    // Create DB record
    const userId = (req as any).user?.id || (req as any).userId || null;
    const job = await storage.createOiBatchJob({
      status: 'pending',
      totalAccounts: accountIds.length,
      processedAccounts: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      batchSize,
      concurrency,
      forceRefresh,
      listIds,
      campaignIds,
      accountIds,
      createdBy: userId,
      errorLog: [],
    });

    // Enqueue BullMQ job
    try {
      await addOiBatchJob({
        jobId: job.id,
        accountIds,
        batchSize,
        concurrency,
        forceRefresh,
      });
    } catch (queueError: any) {
      // Queue unavailable — mark as failed
      await storage.updateOiBatchJob(job.id, {
        status: 'failed',
        errorLog: [{ accountId: 'SYSTEM', error: `Queue unavailable: ${queueError.message}` }],
      });
      return res.status(503).json({
        message: 'Background job queue unavailable. Redis may not be connected.',
        jobId: job.id,
      });
    }

    res.status(201).json({
      message: 'Batch job created',
      jobId: job.id,
      totalAccounts: accountIds.length,
      batchSize,
      concurrency,
    });
  } catch (error: any) {
    console.error('[OiBatch] Failed to create job:', error);
    res.status(500).json({ message: 'Failed to create batch job', error: error.message });
  }
});

/**
 * GET /jobs — List recent batch jobs
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const jobs = await storage.listOiBatchJobs(limit, offset);

    // Strip large accountIds array from list response for performance
    const sanitized = jobs.map((job) => ({
      ...job,
      accountIds: undefined,
      accountCount: Array.isArray(job.accountIds) ? job.accountIds.length : job.totalAccounts,
    }));

    res.json(sanitized);
  } catch (error: any) {
    console.error('[OiBatch] Failed to list jobs:', error);
    res.status(500).json({ message: 'Failed to list batch jobs', error: error.message });
  }
});

/**
 * GET /jobs/:id — Get job detail + progress
 */
router.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const job = await storage.getOiBatchJob(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json({
      ...job,
      // Don't send full accountIds array unless explicitly requested
      accountIds: req.query.includeAccountIds === 'true' ? job.accountIds : undefined,
      accountCount: Array.isArray(job.accountIds) ? job.accountIds.length : job.totalAccounts,
    });
  } catch (error: any) {
    console.error('[OiBatch] Failed to get job:', error);
    res.status(500).json({ message: 'Failed to get batch job', error: error.message });
  }
});

/**
 * POST /jobs/:id/cancel — Cancel a running job
 */
router.post('/jobs/:id/cancel', async (req: Request, res: Response) => {
  try {
    const job = await storage.getOiBatchJob(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (job.status !== 'pending' && job.status !== 'processing') {
      return res.status(400).json({
        message: `Cannot cancel job in "${job.status}" status`,
      });
    }

    await storage.updateOiBatchJob(job.id, {
      status: 'cancelled',
      completedAt: new Date(),
    });

    res.json({ message: 'Job cancelled', jobId: job.id });
  } catch (error: any) {
    console.error('[OiBatch] Failed to cancel job:', error);
    res.status(500).json({ message: 'Failed to cancel batch job', error: error.message });
  }
});

export default router;
