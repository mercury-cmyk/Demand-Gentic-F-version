/**
 * Storage File Operations API
 * Handles presigned URLs for direct browser-to-GCS uploads and downloads
 */

import express from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { verifyToken } from '../auth';
import { 
  getPresignedUploadUrl, 
  getPresignedDownloadUrl, 
  generateStorageKey,
  isS3Configured 
} from '../lib/storage';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";

/**
 * Approved folder prefixes
 * Only these folders are allowed for uploads to prevent unauthorized file placement
 */
const APPROVED_FOLDERS = [
  'uploads',                            // General uploads
  'imports',                            // CSV imports for verification campaigns
  'exports',                            // Generated export files
  'logs',                               // Application logs
  'temp',                               // Temporary files
  'campaign-orders',                    // Client portal agentic order documents
  'campaign-orders/target_accounts',    // Target account lists for orders
  'campaign-orders/suppression',        // Suppression/DNC lists for orders
  'campaign-orders/template',           // Email/call templates for orders
] as const;

/**
 * Request schema for generating upload URL
 */
const uploadUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().default('text/csv'),
  folder: z.enum(APPROVED_FOLDERS).default('uploads'),
});

/**
 * POST /api/s3/upload-url
 * Generate a presigned URL for uploading a file directly to S3
 * 
 * Browser workflow:
 * 1. Call this endpoint with filename and content type
 * 2. Receive presigned URL and S3 key
 * 3. PUT file directly to the presigned URL
 * 4. Use the S3 key to reference the file in subsequent API calls
 */
router.post('/api/s3/upload-url', async (req, res) => {
  const correlationId = `s3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    console.log(`[S3:${correlationId}] Upload URL request received:`, {
      filename: req.body?.filename,
      contentType: req.body?.contentType,
      folder: req.body?.folder,
    });

    // Check if S3 is configured
    if (!isS3Configured()) {
      console.warn(`[S3:${correlationId}] Storage not configured`);
      return res.status(503).json({
        error: 'S3 storage not configured',
        message: 'Server does not have S3 credentials configured. Please contact support.',
      });
    }

    const { filename, contentType, folder } = uploadUrlSchema.parse(req.body);

    // Authentication Check (Dual Auth)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
       return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.substring(7);
    let userContext: any = null;

    // Try main auth
    const mainPayload = verifyToken(token);
    if(mainPayload) userContext = { ...mainPayload, type: 'internal' };

    // Try client auth
    if(!userContext) {
       try {
         const decoded = jwt.verify(token, JWT_SECRET) as any;
         if(decoded.isClient) userContext = { ...decoded, type: 'client' };
       } catch(e) {}
    }

    if(!userContext) return res.status(401).json({ error: 'Invalid token' });

    // Apply strict isolation for Client Portal users
    let storageFolder = folder as string;
    if (userContext.type === 'client' && folder.startsWith('campaign-orders')) {
        // Enforce account isolation: campaign-orders/{clientAccountId}/{suffix}
        const pathSuffix = folder.replace('campaign-orders', ''); 
        storageFolder = `campaign-orders/${userContext.clientAccountId}${pathSuffix}`;
    }

    // Generate storage key with folder structure and timestamp
    const key = generateStorageKey(storageFolder, filename);
    console.log(`[S3:${correlationId}] Generated key: "${key}"`);

    // Generate presigned URL (15 minute expiry)
    const uploadUrl = await getPresignedUploadUrl(key, contentType, 900);
    console.log(`[S3:${correlationId}] Presigned URL generated successfully`);

    return res.json({
      success: true,
      key,
      uploadUrl,
      contentType,
      expiresIn: 900, // seconds
    });
  } catch (error) {
    console.error(`[S3:${correlationId}] Error generating upload URL:`, error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Failed to generate upload URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Request schema for generating download URL
 */
const downloadUrlSchema = z.object({
  key: z.string().min(1),
  expiresIn: z.number().min(60).max(3600).optional().default(900), // 1 min to 1 hour
});

/**
 * POST /api/s3/download-url
 * Generate a presigned URL for downloading a file from S3
 * 
 * Use this to create temporary, secure download links for files in private buckets
 */
router.post('/api/s3/download-url', async (req, res) => {
  try {
    // Check if S3 is configured
    if (!isS3Configured()) {
      return res.status(503).json({
        error: 'S3 storage not configured',
        message: 'Server does not have S3 credentials configured. Please contact support.',
      });
    }

    const { key, expiresIn } = downloadUrlSchema.parse(req.body);

    // Generate presigned URL
    const downloadUrl = await getPresignedDownloadUrl(key, expiresIn);

    return res.json({
      success: true,
      key,
      downloadUrl,
      expiresIn,
    });
  } catch (error) {
    console.error('[S3] Error generating download URL:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Failed to generate download URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/s3/status
 * Check if S3 is configured and operational (No auth required)
 */
router.get('/api/s3/status', (req, res) => {
  const configured = isS3Configured();
  
  res.json({
    configured,
    provider: process.env.S3_ENDPOINT ? 'custom' : 'aws',
    bucket: configured ? (process.env.S3_BUCKET || 'default') : null,
  });
});

export default router;
