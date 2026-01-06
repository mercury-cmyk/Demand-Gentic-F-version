/**
 * CSV Import Jobs API Routes
 * Endpoints for managing and monitoring CSV import jobs
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import { addCSVImportJob, getCSVImportJobStatus, csvImportQueue } from '../lib/csv-import-queue';
import { CSVImportJobData } from '../workers/csv-import-worker';

const router = express.Router();

/**
 * Request schema for creating a CSV import job
 */
const createJobSchema = z.object({
  s3Key: z.string().min(1),
  campaignId: z.string().min(1),
  sourceType: z.enum(['sourced', 'scrubbed', 'scrubbed_external']),
  batchSize: z.number().int().min(100).max(10000).optional().default(1000),
  skipDuplicates: z.boolean().optional().default(false),
  fieldMapping: z.record(z.string()).optional(),
});

/**
 * POST /api/csv-import-jobs
 * Create a new CSV import job
 */
router.post('/api/csv-import-jobs', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const jobData = createJobSchema.parse(req.body);

    // Check if queue is available
    if (!csvImportQueue) {
      return res.status(503).json({
        error: 'CSV import queue not available',
        message: 'Redis connection required for background jobs',
      });
    }

    // Add job to queue
    const jobId = await addCSVImportJob(jobData as CSVImportJobData);

    if (!jobId) {
      return res.status(500).json({
        error: 'Failed to create import job',
      });
    }

    res.status(201).json({
      jobId,
      message: 'CSV import job created',
    });
  } catch (error) {
    console.error('[CSVImportJobs] Error creating job:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      error: 'Failed to create CSV import job',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/csv-import-jobs/:jobId
 * Get status and progress of a CSV import job
 */
router.get('/api/csv-import-jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Check if queue is available
    if (!csvImportQueue) {
      return res.status(503).json({
        error: 'CSV import queue not available',
      });
    }

    // Get job status
    const status = await getCSVImportJobStatus(jobId);

    if (!status) {
      return res.status(404).json({
        error: 'Job not found',
        jobId,
      });
    }

    res.json(status);
  } catch (error) {
    console.error('[CSVImportJobs] Error getting job status:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/csv-import-jobs
 * List recent CSV import jobs
 */
router.get('/api/csv-import-jobs', async (req: Request, res: Response) => {
  try {
    // Check if queue is available
    if (!csvImportQueue) {
      return res.status(503).json({
        error: 'CSV import queue not available',
      });
    }

    // Get recent jobs (completed, failed, active, waiting)
    const [completed, failed, active, waiting] = await Promise.all([
      csvImportQueue.getCompleted(0, 49), // Last 50 completed
      csvImportQueue.getFailed(0, 49),    // Last 50 failed
      csvImportQueue.getActive(0, 9),     // Current 10 active
      csvImportQueue.getWaiting(0, 9),    // Next 10 waiting
    ]);

    const allJobs = [
      ...completed.map(job => ({ ...job, state: 'completed' })),
      ...failed.map(job => ({ ...job, state: 'failed' })),
      ...active.map(job => ({ ...job, state: 'active' })),
      ...waiting.map(job => ({ ...job, state: 'waiting' })),
    ];

    // Sort by timestamp (most recent first)
    allJobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    res.json({
      total: allJobs.length,
      jobs: allJobs.slice(0, 50).map(job => ({
        id: job.id,
        state: job.state,
        data: job.data,
        progress: job.progress,
        timestamp: job.timestamp,
      })),
    });
  } catch (error) {
    console.error('[CSVImportJobs] Error listing jobs:', error);
    res.status(500).json({
      error: 'Failed to list jobs',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
