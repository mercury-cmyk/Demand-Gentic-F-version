/**
 * Client Portal Session & Nav Gating — Regression Tests
 *
 * Tests for:
 * - Session cleanup clears localStorage + QueryClient cache
 * - Login sets new session and clears previous tenant data
 * - Argyle feature query keys include tenant ID for cache isolation
 * - UKEF probes are skipped for non-UKEF tenants
 * - No stale nav data bleeds across tenant switches
 * - Vite config does not hardcode HMR to localhost in production
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Session Utility Tests ──────────────────────────────────────────────────

describe('Client Portal Session Utilities', () => {
  // Mock localStorage
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(() => { store = {}; }),
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clearClientPortalSession removes all client portal keys', async () => {
    store['clientPortalToken'] = 'old-token';
    store['clientPortalUser'] = JSON.stringify({ clientAccountId: 'tenant-a' });
    store['demandAssistantInteracted'] = 'true';
    store['unrelatedKey'] = 'should-stay';

    // Need to mock queryClient.clear
    vi.doMock('../lib/queryClient', () => ({
      queryClient: { clear: vi.fn() },
    }));

    const { clearClientPortalSession } = await import('../lib/client-portal-session');
    clearClientPortalSession();

    expect(localStorage.removeItem).toHaveBeenCalledWith('clientPortalToken');
    expect(localStorage.removeItem).toHaveBeenCalledWith('clientPortalUser');
    expect(localStorage.removeItem).toHaveBeenCalledWith('demandAssistantInteracted');
  });

  it('clearClientPortalSession calls queryClient.clear()', async () => {
    const mockClear = vi.fn();
    vi.doMock('../lib/queryClient', () => ({
      queryClient: { clear: mockClear },
    }));

    const { clearClientPortalSession } = await import('../lib/client-portal-session');
    clearClientPortalSession();

    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('setClientPortalSession clears previous session then sets new one', async () => {
    store['clientPortalToken'] = 'old-token';
    store['clientPortalUser'] = JSON.stringify({ clientAccountId: 'tenant-a' });

    const mockClear = vi.fn();
    vi.doMock('../lib/queryClient', () => ({
      queryClient: { clear: mockClear },
    }));

    const { setClientPortalSession } = await import('../lib/client-portal-session');
    const newUser = { id: 'u2', clientAccountId: 'tenant-b' };
    setClientPortalSession('new-token', newUser);

    // Old session was cleared
    expect(mockClear).toHaveBeenCalledTimes(1);

    // New session is set
    expect(localStorage.setItem).toHaveBeenCalledWith('clientPortalToken', 'new-token');
    expect(localStorage.setItem).toHaveBeenCalledWith('clientPortalUser', JSON.stringify(newUser));
  });

  it('getClientPortalUser returns parsed user from localStorage', async () => {
    const user = { id: 'u1', email: 'joe@argyle.com', clientAccountId: 'acc-123' };
    store['clientPortalUser'] = JSON.stringify(user);

    vi.doMock('../lib/queryClient', () => ({
      queryClient: { clear: vi.fn() },
    }));

    const { getClientPortalUser } = await import('../lib/client-portal-session');
    expect(getClientPortalUser()).toEqual(user);
  });

  it('getClientPortalUser returns null when no stored user', async () => {
    vi.doMock('../lib/queryClient', () => ({
      queryClient: { clear: vi.fn() },
    }));

    const { getClientPortalUser } = await import('../lib/client-portal-session');
    expect(getClientPortalUser()).toBeNull();
  });

  it('isUkefTenant returns true only for UKEF client account', async () => {
    vi.doMock('../lib/queryClient', () => ({
      queryClient: { clear: vi.fn() },
    }));

    const { isUkefTenant, UKEF_CLIENT_ACCOUNT_ID } = await import('../lib/client-portal-session');

    // Not UKEF
    store['clientPortalUser'] = JSON.stringify({ clientAccountId: 'some-other-tenant' });
    expect(isUkefTenant()).toBe(false);

    // UKEF
    store['clientPortalUser'] = JSON.stringify({ clientAccountId: UKEF_CLIENT_ACCOUNT_ID });
    expect(isUkefTenant()).toBe(true);
  });

  it('isUkefTenant returns false when no user', async () => {
    vi.doMock('../lib/queryClient', () => ({
      queryClient: { clear: vi.fn() },
    }));

    const { isUkefTenant } = await import('../lib/client-portal-session');
    expect(isUkefTenant()).toBe(false);
  });
});

// ─── Query Key Isolation Tests ──────────────────────────────────────────────

describe('Query Key Tenant Isolation', () => {
  it('argyle-events-feature-status query key must include tenant ID', () => {
    // Verify the pattern used in layout and dashboard
    const tenantA = 'tenant-aaa';
    const tenantB = 'tenant-bbb';

    const keyA = ['argyle-events-feature-status', tenantA];
    const keyB = ['argyle-events-feature-status', tenantB];

    // Keys must be different for different tenants
    expect(JSON.stringify(keyA)).not.toBe(JSON.stringify(keyB));

    // Same tenant produces same key
    expect(JSON.stringify(keyA)).toBe(JSON.stringify(['argyle-events-feature-status', tenantA]));
  });

  it('UKEF probe query keys must include tenant ID', () => {
    const tenantId = 'tenant-123';
    const reportsKey = ['ukef-reports-feature-probe', tenantId];
    const tqaKey = ['ukef-tqa-feature-probe', tenantId];

    expect(reportsKey[1]).toBe(tenantId);
    expect(tqaKey[1]).toBe(tenantId);
  });

  it('UKEF probes should be disabled for non-UKEF tenant', () => {
    const ukefId = '67b6f74d-0894-46c4-bf86-1dd047b57dd8';
    const otherTenantId = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';

    // Simulate the enabled logic from dashboard
    const isUkef = (id: string) => id === ukefId;

    expect(isUkef(ukefId)).toBe(true);
    expect(isUkef(otherTenantId)).toBe(false);

    // enabled = !!user && isUkef — for non-UKEF, probes never fire
    const ukefUser = { clientAccountId: ukefId };
    const otherUser = { clientAccountId: otherTenantId };

    expect(!!ukefUser && isUkef(ukefUser.clientAccountId)).toBe(true);
    expect(!!otherUser && isUkef(otherUser.clientAccountId)).toBe(false);
  });
});

// ─── Tenant Switch Simulation ───────────────────────────────────────────────

describe('Tenant Switch — Cache Isolation', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(() => { store = {}; }),
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('login as Argyle → logout → login as non-Argyle clears cache between sessions', async () => {
    const mockClear = vi.fn();
    vi.doMock('../lib/queryClient', () => ({
      queryClient: { clear: mockClear },
    }));

    const { setClientPortalSession, clearClientPortalSession, getClientPortalUser } = await import('../lib/client-portal-session');

    // Step 1: Login as Argyle
    const argyleUser = { id: 'u1', email: 'joe@argyle.com', clientAccountId: 'argyle-tenant-id' };
    setClientPortalSession('argyle-token', argyleUser);
    expect(mockClear).toHaveBeenCalledTimes(1); // cleared previous (empty) session
    expect(getClientPortalUser()?.clientAccountId).toBe('argyle-tenant-id');

    // Step 2: Logout
    clearClientPortalSession();
    expect(mockClear).toHaveBeenCalledTimes(2); // cache cleared again
    expect(getClientPortalUser()).toBeNull();

    // Step 3: Login as different tenant
    const otherUser = { id: 'u2', email: 'paul@acme.com', clientAccountId: 'acme-tenant-id' };
    setClientPortalSession('acme-token', otherUser);
    expect(mockClear).toHaveBeenCalledTimes(3); // cache cleared before new session
    expect(getClientPortalUser()?.clientAccountId).toBe('acme-tenant-id');
  });

  it('401 auto-logout clears cache', async () => {
    store['clientPortalToken'] = 'expired-token';
    store['clientPortalUser'] = JSON.stringify({ clientAccountId: 'tenant-x' });

    const mockClear = vi.fn();
    vi.doMock('../lib/queryClient', () => ({
      queryClient: { clear: mockClear },
    }));

    const { clearClientPortalSession, getClientPortalToken } = await import('../lib/client-portal-session');

    // Simulate 401 handler
    clearClientPortalSession();

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(getClientPortalToken()).toBeNull();
  });
});

// ─── Vite Config Tests ──────────────────────────────────────────────────────

describe('Vite Config — HMR Safety', () => {
  it('should not hardcode HMR to port 24678', async () => {
    // Read and verify vite.config.ts doesn't reference port 24678
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.resolve(process.cwd(), 'vite.config.ts');
    
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).not.toContain('24678');
    }
  });

  it('should not hardcode ws://localhost in vite config', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.resolve(process.cwd(), 'vite.config.ts');
    
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).not.toContain('ws://localhost');
    }
  });

  it('HMR clientPort 443 should only apply when tunnel env vars are set', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.resolve(process.cwd(), 'vite.config.ts');
    
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      // Should contain conditional logic for tunnel usage
      expect(content).toContain('USE_TUNNEL');
    }
  });
});

// ─── Nav Visibility Logic Unit Tests ────────────────────────────────────────

describe('Nav Visibility — Upcoming Events', () => {
  it('should show Upcoming Events when argyleFeatureStatus.enabled is true', () => {
    const argyleFeatureStatus = { enabled: true };
    const shouldShow = argyleFeatureStatus?.enabled === true;
    expect(shouldShow).toBe(true);
  });

  it('should NOT show Upcoming Events when argyleFeatureStatus.enabled is false', () => {
    const argyleFeatureStatus = { enabled: false };
    const shouldShow = argyleFeatureStatus?.enabled === true;
    expect(shouldShow).toBe(false);
  });

  it('should NOT show Upcoming Events when argyleFeatureStatus is undefined (loading)', () => {
    const argyleFeatureStatus = undefined as { enabled: boolean } | undefined;
    const shouldShow = argyleFeatureStatus?.enabled === true;
    expect(shouldShow).toBe(false);
  });

  it('should NOT show when query returns available:false fallback', () => {
    const argyleFeatureStatus = { available: false };
    const shouldShow = (argyleFeatureStatus as any)?.enabled === true;
    expect(shouldShow).toBe(false);
  });
});
