/**
 * Client Portal Session Utilities
 *
 * Centralized session management for client portal auth.
 * Ensures tenant isolation by clearing ALL cached state on logout/login transitions.
 */

import { queryClient } from './queryClient';

// ─── Constants ───────────────────────────────────────────────────────────────

const CLIENT_PORTAL_TOKEN_KEY = 'clientPortalToken';
const CLIENT_PORTAL_USER_KEY = 'clientPortalUser';
const DEMAND_ASSISTANT_KEY = 'demandAssistantInteracted';

// Known UKEF client account ID — used by frontend to skip UKEF-only probes
export const UKEF_CLIENT_ACCOUNT_ID = '67b6f74d-0894-46c4-bf86-1dd047b57dd8';

// ─── Getters ─────────────────────────────────────────────────────────────────

export function getClientPortalToken(): string | null {
  return localStorage.getItem(CLIENT_PORTAL_TOKEN_KEY);
}

export interface ClientPortalUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  clientAccountId: string;
  clientAccountName?: string;
  isOwner?: boolean;
}

export function getClientPortalUser(): ClientPortalUser | null {
  const stored = localStorage.getItem(CLIENT_PORTAL_USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// ─── Session Lifecycle ───────────────────────────────────────────────────────

/**
 * Clear client portal session state.
 * Call on:
 *   - explicit logout
 *   - BEFORE setting new user on login (to flush previous tenant's cache)
 *   - 401 auto-logout
 *
 * This ensures no stale tenant data bleeds across sessions.
 */
export function clearClientPortalSession(): void {
  // 1. Remove auth keys
  localStorage.removeItem(CLIENT_PORTAL_TOKEN_KEY);
  localStorage.removeItem(CLIENT_PORTAL_USER_KEY);

  // 2. Remove feature / interaction keys
  localStorage.removeItem(DEMAND_ASSISTANT_KEY);

  // 3. Clear only client-portal-related React Query cache.
  //    Previously this called queryClient.clear() which wiped ALL cache,
  //    including admin auth state — causing admin users to be logged out
  //    when using "Login as Client" from the client management page.
  //    Now we selectively remove only client-portal and tenant-specific query keys.
  queryClient.removeQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!key || key.length === 0) return false;
      const firstKey = String(key[0]);
      return firstKey.includes('client-portal') ||
             firstKey.includes('/api/client-portal') ||
             firstKey.startsWith('argyle-') ||
             firstKey.startsWith('ukef-');
    },
  });
}

/**
 * Set session after successful login/join.
 * Clears previous session first to prevent tenant bleed.
 */
export function setClientPortalSession(token: string, user: object): void {
  // Always clear first — even if same user re-logs, cache should be fresh
  clearClientPortalSession();

  localStorage.setItem(CLIENT_PORTAL_TOKEN_KEY, token);
  localStorage.setItem(CLIENT_PORTAL_USER_KEY, JSON.stringify(user));
}

/**
 * Check if the current user belongs to the UKEF/Lightcast tenant.
 * Used to gate UKEF-only API calls on the frontend.
 */
export function isUkefTenant(): boolean {
  const user = getClientPortalUser();
  return user?.clientAccountId === UKEF_CLIENT_ACCOUNT_ID;
}
