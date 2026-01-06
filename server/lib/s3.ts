/**
 * S3 Client Library
 * Supports AWS S3, Cloudflare R2, Wasabi, MinIO, and other S3-compatible services
 * Provides presigned URLs for direct browser uploads and secure downloads
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

// Environment configuration
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT; // Required for R2/MinIO; omit for AWS
const S3_BUCKET = process.env.S3_BUCKET || 'pivotal-crm-dev';
const S3_PUBLIC_BASE = process.env.S3_PUBLIC_BASE; // Optional CDN base URL

// Check if using custom endpoint (R2, Wasabi, MinIO, etc.)
const isCustomEndpoint = !!S3_ENDPOINT;

/**
 * S3 Client instance
 * Configured to work with AWS S3 and S3-compatible services
 */
export const s3Client = new S3Client({
  region: S3_REGION,
  credentials: S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY ? {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  } : undefined, // Allow IAM roles in production
  ...(isCustomEndpoint ? {
    endpoint: S3_ENDPOINT,
    forcePathStyle: true, // Required for MinIO/some S3-compatible services
  } : {}),
});

export const BUCKET = S3_BUCKET;

/**
 * Generate presigned URL for uploading a file directly to S3
 * Browser can PUT to this URL without server involvement
 * 
 * @param key - S3 object key (file path in bucket)
 * @param contentType - MIME type of the file
 * @param expiresIn - URL expiration time in seconds (default: 15 minutes)
 * @returns Presigned URL for uploading
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 900
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate presigned URL for downloading a file from S3
 * Short-lived URL for secure, temporary access to private files
 * 
 * @param key - S3 object key (file path in bucket)
 * @param expiresIn - URL expiration time in seconds (default: 15 minutes)
 * @returns Presigned URL for downloading
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 900
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Upload a file to S3 (server-side)
 * Use this when you need to upload from the server
 * For browser uploads, use getPresignedUploadUrl instead
 * 
 * @param key - S3 object key (file path in bucket)
 * @param body - File content (Buffer, Stream, or string)
 * @param contentType - MIME type of the file
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Readable | string,
  contentType: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body as any,
    ContentType: contentType,
  });

  await s3Client.send(command);
}

/**
 * Get an object from S3
 * Returns the object body as a stream
 * 
 * @param key - S3 object key (file path in bucket)
 * @returns Object body stream
 */
export async function getFromS3(key: string): Promise<NodeJS.ReadableStream> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  const response = await s3Client.send(command);
  return response.Body as NodeJS.ReadableStream;
}

/**
 * Delete an object from S3
 * 
 * @param key - S3 object key (file path in bucket)
 */
export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Check if an object exists in S3
 * 
 * @param key - S3 object key (file path in bucket)
 * @returns True if object exists, false otherwise
 */
export async function s3ObjectExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Generate S3 key for uploads
 * Creates organized folder structure with timestamps
 * 
 * @param type - File type category (e.g., 'uploads', 'exports', 'logs')
 * @param filename - Original filename
 * @returns S3 key (path)
 */
export function generateS3Key(type: string, filename: string): string {
  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${type}/${timestamp}-${sanitized}`;
}

/**
 * Get public URL for an S3 object (if using CDN)
 * Falls back to generating a presigned URL if no CDN is configured
 * 
 * @param key - S3 object key
 * @returns Public URL or presigned URL
 */
export async function getPublicUrl(key: string): Promise<string> {
  if (S3_PUBLIC_BASE) {
    return `${S3_PUBLIC_BASE}/${key}`;
  }
  
  // No CDN configured, generate presigned URL
  return await getPresignedDownloadUrl(key, 3600); // 1 hour expiry
}

/**
 * Stream a file from S3
 * Returns a readable stream for processing large files without loading into memory
 * 
 * @param key - S3 object key
 * @returns Readable stream with UTF-8 encoding
 */
export async function streamFromS3(key: string): Promise<Readable> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`No body in S3 response for key: ${key}`);
  }

  // AWS SDK returns the Body as a ReadableStream or Blob in browsers,
  // but in Node.js it's already a Readable stream
  const stream = response.Body as Readable;
  
  // Set UTF-8 encoding to prevent character corruption
  stream.setEncoding('utf8');
  
  return stream;
}

/**
 * Check if S3 is properly configured
 * Accepts either explicit credentials OR IAM role-based auth (bucket must be set)
 * @returns True if S3 is configured (either with keys or IAM roles)
 */
export function isS3Configured(): boolean {
  // Bucket is always required
  if (!S3_BUCKET) {
    return false;
  }
  
  // Accept either explicit credentials OR assume IAM role is available
  // If keys are set, validate both are present
  if (S3_ACCESS_KEY_ID || S3_SECRET_ACCESS_KEY) {
    return !!(S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);
  }
  
  // No keys set - assume IAM role auth in production
  return true;
}
