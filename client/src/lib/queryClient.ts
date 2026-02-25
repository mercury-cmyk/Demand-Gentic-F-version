import { QueryClient, QueryFunction } from "@tanstack/react-query";

const FRIENDLY_RATE_LIMIT_MESSAGE =
  "429: The AI service is temporarily rate-limited. Please wait a moment and try again.";
const DEFAULT_QUERY_TIMEOUT_MS = 12000;

function extractErrorMessage(rawText: string): string {
  const text = (rawText || "").trim();
  if (!text) return "";

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "string") {
        return parsed;
      }
      if (parsed && typeof parsed === "object") {
        const candidate =
          parsed.message ??
          parsed.error ??
          parsed.detail ??
          parsed.details ??
          parsed.reason;
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      }
    } catch {
      // fall through to raw text
    }
  }

  return text;
}

function isRateLimitError(status: number, message: string): boolean {
  const lower = (message || "").toLowerCase();
  return (
    status === 429 ||
    lower.includes("rate exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("too many requests")
  );
}

async function throwIfResNotOk(res: Response, url?: string) {
  if (!res.ok) {
    // Handle 401 Unauthorized - redirect to login
    if (res.status === 401) {
      // Check if it's a client portal route, BUT exclude admin routes starting with /api/client-portal/admin/
      const isAdminClientPortalRoute = !!url?.includes('/api/client-portal/admin/');
      const isClientPortalRoute = !!url?.includes('/api/client-portal/') && !isAdminClientPortalRoute;
      if (isClientPortalRoute || window.location.pathname.startsWith('/client-portal/')) {
        // Use centralized session cleanup to clear cache + localStorage
        const { clearClientPortalSession } = await import('./client-portal-session');
        clearClientPortalSession();
        window.location.href = '/client-portal/login';
      } else {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        window.location.href = '/login';
      }
      // Always throw for 401 so caller can handle local error
      throw new Error('Session expired. Please login again.');
    }
    const rawText = (await res.text()) || res.statusText;
    const message = extractErrorMessage(rawText) || res.statusText;

    if (isRateLimitError(res.status, message)) {
      throw new Error(FRIENDLY_RATE_LIMIT_MESSAGE);
    }

    throw new Error(`${res.status}: ${message}`);
  }
}

export function getAuthHeaders(url?: string): HeadersInit {
  const headers: HeadersInit = {};

  // Choose token based on current page context first, then URL
  // Admin pages calling /api/client-portal/admin/* should use admin token
  const isOnClientPortalPage = window.location.pathname.startsWith('/client-portal/');
  const isAdminClientPortalRoute = url?.includes('/api/client-portal/admin/');

  // When on client portal pages, use client token for ALL API calls
  // (including non-/api/client-portal/ routes like /api/campaigns/:id/test-calls)
  // Exception: admin-specific client portal routes should use admin token
  const isClientPortal = (isOnClientPortalPage && !isAdminClientPortalRoute) ||
                         (url?.includes('/api/client-portal/') && !isAdminClientPortalRoute);

  if (isClientPortal) {
    const token = localStorage.getItem('clientPortalToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } else {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { timeout?: number },
): Promise<Response> {
  const headers = {
    ...getAuthHeaders(url),
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  // Default 30s timeout, but allow 60s for AI endpoints
  const timeout = options?.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal: controller.signal,
    });

    await throwIfResNotOk(res, url);
    return res;
  } catch (error) {
    // Provide better error message for timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. The AI service may be slow or unavailable. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DEFAULT_QUERY_TIMEOUT_MS);
    let res: Response;

    try {
      res = await fetch(url, {
        headers: getAuthHeaders(url),
        credentials: "include",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out after ${DEFAULT_QUERY_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }

    // Handle 401 Unauthorized
    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") {
        return null; // Don't throw if returnNull is requested
      }
      await throwIfResNotOk(res, url); // This will throw and redirect
    }

    await throwIfResNotOk(res, url);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
