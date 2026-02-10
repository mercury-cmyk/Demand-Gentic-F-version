/**
 * Production Environment Guard
 *
 * Detects and neutralizes dev-only artifacts that should never run in production:
 * - Vite HMR client (localhost:24678 / @vite/client)
 * - Accidental localhost API calls from a non-localhost origin
 *
 * This module is designed to be imported once at app startup (main.tsx).
 * It is tree-shaken in development builds.
 */

const isProduction = !window.location.hostname.match(
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|.*\.local)$/,
);

/**
 * Patch the native `fetch` and `XMLHttpRequest` to warn and block requests
 * to localhost when the app is running on a public domain.
 * (Only active when the page's origin is NOT localhost.)
 */
function interceptLocalhostRequests() {
  if (!isProduction) return;

  // --- fetch() ---
  const originalFetch = window.fetch;
  window.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : '';

    if (isLocalhostUrl(url)) {
      console.warn(
        `[ProdGuard] Blocked fetch to localhost in production: ${url}`,
      );
      return Promise.reject(
        new Error(`[ProdGuard] localhost request blocked in production: ${url}`),
      );
    }
    return originalFetch.call(window, input, init);
  };

  // --- XMLHttpRequest ---
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function patchedOpen(
    method: string,
    url: string | URL,
    ...args: any[]
  ) {
    const urlStr = typeof url === 'string' ? url : url.href;
    if (isLocalhostUrl(urlStr)) {
      console.warn(
        `[ProdGuard] Blocked XHR to localhost in production: ${urlStr}`,
      );
      // Don't actually open the connection — just let it fail silently later
      return;
    }
    return originalOpen.call(this, method, url, ...args);
  };

  // --- WebSocket ---
  const OriginalWebSocket = window.WebSocket;
  (window as any).WebSocket = function PatchedWebSocket(
    url: string | URL,
    protocols?: string | string[],
  ) {
    const urlStr = typeof url === 'string' ? url : url.href;
    if (isLocalhostUrl(urlStr)) {
      console.warn(
        `[ProdGuard] Blocked WebSocket to localhost in production: ${urlStr}`,
      );
      // Return a dummy that fires close immediately
      const ws = new EventTarget() as any;
      ws.readyState = 3; // CLOSED
      ws.send = () => {};
      ws.close = () => {};
      ws.CONNECTING = 0;
      ws.OPEN = 1;
      ws.CLOSING = 2;
      ws.CLOSED = 3;
      setTimeout(() => {
        ws.dispatchEvent?.(
          new CloseEvent('close', { code: 1006, reason: 'blocked-by-prod-guard' }),
        );
      }, 0);
      return ws;
    }
    return new OriginalWebSocket(url, protocols);
  } as any;
  // Preserve static properties
  Object.assign((window as any).WebSocket, {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    prototype: OriginalWebSocket.prototype,
  });
}

/**
 * Detect and remove any injected Vite HMR client scripts.
 * In a correct production build these should never be present,
 * but a stale cached HTML page might still contain them.
 */
function neutralizeViteHMR() {
  if (!isProduction) return;

  // Remove any <script> tags that reference @vite/client
  document.querySelectorAll('script[src*="@vite/client"]').forEach((el) => {
    console.warn('[ProdGuard] Removed stale @vite/client script tag');
    el.remove();
  });

  // Remove any inline scripts that import @vite/client
  document.querySelectorAll('script[type="module"]').forEach((el) => {
    if (el.textContent?.includes('@vite/client')) {
      console.warn(
        '[ProdGuard] Removed inline script containing @vite/client import',
      );
      el.remove();
    }
  });

  // Kill import.meta.hot if it leaked (shouldn't be possible in prod build,
  // but guard anyway)
  if (typeof import.meta !== 'undefined' && (import.meta as any).hot) {
    console.warn('[ProdGuard] Neutralized import.meta.hot');
    (import.meta as any).hot = undefined;
  }
}

/**
 * Check if a URL string points to a localhost address.
 */
function isLocalhostUrl(url: string): boolean {
  if (!url) return false;
  try {
    // Absolute URL check
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)) {
      return true;
    }
    if (/^wss?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Initialize all production guards.
 * Should be called once at app startup.
 */
export function initProductionGuard(): void {
  if (!isProduction) {
    return; // No-op on localhost — don't interfere with dev
  }

  console.log('[ProdGuard] Production environment detected, activating guards');
  neutralizeViteHMR();
  interceptLocalhostRequests();

  // Log diagnostic info once
  console.log('[ProdGuard] Config:', {
    origin: window.location.origin,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
  });
}
