/**
 * Contacts CSV Import API Routes
 * Endpoints for uploading and monitoring contacts CSV import jobs
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth } from '../auth';
import { uploadToS3 } from '../lib/storage';
import { addContactsCSVImportJob, getContactsCSVImportJobStatus, contactsCSVImportQueue } from '../lib/contacts-csv-import-queue';
import { ContactsCSVImportJobData } from '../workers/contacts-csv-import-worker';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
});

/**
 * POST /api/contacts-csv-import
 * Upload CSV file and create background import job
 */
router.post('/api/contacts-csv-import', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a CSV file',
      });
    }

    if (!req.user?.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication is required to import contacts',
      });
    }

    // Parse job data from form
    const jobDataSchema = z.object({
      isUnifiedFormat: z.string().transform(val => val === 'true'),
      fieldMappings: z.string().transform(val => JSON.parse(val)),
      headers: z.string().transform(val => JSON.parse(val)),
      batchSize: z.string().optional().transform(val => val ? parseInt(val) : 1000),
      listId: z.string().optional().transform(val => val?.trim() || undefined),
    });

    let jobData;
    try {
      jobData = jobDataSchema.parse(req.body);
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid job data',
        details: error instanceof z.ZodError ? error.errors : String(error),
      });
    }

    // Check if queue is available
    if (!contactsCSVImportQueue) {
      return res.status(503).json({
        error: 'Contacts CSV import queue not available',
        message: 'Redis connection required for server-side background jobs. The client may fall back to browser-side direct import.',
        fallbackMode: 'browser_direct',
        useDirectProcessing: true, // Signal frontend to use direct processing
      });
    }

    // Upload file to S3
    const timestamp = Date.now();
    const s3Key = `csv-imports/contacts/${req.user.userId}/${timestamp}-${req.file.originalname}`;
    
    const s3Result = await uploadToS3(s3Key, req.file.buffer, req.file.mimetype);
    
    if (!s3Result) {
      return res.status(500).json({
        error: 'Failed to upload file to storage',
        useDirectProcessing: true,
      });
    }

    // Add job to queue
    const jobId = await addContactsCSVImportJob({
      s3Key,
      userId: req.user.userId,
      isUnifiedFormat: jobData.isUnifiedFormat,
      fieldMappings: jobData.fieldMappings,
      headers: jobData.headers,
      batchSize: jobData.batchSize,
      listId: jobData.listId,
    } as ContactsCSVImportJobData);

    if (!jobId) {
      return res.status(500).json({
        error: 'Failed to create import job',
        fallbackMode: 'browser_direct',
        useDirectProcessing: true,
      });
    }

    res.status(201).json({
      jobId,
      message: 'CSV import job created - processing in background',
      status: 'queued',
    });
  } catch (error) {
    console.error('[ContactsCSVImport] Error creating job:', error);
    
    res.status(500).json({
      error: 'Failed to create CSV import job',
      message: error instanceof Error ? error.message : String(error),
      fallbackMode: 'browser_direct',
      useDirectProcessing: true,
    });
  }
});

/**
 * GET /api/contacts-csv-import/:jobId
 * Get status and progress of a contacts CSV import job
 */
router.get('/api/contacts-csv-import/:jobId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Check if queue is available
    if (!contactsCSVImportQueue) {
      return res.status(503).json({
        error: 'Contacts CSV import queue not available',
      });
    }

    // Get job status
    const status = await getContactsCSVImportJobStatus(jobId);

    if (!status) {
      return res.status(404).json({
        error: 'Job not found',
        jobId,
      });
    }

    res.json(status);
  } catch (error) {
    console.error('[ContactsCSVImport] Error getting job status:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;