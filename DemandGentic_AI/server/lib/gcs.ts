/**
 * GCS Audio Utilities
 *
 * Shared helper for downloading audio directly from GCS using service account 
 * read access. Extracted from call-intelligence-routes.ts so scripts and services 
 * can reuse it without duplicating Storage init logic.
 */

import { getStorageClient, getActiveBucket } from './storage';

function getGcsStorage() {
  return getStorageClient();
}

/**
 * Download audio directly from GCS using service account read access.
 * Bypasses presigned URL generation entirely — works even without signBlob permission.
 *
 * @param gcsKey  The object key within BUCKET (e.g. "recordings/abc123.wav")
 * @returns       Raw audio Buffer, or null on failure
 */
export async function downloadGcsAudioAsBuffer(gcsKey: string): Promise {
  const storage = getGcsStorage();
  const activeBucket = getActiveBucket();
  if (!storage || !gcsKey || !activeBucket) return null;
  try {
    const [buffer] = await storage.bucket(activeBucket).file(gcsKey).download();
    console.log(`[GCS] Downloaded ${gcsKey} (${buffer.length} bytes)`);
    return buffer;
  } catch (e: any) {
    console.warn(`[GCS] Failed to download ${gcsKey}:`, e.message);
    return null;
  }
}

/**
 * Extract a GCS object key from various recording URL formats:
 *   - gcs-internal://bucket/key
 *   - gs://bucket/key
 *   - https://storage.googleapis.com/bucket/key
 *
 * Returns null if the URL doesn't match any known pattern or the bucket doesn't match.
 */
export function extractGcsKeyFromUrl(recordingUrl: string | null | undefined): string | null {
  if (!recordingUrl) return null;
  const trimmed = recordingUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('gcs-internal://')) {
    return trimmed.replace(/^gcs-internal:\/\/[^/]+\//, '');
  }

  if (trimmed.startsWith('gs://')) {
    const withoutScheme = trimmed.slice('gs://'.length);
    const firstSlash = withoutScheme.indexOf('/');
    if (firstSlash <= 0) return null;
    const bucket = withoutScheme.slice(0, firstSlash);
    const objectPath = withoutScheme.slice(firstSlash + 1);
    if (!objectPath) return null;
    if (bucket && bucket !== getActiveBucket()) return null;
    return objectPath;
  }

  const m = trimmed.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
  if (m) {
    const bucket = m[1];
    const objectPath = m[2];
    if (!objectPath) return null;
    if (bucket && bucket !== getActiveBucket()) return null;
    return objectPath;
  }

  return null;
}