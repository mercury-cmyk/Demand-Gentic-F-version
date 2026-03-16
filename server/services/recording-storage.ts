/**
 * Recording Storage Service
 * Downloads call recordings from Telnyx and stores them permanently in S3
 * Provides long-lived URLs for customer sharing
 * 
 * Supports both leads and call_sessions tables
 */

import { uploadToS3, getPresignedDownloadUrl, s3ObjectExists, isS3Configured } from '../lib/storage';
import { db } from '../db';
import { leads, callSessions } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

const RECORDING_PREFIX = 'recordings';
const CALL_SESSION_RECORDING_PREFIX = 'call-recordings'; // Separate prefix for call sessions

function isPresignedGcsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('storage.googleapis.com')) return false;
    return (
      parsed.searchParams.has('X-Goog-Signature') ||
      parsed.searchParams.has('GoogleAccessId') ||
      parsed.searchParams.has('X-Goog-Credential')
    );
  } catch {
    return false;
  }
}

function requirePresignedGcsUrl(url: string, context: string): string | null {
  if (!isPresignedGcsUrl(url)) {
    console.warn(`[RecordingStorage] ${context}: rejecting non-presigned/non-GCS URL`);
    return null;
  }
  return url;
}

/**
 * Generate S3 key for a lead recording (legacy)
 */
export function getRecordingS3Key(leadId: string, extension: string = 'mp3'): string {
  return `${RECORDING_PREFIX}/${leadId}.${extension}`;
}

/**
 * Generate S3 key for a call session recording
 * Pattern: call-recordings/{campaignId}/{callSessionId}.{extension}
 * This enables filtering/listing by campaign in S3
 */
export function getCallSessionRecordingS3Key(
  callSessionId: string, 
  campaignId: string | null, 
  extension: string = 'mp3'
): string {
  const campaignFolder = campaignId || 'no-campaign';
  return `${CALL_SESSION_RECORDING_PREFIX}/${campaignFolder}/${callSessionId}.${extension}`;
}

/**
 * Download a recording from a URL and upload to S3
 * Returns the S3 key for the stored recording
 * FIXED: Handles expired Telnyx URLs (403 Forbidden)
 */
