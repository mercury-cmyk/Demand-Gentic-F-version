import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import {
  createClientRecordingStreamToken,
  resolveQualifiedLeadRecordingUrl,
  resolveRecordingRequestAuth,
} from '../client-portal';

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key-change-in-production';

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    query: {},
    headers: {},
    ...overrides,
  } as Request;
}

describe('client portal recording download auth', () => {
  it('accepts a valid query token for the same lead', () => {
    const leadId = 'lead-abc';
    const token = createClientRecordingStreamToken({
      type: 'client_portal_lead_recording_stream',
      leadId,
      authMode: 'client',
      clientUserId: 'client-user-1',
      clientAccountId: 'client-account-1',
    });

    const req = buildReq({ query: { token } as any });
    const auth = resolveRecordingRequestAuth(req, leadId);

    expect(auth.context).toBeTruthy();
    expect(auth.context?.mode).toBe('client');
    expect((auth.context as any)?.authPath).toBe('query-token');
  });

  it('rejects query token when lead does not match', () => {
    const token = createClientRecordingStreamToken({
      type: 'client_portal_lead_recording_stream',
      leadId: 'lead-one',
      authMode: 'client',
      clientUserId: 'client-user-1',
      clientAccountId: 'client-account-1',
    });

    const req = buildReq({ query: { token } as any });
    const auth = resolveRecordingRequestAuth(req, 'lead-two');

    expect(auth.context).toBeNull();
    expect(auth.reason).toBe('query_token_lead_mismatch');
  });

  it('accepts a valid client bearer token', () => {
    const bearer = jwt.sign(
      {
        clientUserId: 'client-user-1',
        clientAccountId: 'client-account-1',
        email: 'client@example.com',
        firstName: 'Test',
        lastName: 'User',
        isClient: true,
      },
      JWT_SECRET,
      { expiresIn: '15m' },
    );

    const req = buildReq({
      headers: {
        authorization: `Bearer ${bearer}`,
      } as any,
    });

    const auth = resolveRecordingRequestAuth(req, 'lead-any');
    expect(auth.context).toBeTruthy();
    expect(auth.context?.mode).toBe('client');
    expect((auth.context as any)?.authPath).toBe('bearer');
  });

  it('does not expose direct storage URLs from qualified lead payload mapper', () => {
    expect(resolveQualifiedLeadRecordingUrl('https://storage.googleapis.com/bucket/audio.mp3', null)).toBeNull();
    expect(resolveQualifiedLeadRecordingUrl('gcs-internal://bucket/private.wav', 'recordings/private.wav')).toBeNull();
    expect(resolveQualifiedLeadRecordingUrl('/api/client-portal/qualified-leads/abc/recording/stream', null)).toBeNull();
  });
});
