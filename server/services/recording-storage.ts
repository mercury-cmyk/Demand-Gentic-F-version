/**
 * Recording Storage Service
 * Downloads call recordings from Telnyx and stores them permanently in S3
 * Provides long-lived URLs for customer sharing
 */

import { uploadToS3, getPresignedDownloadUrl, s3ObjectExists, isS3Configured, BUCKET } from '../lib/s3';
import { db } from '../db';
import { leads } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const RECORDING_PREFIX = 'recordings';

/**
 * Generate S3 key for a lead recording
 */
export function getRecordingS3Key(leadId: string, extension: string = 'mp3'): string {
  return `${RECORDING_PREFIX}/${leadId}.${extension}`;
}

/**
 * Download a recording from a URL and upload to S3
 * Returns the S3 key for the stored recording
 */
export async function downloadAndStoreRecording(
  sourceUrl: string,
  leadId: string
): Promise<string | null> {
  if (!isS3Configured()) {
    console.log('[RecordingStorage] S3 not configured, skipping storage');
    return null;
  }

  try {
    console.log(`[RecordingStorage] Downloading recording for lead ${leadId}...`);
    
    // Determine file extension from URL
    const extension = sourceUrl.includes('.wav') ? 'wav' : 'mp3';
    const contentType = extension === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const s3Key = getRecordingS3Key(leadId, extension);
    
    // Download from Telnyx
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download recording: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`[RecordingStorage] Downloaded ${buffer.length} bytes, uploading to S3...`);
    
    // Upload to S3
    await uploadToS3(s3Key, buffer, contentType);
    
    console.log(`[RecordingStorage] ✅ Stored recording at ${s3Key}`);
    return s3Key;
  } catch (error) {
    console.error(`[RecordingStorage] Failed to store recording for lead ${leadId}:`, error);
    return null;
  }
}

/**
 * Get a presigned URL for a recording (7 days expiry)
 * If recording is stored in S3, returns a fresh presigned URL
 * Falls back to the original Telnyx URL if not stored
 */
export async function getRecordingUrl(
  leadId: string,
  fallbackUrl?: string | null
): Promise<{ url: string; source: 'local' | 'telnyx' | null }> {
  if (!isS3Configured()) {
    return { url: fallbackUrl || '', source: fallbackUrl ? 'telnyx' : null };
  }

  try {
    // Check for mp3 first, then wav
    const mp3Key = getRecordingS3Key(leadId, 'mp3');
    const wavKey = getRecordingS3Key(leadId, 'wav');
    
    if (await s3ObjectExists(mp3Key)) {
      // Generate 7-day presigned URL
      const url = await getPresignedDownloadUrl(mp3Key, 7 * 24 * 60 * 60);
      return { url, source: 'local' };
    }
    
    if (await s3ObjectExists(wavKey)) {
      const url = await getPresignedDownloadUrl(wavKey, 7 * 24 * 60 * 60);
      return { url, source: 'local' };
    }
    
    // Recording not in S3, try to fetch from Telnyx and store it
    if (fallbackUrl) {
      console.log(`[RecordingStorage] Recording not in S3 for lead ${leadId}, attempting to download from Telnyx...`);
      const s3Key = await downloadAndStoreRecording(fallbackUrl, leadId);
      
      if (s3Key) {
        const url = await getPresignedDownloadUrl(s3Key, 7 * 24 * 60 * 60);
        
        // Update lead with S3 key for future reference
        await db.update(leads)
          .set({ recordingS3Key: s3Key })
          .where(eq(leads.id, leadId));
        
        return { url, source: 'local' };
      }
    }
    
    // Fallback to original URL
    return { url: fallbackUrl || '', source: fallbackUrl ? 'telnyx' : null };
  } catch (error) {
    console.error(`[RecordingStorage] Error getting recording URL for lead ${leadId}:`, error);
    return { url: fallbackUrl || '', source: fallbackUrl ? 'telnyx' : null };
  }
}

/**
 * Store a recording immediately when webhook arrives
 * Called from the Telnyx webhook handler
 */
export async function storeRecordingFromWebhook(
  leadId: string,
  recordingUrl: string
): Promise<string | null> {
  if (!isS3Configured()) {
    console.log('[RecordingStorage] S3 not configured, using Telnyx URL directly');
    return null;
  }

  const s3Key = await downloadAndStoreRecording(recordingUrl, leadId);
  
  if (s3Key) {
    // Update lead with S3 key
    await db.update(leads)
      .set({ recordingS3Key: s3Key })
      .where(eq(leads.id, leadId));
  }
  
  return s3Key;
}

/**
 * Check if S3 storage is available for recordings
 */
export function isRecordingStorageEnabled(): boolean {
  return isS3Configured();
}
