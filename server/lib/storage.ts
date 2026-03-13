/**
 * Cloud Storage Library
 * Supports Google Cloud Storage (primary) with S3-compatible fallback
 * Provides presigned URLs for direct browser uploads and secure downloads
 */

import { Storage, Bucket } from '@google-cloud/storage';
import { Readable } from 'stream';

// Environment configuration
let GCS_PROJECT_ID = process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
let GCS_BUCKET = process.env.GCS_BUCKET || process.env.S3_BUCKET || 'demandgentic-prod-storage-2026';
let GCS_KEY_FILE = process.env.GCS_KEY_FILE; // Optional: path to service account key file

function buildStorageClient(projectId?: string, keyFilename?: string) {
  return new Storage({
    ...(projectId ? { projectId } : {}),
    ...(keyFilename ? { keyFilename } : {}),
  });
}

// Initialize Google Cloud Storage client
// In Cloud Run, it uses the default service account automatically
let storage = buildStorageClient(GCS_PROJECT_ID, GCS_KEY_FILE);
let bucket: Bucket = storage.bucket(GCS_BUCKET);

/** Always returns the current active bucket name (updated on account switch). */
export function getActiveBucket(): string { return GCS_BUCKET; }
/** Always returns the current active Storage client (updated on account switch). */
export function getStorageClient() { return storage; }
/** @deprecated Import getActiveBucket() instead — this is a snapshot from module load time. */
export const BUCKET = GCS_BUCKET;

/**
 * Reinitialise the GCS singleton with new credentials.
 * Called by the Google Account Manager on account switch.
 */
export function reinitializeStorage(opts: {
  projectId: string;
  bucket: string;
  keyFilename?: string;
}): void {
  GCS_PROJECT_ID = opts.projectId;
  GCS_BUCKET = opts.bucket;
  GCS_KEY_FILE = opts.keyFilename;
  storage = buildStorageClient(opts.projectId, opts.keyFilename);
  bucket = storage.bucket(opts.bucket);
  console.log(`[Storage] ♻️  Reinitialized GCS for project: ${opts.projectId}, bucket: ${opts.bucket}`);
}

// Legacy export for compatibility
export const s3Client = null; // Deprecated - use GCS functions instead

/**
 * Generate presigned URL for uploading a file directly to GCS
 * Browser can PUT to this URL without server involvement
 *
 * @param key - Object key (file path in bucket)
 * @param contentType - MIME type of the file
 * @param expiresIn - URL expiration time in seconds (default: 15 minutes)
 * @returns Presigned URL for uploading
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 900
): Promise<string> {
  try {
    const file = bucket.file(key);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresIn * 1000,
      contentType,
    });

    return url;
  } catch (error: any) {
    // Cloud Run default service account or local dev without signing capability
    if (error?.name === 'SigningError' || error?.message?.includes('client_email') || error?.message?.includes('signBlob')) {
      console.warn(`[GCS] Cannot generate signed upload URL: ${error.message?.substring(0, 100)}`);
      console.warn('[GCS] Falling back to public URL (not recommended for production)');
      return `https://storage.googleapis.com/${GCS_BUCKET}/${key}`;
    }
    throw error;
  }
}

/**
 * Generate presigned URL for downloading a file from GCS
 * Short-lived URL for secure, temporary access to private files
 *
 * @param key - Object key (file path in bucket)
 * @param expiresIn - URL expiration time in seconds (default: 15 minutes)
 * @returns Presigned URL for downloading
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 900
): Promise<string> {
  try {
    const file = bucket.file(key);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresIn * 1000,
    });

    return url;
  } catch (error: any) {
    // Cloud Run default service account or local dev without signing capability
    if (error?.name === 'SigningError' || error?.message?.includes('client_email') || error?.message?.includes('signBlob')) {
      console.warn(`[GCS] Cannot generate signed URL: ${error.message?.substring(0, 100)}`);

      // Try using the bucket's public URL if CDN is configured
      const publicBase = process.env.GCS_PUBLIC_BASE || process.env.S3_PUBLIC_BASE;
      if (publicBase) {
        return `${publicBase}/${key}`;
      }

      // Fallback: use the internal stream proxy URL.
      // The service account CAN read GCS objects directly (just can't sign URLs),
      // so the /api/recordings/:id/stream endpoint will use streamFromGCS() instead.
      // Return a marker URL that recording-storage/recording-link-resolver can detect.
      console.warn('[GCS] Using internal GCS stream fallback (signBlob unavailable)');
      return `gcs-internal://${GCS_BUCKET}/${key}`;
    }
    throw error;
  }
}

/**
 * Read a GCS object directly using the service account's authenticated access.
 * Use this when signBlob is unavailable and signed URLs can't be generated.
 * Returns a readable stream of the file contents.
 */
