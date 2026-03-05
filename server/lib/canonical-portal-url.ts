const CANONICAL_PORTAL_BASE_URL = 'https://demandgentic.ai';

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Always returns the production canonical domain for client portal/login URLs.
 * Any non-canonical caller-provided URL is ignored intentionally.
 */
export function getCanonicalPortalBaseUrl(requestedBaseUrl?: string | null): string {
  const requestedOrigin = normalizeOrigin(requestedBaseUrl);
  const canonicalOrigin = normalizeOrigin(CANONICAL_PORTAL_BASE_URL);

  if (requestedOrigin && canonicalOrigin && requestedOrigin !== canonicalOrigin) {
    console.warn(
      `[PortalDomain] Ignoring non-canonical portal base URL "${requestedBaseUrl}". Using ${CANONICAL_PORTAL_BASE_URL}.`,
    );
  }

  return CANONICAL_PORTAL_BASE_URL;
}

export function buildCanonicalPortalUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${CANONICAL_PORTAL_BASE_URL}${normalizedPath}`;
}
