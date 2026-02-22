import { describe, expect, it } from 'vitest';
import { createClientRecordingStreamToken, resolveRecordingRequestAuth } from '../routes/client-portal';

describe('Client Portal Lead Recording Stream Auth', () => {
  const leadId = 'lead-123';

  it('accepts a valid query token for client streaming', () => {
    const token = createClientRecordingStreamToken({
      type: 'client_portal_lead_recording_stream',
      leadId,
      authMode: 'client',
      clientUserId: 'client-user-1',
      clientAccountId: 'client-account-1',
    });

    const req = {
      query: { token },
      headers: {},
    } as any;

    const result = resolveRecordingRequestAuth(req, leadId);
    expect(result.context).toBeTruthy();
    expect(result.context?.mode).toBe('client');
    expect(result.tokenVerified).toBe(true);
  });

  it('rejects invalid query token with unauthorized reason', () => {
    const req = {
      query: { token: 'invalid-token' },
      headers: {},
    } as any;

    const result = resolveRecordingRequestAuth(req, leadId);
    expect(result.context).toBeNull();
    expect(result.tokenVerified).toBe(false);
    expect(result.reason).toBe('invalid_or_expired_query_token');
  });

  it('falls back to admin cookie auth even if query token is invalid', () => {
    const req = {
      query: { token: 'invalid-token' },
      headers: {},
      user: { id: 'admin-2' },
      isAuthenticated: () => true,
    } as any;

    const result = resolveRecordingRequestAuth(req, leadId);
    expect(result.context).toBeTruthy();
    expect(result.context?.mode).toBe('admin');
    expect(result.context?.authPath).toBe('cookie');
  });

  it('accepts admin cookie auth when available', () => {
    const req = {
      query: {},
      headers: {},
      user: { id: 'admin-1' },
      isAuthenticated: () => true,
    } as any;

    const result = resolveRecordingRequestAuth(req, leadId);
    expect(result.context).toBeTruthy();
    expect(result.context?.mode).toBe('admin');
    expect(result.context?.authPath).toBe('cookie');
  });
});
