import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response, url?: string) {
  if (!res.ok) {
    // Handle 401 Unauthorized - automatically logout and redirect to login
    if (res.status === 401) {
      if (url?.includes('/api/client-portal/') || window.location.pathname.startsWith('/client-portal/')) {
        localStorage.removeItem('clientPortalToken');
        localStorage.removeItem('clientPortalUser');
        window.location.href = '/client-portal/login';
      } else {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please login again.');
    }
    
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export function getAuthHeaders(url?: string): HeadersInit {
  const headers: HeadersInit = {};
  
  // Choose token based on URL or current path context
  const isClientPortal = url?.includes('/api/client-portal/') || 
                         window.location.pathname.startsWith('/client-portal/');
  
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
    const res = await fetch(url, {
      headers: getAuthHeaders(url),
      credentials: "include",
    });

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
