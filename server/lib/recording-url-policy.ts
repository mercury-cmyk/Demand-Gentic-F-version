const DEFAULT_RECORDINGS_BUCKET = 'demandgentic-storage';

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
 * The GCS bucket is **private** (no public object access), so raw
 * `https://storage.googleapis.com/…` URLs return AccessDenied for browsers.
 * We therefore prefer the original `recordingUrl` (typically an S3 Amazon or
 * Telnyx URL that is publicly accessible) over an unsigned GCS public URL.
 *
 * For recordings that ONLY exist in GCS (no external URL), callers must use
 * an async path (e.g. `getPresignedDownloadUrl` or a server-side stream
 * proxy) because we cannot generate signed URLs synchronously here.
 */
export function resolvePlayableRecordingUrl(params: {
  recordingS3Key?: string | null;
  recordingUrl?: string | null;
}): string | null {
  // 1. Prefer the original recording URL if it's a valid, directly-playable
  //    HTTP(S) URL (covers S3 Amazon, Telnyx, and any other external host).
  const fallback = params.recordingUrl?.trim();
  if (fallback && /^https?:\/\//i.test(fallback)) {
    // If it's already a GCS *signed* URL (contains X-Goog-Signature or
    // GoogleAccessId), keep it — it should still work.
    // If it's an unsigned GCS public URL, skip it (bucket is private).
    if (isGcsPublicUrl(fallback)) {
      // Signed GCS URLs have query parameters with auth info
      if (fallback.includes('X-Goog-Signature') || fallback.includes('GoogleAccessId')) {
        return fallback;
      }
      // Unsigned GCS URL — don't return it; fall through to other options
    } else {
      // Non-GCS URL (S3 Amazon, Telnyx, etc.) — use it directly
      return fallback;
    }
  }

  // 2. If we have a GCS key but no working external URL, we cannot produce a
  //    playable URL synchronously (bucket is private, needs signed URL or
  //    server proxy). Return null so the caller can fall back to a stream
  //    endpoint or async signed-URL resolver.
  return null;
}
