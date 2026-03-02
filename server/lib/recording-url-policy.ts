const DEFAULT_RECORDINGS_BUCKET = 'demandgentic-ai-storage';

function encodeObjectPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function isGcsPublicUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.startsWith('gs://') || trimmed.includes('storage.googleapis.com');
}

export function buildCanonicalGcsUrlFromKey(recordingKey: string | null | undefined): string | null {
  if (!recordingKey) return null;

  const trimmedKey = recordingKey.trim();
  if (!trimmedKey) return null;

  if (/^https?:\/\//i.test(trimmedKey)) {
    return isGcsPublicUrl(trimmedKey) ? trimmedKey : null;
  }

  if (trimmedKey.startsWith('gs://')) {
    const withoutScheme = trimmedKey.slice('gs://'.length);
    const firstSlash = withoutScheme.indexOf('/');
    if (firstSlash <= 0) return null;
    const bucket = withoutScheme.slice(0, firstSlash);
    const objectPath = withoutScheme.slice(firstSlash + 1);
    if (!objectPath) return null;
    return `https://storage.googleapis.com/${bucket}/${encodeObjectPath(objectPath)}`;
  }

  const bucket = (process.env.GCS_BUCKET || process.env.S3_BUCKET || DEFAULT_RECORDINGS_BUCKET).trim();
  const normalizedPath = trimmedKey.replace(/^\/+/, '');
  if (!normalizedPath) return null;
  return `https://storage.googleapis.com/${bucket}/${encodeObjectPath(normalizedPath)}`;
}

export function canonicalizeGcsRecordingUrl(params: {
  recordingS3Key?: string | null;
  recordingUrl?: string | null;
}): string | null {
  const fromKey = buildCanonicalGcsUrlFromKey(params.recordingS3Key);
  if (fromKey) return fromKey;

  const fallback = params.recordingUrl?.trim();
  if (!fallback) return null;

  if (fallback.startsWith('gs://')) {
    return buildCanonicalGcsUrlFromKey(fallback);
  }

  return isGcsPublicUrl(fallback) ? fallback : null;
}

/**
 * Resolve the best playable recording URL for client-facing pages.
 *
 * Strict policy: only Google Cloud Storage presigned URLs are accepted.
 * Any non-GCS URL or unsigned GCS URL is rejected (returns null).
 *
 * For recordings keyed by `recordingS3Key`, callers must resolve asynchronously
 * through services that generate a fresh presigned URL.
 */
export function resolvePlayableRecordingUrl(params: {
  recordingS3Key?: string | null;
  recordingUrl?: string | null;
}): string | null {
  const fallback = params.recordingUrl?.trim();
  if (!fallback || !/^https?:\/\//i.test(fallback)) return null;
  if (!isGcsPublicUrl(fallback)) return null;
  if (
    fallback.includes('X-Goog-Signature') ||
    fallback.includes('GoogleAccessId') ||
    fallback.includes('X-Goog-Credential')
  ) {
    return fallback;
  }
  return null;
}