export async function readFromGCS(key: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string; size: number }> {
  const file = bucket.file(key);
  const [metadata] = await file.getMetadata();
  const stream = file.createReadStream();
  return {
    stream,
    contentType: (metadata.contentType as string) || 'audio/mpeg',
    size: parseInt(metadata.size as string, 10) || 0,
  };
}

/**
 * Upload a file to GCS (server-side)
 * Use this when you need to upload from the server
 * For browser uploads, use getPresignedUploadUrl instead
 *
 * @param key - Object key (file path in bucket)
 * @param body - File content (Buffer, Stream, or string)
 * @param contentType - MIME type of the file
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Readable | string,
  contentType: string
): Promise<void> {
  const file = bucket.file(key);

  if (Buffer.isBuffer(body)) {
    await file.save(body, {
      contentType,
      resumable: false,
    });
  } else if (typeof body === 'string') {
    await file.save(Buffer.from(body), {
      contentType,
      resumable: false,
    });
  } else {
    // Stream upload
    await new Promise<void>((resolve, reject) => {
      const writeStream = file.createWriteStream({
        contentType,
        resumable: false,
      });

      body.pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });
  }
}

/**
 * Alias for uploadToS3 with different parameter order (for backward compatibility)
 */
export async function uploadStreamToS3(
  body: Buffer | Readable | string,
  key: string,
  contentType: string
): Promise<void> {
  return uploadToS3(key, body, contentType);
}

/**
 * Get an object from GCS
 * Returns the object body as a stream
 *
 * @param key - Object key (file path in bucket)
 * @returns Object body stream
 */
export async function getFromS3(key: string): Promise<NodeJS.ReadableStream> {
  const file = bucket.file(key);
  return file.createReadStream();
}

/**
 * Delete an object from GCS
 *
 * @param key - Object key (file path in bucket)
 */
export async function deleteFromS3(key: string): Promise<void> {
  const file = bucket.file(key);
  await file.delete({ ignoreNotFound: true });
}

/**
 * Check if an object exists in GCS
 *
 * @param key - Object key (file path in bucket)
 * @returns True if object exists, false otherwise
 */
export async function s3ObjectExists(key: string): Promise<boolean> {
  const file = bucket.file(key);
  const [exists] = await file.exists();
  return exists;
}

/**
 * Generate storage key for uploads
 * Creates organized folder structure with timestamps
 *
 * @param type - File type category (e.g., 'uploads', 'exports', 'logs')
 * @param filename - Original filename
 * @returns Storage key (path)
 */
export function generateS3Key(type: string, filename: string): string {
  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${type}/${timestamp}-${sanitized}`;
}

// Alias for cleaner naming
export const generateStorageKey = generateS3Key;

/**
 * Get public URL for an object (if bucket is public or using CDN)
 * Falls back to generating a presigned URL if no CDN is configured
 *
 * @param key - Object key
 * @returns Public URL or presigned URL
 */
export async function getPublicUrl(key: string): Promise<string> {
  const publicBase = process.env.GCS_PUBLIC_BASE || process.env.S3_PUBLIC_BASE;

  if (publicBase) {
    return `${publicBase}/${key}`;
  }

  // No CDN configured, generate presigned URL
  return await getPresignedDownloadUrl(key, 3600); // 1 hour expiry
}

/**
 * Stream a file from GCS
 * Returns a readable stream for processing large files without loading into memory
 *
 * @param key - Object key
 * @returns Readable stream with UTF-8 encoding
 */
export async function streamFromS3(key: string): Promise<Readable> {
  const file = bucket.file(key);
  const stream = file.createReadStream();

  // Set UTF-8 encoding to prevent character corruption
  stream.setEncoding('utf8');

  return stream;
}

/**
 * Check if GCS is properly configured
 * In Cloud Run, this always returns true since it uses the default service account
 * @returns True if GCS is configured
 */
export function isS3Configured(): boolean {
  // Bucket is always required
  if (!GCS_BUCKET) {
    return false;
  }

  // In Cloud Run, GCS is always available via the default service account
  // For local development, either GCS_KEY_FILE or GOOGLE_APPLICATION_CREDENTIALS should be set
  return true;
}