export async function downloadAndStoreRecording(
  sourceUrl: string,
  leadId: string,
  telnyxCallId: string | null = null
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
    
    // Download from Telnyx with retries for temporary failures
    let response = await fetch(sourceUrl, {
      timeout: 30000, // 30s timeout
    });
    
    // CRITICAL FIX: Handle 403 (presigned URL expired)
    if (response.status === 403) {
      console.warn(`[RecordingStorage] ⚠️ URL expired (403).`);
      
      if (telnyxCallId) {
         console.log(`[RecordingStorage] Attempting to refresh URL via Telnyx API for call ${telnyxCallId}...`);
         try {
           // We dynamically import to avoid circular dependency if possible, or just use the import if it's safe.
           // Since this service is "recording-storage", depending on "telnyx-recordings" is fine (one way).
           // But let's check imports. "telnyx-recordings" likely depends on "db", etc.
           // Let's use dynamic import just like google-transcription does.
           const { fetchTelnyxRecording } = await import('./telnyx-recordings');
           const refreshedUrl = await fetchTelnyxRecording(telnyxCallId);
           
           if (refreshedUrl) {
             console.log(`[RecordingStorage] ✅ Refreshed URL obtained. Retrying download.`);
             response = await fetch(refreshedUrl, { timeout: 30000 });
           } else {
             console.warn(`[RecordingStorage] ❌ Failed to refresh URL via Telnyx API (not found).`);
           }
         } catch (refreshErr) {
            console.warn(`[RecordingStorage] ❌ Error refreshing URL:`, refreshErr);
         }
      }
      
      // Re-check status after potential refresh
      if (response.status === 403) {
          console.warn(`[RecordingStorage] Lead ${leadId}: Recording storage skipped (Still 403). Will rely on call_sessions.aiTranscript`);
          return null; 
      }
    }
    
    if (!response.ok) {
      // Log detailed error info
      const errorText = await response.text().catch(() => '(no error body)');
      throw new Error(`Failed to download recording: ${response.status} - ${errorText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Validate we got actual audio data (at least 1KB)
    if (buffer.length < 1000) {
      throw new Error(`Downloaded recording too small (${buffer.length} bytes), possibly incomplete`);
    }
    
    console.log(`[RecordingStorage] Downloaded ${buffer.length} bytes, uploading to S3...`);
    
    // Upload to S3
    await uploadToS3(s3Key, buffer, contentType);
    
    console.log(`[RecordingStorage] ✅ Stored recording at ${s3Key}`);
    return s3Key;
  } catch (error) {
    console.error(`[RecordingStorage] Failed to store recording for lead ${leadId}:`, error);
    return null; // Non-blocking - don't crash if recording storage fails
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
    console.warn('[RecordingStorage] getRecordingUrl: S3/GCS not configured - refusing non-presigned fallback URL');
    return { url: '', source: null };
  }

  try {
    // Check for mp3 first, then wav
    const mp3Key = getRecordingS3Key(leadId, 'mp3');
    const wavKey = getRecordingS3Key(leadId, 'wav');
    
    if (await s3ObjectExists(mp3Key)) {
      // Generate 7-day presigned URL
      const url = requirePresignedGcsUrl(
        await getPresignedDownloadUrl(mp3Key, 7 * 24 * 60 * 60),
        `getRecordingUrl(mp3:${leadId})`
      );
      if (url) return { url, source: 'local' };
    }
    
    if (await s3ObjectExists(wavKey)) {
      const url = requirePresignedGcsUrl(
        await getPresignedDownloadUrl(wavKey, 7 * 24 * 60 * 60),
        `getRecordingUrl(wav:${leadId})`
      );
      if (url) return { url, source: 'local' };
    }
    
    // Recording not in S3, try to fetch from Telnyx and store it
    if (fallbackUrl) {
      console.log(`[RecordingStorage] Recording not in S3 for lead ${leadId}, attempting to download from Telnyx...`);
      const s3Key = await downloadAndStoreRecording(fallbackUrl, leadId);
      
      if (s3Key) {
        const url = requirePresignedGcsUrl(
          await getPresignedDownloadUrl(s3Key, 7 * 24 * 60 * 60),
          `getRecordingUrl(stored:${leadId})`
        );
        if (!url) return { url: '', source: null };
        
        // Update lead with S3 key for future reference
        await db.update(leads)
          .set({ recordingS3Key: s3Key })
          .where(eq(leads.id, leadId));
        
        return { url, source: 'local' };
      }
    }
    
    // Strict policy: never return non-GCS/non-presigned recording URLs.
    return { url: '', source: null };
  } catch (error) {
    console.error(`[RecordingStorage] Error getting recording URL for lead ${leadId}:`, error);
    return { url: '', source: null };
  }
}

/**
 * Store a recording immediately when webhook arrives
 * Called from the Telnyx webhook handler
 * Updates recordingStatus to 'stored' on success or 'failed' on failure
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
    // Update lead with S3 key and mark as stored
    await db.update(leads)
      .set({
        recordingS3Key: s3Key,
        recordingStatus: 'stored',
      })
      .where(eq(leads.id, leadId));
    console.log(`[RecordingStorage] ✅ Lead ${leadId} recording stored at ${s3Key}`);
  } else {
    // Mark as failed if S3 upload didn't work
    await db.update(leads)
      .set({ recordingStatus: 'failed' })
      .where(eq(leads.id, leadId));
    console.log(`[RecordingStorage] ❌ Lead ${leadId} recording storage failed`);
  }

  return s3Key;
}

/**
 * Check if S3 storage is available for recordings
 */
export function isRecordingStorageEnabled(): boolean {
  return isS3Configured();
}

// ============================================================================
// CALL SESSION RECORDING FUNCTIONS
// ============================================================================

/**
 * Download and store recording for a call session
 * Returns the S3 key for the stored recording
 */
export async function downloadAndStoreCallSessionRecording(
  sourceUrl: string,
  callSessionId: string,
  campaignId: string | null
): Promise<{ s3Key: string | null; fileSizeBytes: number | null }> {
  if (!isS3Configured()) {
    console.log('[RecordingStorage] S3 not configured, skipping storage');
    return { s3Key: null, fileSizeBytes: null };
  }

  try {
    console.log(`[RecordingStorage] Downloading recording for call session ${callSessionId}...`);
    
    // Determine file extension from URL
    const extension = sourceUrl.includes('.wav') ? 'wav' : 'mp3';
    const contentType = extension === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const s3Key = getCallSessionRecordingS3Key(callSessionId, campaignId, extension);
    
    // Download from Telnyx with retries for temporary failures
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(30000), // 30s timeout
    });
    
    // Handle 403 (presigned URL expired)
    if (response.status === 403) {
      console.warn(`[RecordingStorage] ⚠️ URL expired (403) for call session ${callSessionId}`);
      return { s3Key: null, fileSizeBytes: null };
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '(no error body)');
      throw new Error(`Failed to download recording: ${response.status} - ${errorText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Validate we got actual audio data (at least 1KB)
    if (buffer.length < 1000) {
      throw new Error(`Downloaded recording too small (${buffer.length} bytes), possibly incomplete`);
    }
    
    console.log(`[RecordingStorage] Downloaded ${buffer.length} bytes for call session ${callSessionId}, uploading to S3...`);
    
    // Upload to S3
    await uploadToS3(s3Key, buffer, contentType);
    
    console.log(`[RecordingStorage] ✅ Stored call session recording at ${s3Key}`);
    return { s3Key, fileSizeBytes: buffer.length };
  } catch (error) {
    console.error(`[RecordingStorage] Failed to store recording for call session ${callSessionId}:`, error);
    return { s3Key: null, fileSizeBytes: null };
  }
}

/**
 * Store recording for a call session and update the database
 * Called from Telnyx webhook or after call completion
 */
export async function storeCallSessionRecording(
  callSessionId: string,
  recordingUrl: string,
  durationSec?: number
): Promise<string | null> {
  if (!isS3Configured()) {
    console.log('[RecordingStorage] S3 not configured, updating URL only');
    
    // Still update the recording URL even without S3
    await db.update(callSessions)
      .set({ 
        recordingUrl,
        recordingStatus: 'pending',
        recordingDurationSec: durationSec || null,
      })
      .where(eq(callSessions.id, callSessionId));
    
    return null;
  }

  // Get campaign ID for folder structure
  const [session] = await db.select({ campaignId: callSessions.campaignId })
    .from(callSessions)
    .where(eq(callSessions.id, callSessionId));
  
  if (!session) {
    console.error(`[RecordingStorage] Call session ${callSessionId} not found`);
    return null;
  }

  // Mark as uploading
  await db.update(callSessions)
    .set({ 
      recordingUrl,
      recordingStatus: 'uploading',
    })
    .where(eq(callSessions.id, callSessionId));

  const { s3Key, fileSizeBytes } = await downloadAndStoreCallSessionRecording(
    recordingUrl, 
    callSessionId, 
    session.campaignId
  );
  
  if (s3Key) {
    // Update with S3 storage info
    await db.update(callSessions)
      .set({ 
        recordingS3Key: s3Key,
        recordingStatus: 'stored',
        recordingFileSizeBytes: fileSizeBytes,
        recordingDurationSec: durationSec || null,
        recordingFormat: s3Key.endsWith('.wav') ? 'wav' : 'mp3',
      })
      .where(eq(callSessions.id, callSessionId));
    
    console.log(`[RecordingStorage] ✅ Call session ${callSessionId} recording stored at ${s3Key}`);
    return s3Key;
  } else {
    // Mark as failed
    await db.update(callSessions)
      .set({ 
        recordingStatus: 'failed',
      })
      .where(eq(callSessions.id, callSessionId));
    
    return null;
  }
}

/**
 * Get a presigned URL for a call session recording
 * If recording is stored in S3, returns a fresh presigned URL
 * Falls back to the original Telnyx URL if not stored
 */
export async function getCallSessionRecordingUrl(
  callSessionId: string,
  fallbackUrl?: string | null
): Promise<{ url: string; source: 'local' | 'telnyx' | null }> {
  if (!isS3Configured()) {
    console.warn('[RecordingStorage] getCallSessionRecordingUrl: S3/GCS not configured - refusing non-presigned fallback URL');
    return { url: '', source: null };
  }

  try {
    // Get the stored S3 key from database
    const [session] = await db.select({ 
      recordingS3Key: callSessions.recordingS3Key,
      recordingUrl: callSessions.recordingUrl,
      campaignId: callSessions.campaignId,
    })
      .from(callSessions)
      .where(eq(callSessions.id, callSessionId));
    
    if (!session) {
      return { url: '', source: null };
    }

    // If we have an S3 key, generate presigned URL
    if (session.recordingS3Key) {
      if (await s3ObjectExists(session.recordingS3Key)) {
        const url = requirePresignedGcsUrl(
          await getPresignedDownloadUrl(session.recordingS3Key, 7 * 24 * 60 * 60),
          `getCallSessionRecordingUrl(existing:${callSessionId})`
        );
        if (url) return { url, source: 'local' };
      }
    }
    
    // Check both extensions if S3 key not in DB
    const mp3Key = getCallSessionRecordingS3Key(callSessionId, session.campaignId, 'mp3');
    const wavKey = getCallSessionRecordingS3Key(callSessionId, session.campaignId, 'wav');
    
    if (await s3ObjectExists(mp3Key)) {
      const url = requirePresignedGcsUrl(
        await getPresignedDownloadUrl(mp3Key, 7 * 24 * 60 * 60),
        `getCallSessionRecordingUrl(mp3:${callSessionId})`
      );
      if (!url) return { url: '', source: null };
      
      // Update DB with the key we found
      await db.update(callSessions)
        .set({ recordingS3Key: mp3Key, recordingStatus: 'stored', recordingFormat: 'mp3' })
        .where(eq(callSessions.id, callSessionId));
        
      return { url, source: 'local' };
    }
    
    if (await s3ObjectExists(wavKey)) {
      const url = requirePresignedGcsUrl(
        await getPresignedDownloadUrl(wavKey, 7 * 24 * 60 * 60),
        `getCallSessionRecordingUrl(wav:${callSessionId})`
      );
      if (!url) return { url: '', source: null };
      
      await db.update(callSessions)
        .set({ recordingS3Key: wavKey, recordingStatus: 'stored', recordingFormat: 'wav' })
        .where(eq(callSessions.id, callSessionId));
        
      return { url, source: 'local' };
    }

    // Try hard to find it in GCS using standard naming patterns if key is missing
    const standardKey = `call-recordings/${session.campaignId || 'unknown'}/${callSessionId}.mp3`;
    if (await s3ObjectExists(standardKey)) {
       const url = requirePresignedGcsUrl(
         await getPresignedDownloadUrl(standardKey, 7 * 24 * 60 * 60),
         `getCallSessionRecordingUrl(standard:${callSessionId})`
       );
       if (!url) return { url: '', source: null };
       await db.update(callSessions)
        .set({ recordingS3Key: standardKey, recordingStatus: 'stored', recordingFormat: 'mp3' })
        .where(eq(callSessions.id, callSessionId));
       return { url, source: 'local' };
    }
    
    // Recording not in S3 - try to download from Telnyx URL
    const sourceUrl = fallbackUrl || session.recordingUrl;
    if (sourceUrl) {
      console.log(`[RecordingStorage] Recording not in S3 for call session ${callSessionId}, attempting download...`);
      const s3Key = await storeCallSessionRecording(callSessionId, sourceUrl);
      
      if (s3Key) {
        const url = requirePresignedGcsUrl(
          await getPresignedDownloadUrl(s3Key, 7 * 24 * 60 * 60),
          `getCallSessionRecordingUrl(stored:${callSessionId})`
        );
        if (!url) return { url: '', source: null };
        return { url, source: 'local' };
      }
    }
    
    // Strict policy: never return non-GCS/non-presigned recording URLs.
    return { url: '', source: null };
  } catch (error) {
    console.error(`[RecordingStorage] Error getting recording URL for call session ${callSessionId}:`, error);
    return { url: '', source: null };
  }
}

/**
 * Upload raw audio buffer directly to S3 (for real-time recording)
 * Used by call-recording-manager for capturing live call audio
 */
export async function uploadCallSessionRecordingBuffer(
  callSessionId: string,
  campaignId: string | null,
  audioBuffer: Buffer,
  format: 'mp3' | 'wav' = 'mp3'
): Promise<string | null> {
  if (!isS3Configured()) {
    console.log('[RecordingStorage] S3 not configured, cannot store recording buffer');
    return null;
  }

  try {
    const contentType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const s3Key = getCallSessionRecordingS3Key(callSessionId, campaignId, format);
    
    console.log(`[RecordingStorage] Uploading ${audioBuffer.length} bytes for call session ${callSessionId}...`);
    
    await uploadToS3(s3Key, audioBuffer, contentType);
    
    // Update database
    await db.update(callSessions)
      .set({ 
        recordingS3Key: s3Key,
        recordingStatus: 'stored',
        recordingFileSizeBytes: audioBuffer.length,
        recordingFormat: format,
      })
      .where(eq(callSessions.id, callSessionId));
    
    console.log(`[RecordingStorage] ✅ Uploaded call session recording buffer to ${s3Key}`);
    return s3Key;
  } catch (error) {
    console.error(`[RecordingStorage] Failed to upload recording buffer for call session ${callSessionId}:`, error);
    
    await db.update(callSessions)
      .set({ recordingStatus: 'failed' })
      .where(eq(callSessions.id, callSessionId));

    return null;
  }
}

// ============================================================================
// BATCH GCS SYNC — Retry pending recordings
// ============================================================================

/**
 * Sync pending recordings to GCS.
 * Finds call sessions with recording URLs but no GCS key (pending/failed status)
 * and attempts to download + upload to GCS.
 * Called from background jobs on a regular interval.
 */
export async function syncPendingRecordingsToGCS(
  limit: number = 20
): Promise<{ processed: number; stored: number; failed: number; skipped: number }> {
  if (!isS3Configured()) {
    return { processed: 0, stored: 0, failed: 0, skipped: 0 };
  }

  // Find sessions with recording URLs but not yet stored in GCS
  const pending = await db.select({
    id: callSessions.id,
    recordingUrl: callSessions.recordingUrl,
    campaignId: callSessions.campaignId,
    recordingStatus: callSessions.recordingStatus,
  })
    .from(callSessions)
    .where(
      and(
        sql`${callSessions.recordingUrl} IS NOT NULL`,
        sql`${callSessions.recordingUrl} != ''`,
        sql`(${callSessions.recordingS3Key} IS NULL OR ${callSessions.recordingS3Key} = '')`,
        sql`${callSessions.recordingStatus} IN ('pending', 'failed')`,
        // Only try recordings from the last 3 days (URLs expire)
        sql`${callSessions.createdAt} > NOW() - INTERVAL '3 days'`
      )
    )
    .orderBy(sql`${callSessions.createdAt} DESC`)
    .limit(limit);

  let stored = 0;
  let failed = 0;
  let skipped = 0;

  for (const session of pending) {
    if (!session.recordingUrl) {
      skipped++;
      continue;
    }

    try {
      const { s3Key, fileSizeBytes } = await downloadAndStoreCallSessionRecording(
        session.recordingUrl,
        session.id,
        session.campaignId
      );

      if (s3Key) {
        await db.update(callSessions)
          .set({
            recordingS3Key: s3Key,
            recordingStatus: 'stored',
            recordingFileSizeBytes: fileSizeBytes,
            recordingFormat: s3Key.endsWith('.wav') ? 'wav' : 'mp3',
          })
          .where(eq(callSessions.id, session.id));
        stored++;
      } else {
        await db.update(callSessions)
          .set({ recordingStatus: 'failed' })
          .where(eq(callSessions.id, session.id));
        failed++;
      }
    } catch (error: any) {
      console.error(`[RecordingSync] Failed for session ${session.id}:`, error.message);
      await db.update(callSessions)
        .set({ recordingStatus: 'failed' })
        .where(eq(callSessions.id, session.id));
      failed++;
    }
  }

  if (stored > 0 || failed > 0) {
    console.log(`[RecordingSync] Batch: ${pending.length} checked, ${stored} stored, ${failed} failed, ${skipped} skipped`);
  }

  return { processed: pending.length, stored, failed, skipped };
}
