/**
 * GCS Audio Utilities
 *
 * Shared helper for downloading audio directly from GCS using service account 
 * read access. Extracted from call-intelligence-routes.ts so scripts and services 
 * can reuse it without duplicating Storage init logic.
 */

import { Storage } from '@google-cloud/storage';
import { BUCKET } from './storage';

// Singleton GCS client — lazy-init on first call
let _storage: InstanceType<typeof Storage> | null = null;
let _initAttempted = false;

function getGcsStorage(): InstanceType<typeof Storage> | null {
  if (_initAttempted) return _storage;
  _initAttempted = true;
  try {
    const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const GCS_KEY_FILE = process.env.GCS_KEY_FILE;
    _storage = new Storage({
      projectId: GCS_PROJECT_ID,
      ...(GCS_KEY_FILE ? { keyFilename: GCS_KEY_FILE } : {}),
    });
    console.log('[GCS] Storage client initialized');
  } catch (e) {
    console.warn('[GCS] Storage init failed:', (e as Error).message);
    _storage = null;
  }
  return _storage;
}

/**
 * Download audio directly from GCS using service account read access.
 * Bypasses presigned URL generation entirely — works even without signBlob permission.
 *
 * @param gcsKey  The object key within BUCKET (e.g. "recordings/abc123.wav")
 * @returns       Raw audio Buffer, or null on failure
 */
export async function downloadGcsAudioAsBuffer(gcsKey: string): Promise<Buffer | null> {
  const storage = getGcsStorage();
  if (!storage || !gcsKey || !BUCKET) return null;
  try {
    const [buffer] = await storage.bucket(BUCKET).file(gcsKey).download();
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
    if (bucket && bucket !== BUCKET) return null;
    return objectPath;
  }

  const m = trimmed.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
  if (m) {
    const bucket = m[1];
    const objectPath = m[2];
    if (!objectPath) return null;
    if (bucket && bucket !== BUCKET) return null;
    return objectPath;
  }

  return null;
}
