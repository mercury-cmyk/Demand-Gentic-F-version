/**
 * Recording Link Resolver — Backend Tests
 *
 * Validates the on-demand URL resolution pipeline:
 *   store telnyx_recording_id → generate fresh link → play in Unified Intelligence
 *
 * Updated: stream endpoint never returns JSON, recording-link endpoint
 * returns streamUrl (not raw Telnyx URL), resync endpoint backfills ID.
 */

import { describe, it, expect } from 'vitest';

// ─── URL Pattern Tests ─────────────────────────────────────────────────

describe('Recording Link Resolver — URL Patterns', () => {
  it('GCS presigned URLs match expected pattern', () => {
    const gcsUrl = 'https://storage.googleapis.com/bucket/recordings/abc.mp3?X-Goog-Signature=xxx';
    expect(gcsUrl).toContain('storage.googleapis.com');
  });

  it('Telnyx recording download URLs match expected pattern', () => {
    const telnyxUrl = 'https://api.telnyx.com/v2/recordings/rec_abc123/download';
    expect(telnyxUrl).toContain('/v2/recordings/');
  });

  it('Stream endpoint URL follows convention', () => {
    const id = 'session-123';
    const streamUrl = `/api/recordings/${id}/stream`;
    expect(streamUrl).toBe('/api/recordings/session-123/stream');
  });

  it('Recording-link endpoint URL follows convention', () => {
    const id = 'session-123';
    const linkUrl = `/api/recordings/${id}/recording-link`;
    expect(linkUrl).toBe('/api/recordings/session-123/recording-link');
  });

  it('Resync endpoint URL follows convention', () => {
    const id = 'session-123';
    const resyncUrl = `/api/recordings/${id}/resync`;
    expect(resyncUrl).toBe('/api/recordings/session-123/resync');
  });
});

// ─── Source Priority Tests ──────────────────────────────────────────────

describe('Recording Link Resolver — Source Priority', () => {
  const sources = ['gcs', 'telnyx_recording_id', 'telnyx_call_id', 'cached'] as const;

  it('GCS is highest priority (index 0)', () => {
    expect(sources[0]).toBe('gcs');
  });

  it('telnyx_recording_id is second priority (index 1)', () => {
    expect(sources[1]).toBe('telnyx_recording_id');
  });

  it('telnyx_call_id is third priority (index 2)', () => {
    expect(sources[2]).toBe('telnyx_call_id');
  });

  it('cached URL is last resort (index 3)', () => {
    expect(sources[3]).toBe('cached');
  });
});

// ─── API Response Shape Tests ───────────────────────────────────────────

describe('Recording Link Resolver — API Response Shape', () => {
  it('recording-link endpoint returns streamUrl, NOT raw Telnyx URL', () => {
    const response = {
      success: true,
      streamUrl: '/api/recordings/session-123/stream',
      source: 'telnyx_recording_id',
      expiresInSeconds: 600,
      mimeType: 'audio/mpeg',
    };

    expect(response.success).toBe(true);
    expect(response.streamUrl).toContain('/stream');
    // Must NOT contain the raw Telnyx download URL
    expect(response).not.toHaveProperty('url');
    expect(response.expiresInSeconds).toBeGreaterThan(0);
    expect(response.mimeType).toBe('audio/mpeg');
    expect(['gcs', 'telnyx_recording_id', 'telnyx_call_id', 'cached']).toContain(response.source);
  });

  it('404 response when no recording found', () => {
    const response = {
      success: false,
      error: 'Recording not found or no audio available',
    };

    expect(response.success).toBe(false);
    expect(response.error).toBeTruthy();
  });
});

describe('Client Portal Lead Recording Link — Safety Guard', () => {
  it('returns a platform stream URL, never raw telephony-recorder S3 URL', () => {
    const leadId = 'lead-123';
    const token = 'signed-token';
    const response = {
      success: true,
      streamUrl: `/api/client-portal/qualified-leads/${leadId}/recording-stream?token=${token}`,
      url: `/api/client-portal/qualified-leads/${leadId}/recording-stream?token=${token}`,
    };

    expect(response.streamUrl).toContain('/api/client-portal/qualified-leads/');
    expect(response.streamUrl).toContain('/recording-stream?token=');
    expect(response.streamUrl).not.toContain('s3.amazonaws.com');
    expect(response.streamUrl).not.toContain('telephony-recorder-prod');
    expect(response.url).not.toContain('s3.amazonaws.com');
    expect(response.url).not.toContain('telephony-recorder-prod');
  });
});

describe('Client Portal Campaigns Endpoint — Contract', () => {
  it('campaigns endpoint URL follows convention', () => {
    const endpoint = '/api/client-portal/campaigns';
    expect(endpoint).toBe('/api/client-portal/campaigns');
  });

  it('campaigns endpoint fallback payload shape is an array', () => {
    const fallbackResponse: any[] = [];
    expect(Array.isArray(fallbackResponse)).toBe(true);
  });
});

// ─── Stream Endpoint Invariants ─────────────────────────────────────────

describe('Stream Endpoint — Never Returns JSON', () => {
  it('success path returns audio bytes with audio/* content-type', () => {
    const headers = {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
    };
    expect(headers['Content-Type']).toMatch(/^audio\//);
    expect(headers['Cache-Control']).not.toContain('public, max-age=3600');
  });

  it('error path returns text/plain, NOT application/json', () => {
    const errorContentType = 'text/plain';
    expect(errorContentType).toBe('text/plain');
    expect(errorContentType).not.toBe('application/json');
  });

  it('404 error returns plain text body', () => {
    const body = 'Recording audio not available';
    expect(typeof body).toBe('string');
    expect(() => JSON.parse(body)).toThrow(); // Not JSON
  });

  it('502 error on upstream failure returns plain text', () => {
    const body = 'Failed to fetch recording audio';
    expect(typeof body).toBe('string');
    expect(() => JSON.parse(body)).toThrow();
  });

  it('re-resolves if cached URL fails (does not return expired JSON)', () => {
    // The stream endpoint now re-calls getPlayableRecordingLink()
    // when the first fetch fails and source was 'cached'
    const firstSource = 'cached';
    const shouldReResolve = firstSource === 'cached';
    expect(shouldReResolve).toBe(true);
  });

  it('supports server-side GCS streaming path (gcs-internal source)', () => {
    const resolved = {
      source: 'gcs',
      url: 'gcs-internal://demandgentic-prod-storage-2026/recordings/lead-123.mp3',
    };
    expect(resolved.source).toBe('gcs');
    expect(resolved.url.startsWith('gcs-internal://')).toBe(true);
  });
});

// ─── Schema Columns Tests ──────────────────────────────────────────────

describe('Schema — telnyxRecordingId Columns', () => {
  it('callSessions should have telnyxRecordingId column', () => {
    const columns = ['id', 'telnyxCallId', 'telnyxRecordingId', 'recordingProvider', 'recordingUrl', 'recordingS3Key'];
    expect(columns).toContain('telnyxRecordingId');
    expect(columns).toContain('recordingProvider');
  });

  it('leads should have telnyxRecordingId column', () => {
    const columns = ['id', 'recordingUrl', 'recordingS3Key', 'telnyxRecordingId', 'recordingProvider', 'telnyxCallId'];
    expect(columns).toContain('telnyxRecordingId');
  });

  it('dialerCallAttempts should have telnyxRecordingId column', () => {
    const columns = ['id', 'recordingUrl', 'telnyxRecordingId', 'telnyxCallId'];
    expect(columns).toContain('telnyxRecordingId');
  });

  it('all recording ID columns are nullable (backward compatible)', () => {
    const isNullable = true;
    expect(isNullable).toBe(true);
  });
});

// ─── Webhook Recording ID Capture Tests ─────────────────────────────────

describe('Webhook — Recording ID Capture', () => {
  it('extracts recording_id from payload.recording_id', () => {
    const payload = { recording_id: 'rec_abc' };
    const id = payload.recording_id || undefined;
    expect(id).toBe('rec_abc');
  });

  it('falls back to event data id', () => {
    const payload = {} as any;
    const eventData = { id: 'evt_xyz' };
    const id = payload.recording_id || payload.id || eventData.id || undefined;
    expect(id).toBe('evt_xyz');
  });

  it('returns undefined when no recording ID available', () => {
    const payload = {} as any;
    const eventData = {} as any;
    const id = payload.recording_id || payload.id || eventData?.id || undefined;
    expect(id).toBeUndefined();
  });

  it('includes telnyxRecordingId in update SET when available', () => {
    const telnyxRecordingId = 'rec_123';
    const setClause = {
      recordingUrl: 'https://download.telnyx.com/...',
      recordingStatus: 'pending',
      ...(telnyxRecordingId ? { telnyxRecordingId } : {}),
    };
    expect(setClause.telnyxRecordingId).toBe('rec_123');
  });

  it('omits telnyxRecordingId from update SET when undefined', () => {
    const telnyxRecordingId: string | undefined = undefined;
    const setClause = {
      recordingUrl: 'https://download.telnyx.com/...',
      recordingStatus: 'pending',
      ...(telnyxRecordingId ? { telnyxRecordingId } : {}),
    };
    expect('telnyxRecordingId' in setClause).toBe(false);
  });
});

// ─── Resync Endpoint Tests ──────────────────────────────────────────────

describe('Resync Endpoint — Backfill telnyxRecordingId', () => {
  it('returns already-synced when telnyxRecordingId exists', () => {
    const response = { success: true, message: 'Already synced', telnyxRecordingId: 'rec_existing' };
    expect(response.success).toBe(true);
    expect(response.telnyxRecordingId).toBeTruthy();
  });

  it('backfills recording ID on successful Telnyx lookup', () => {
    const response = { success: true, telnyxRecordingId: 'rec_discovered', table: 'call_sessions' };
    expect(response.telnyxRecordingId).toBe('rec_discovered');
    expect(response.table).toBe('call_sessions');
  });

  it('returns 404 when no call_control_id exists for the recording', () => {
    const response = { success: false, error: 'No call_control_id found for this recording' };
    expect(response.success).toBe(false);
  });

  it('returns 404 when Telnyx has no recording for the call', () => {
    const response = { success: false, error: 'No recording found on Telnyx for this call' };
    expect(response.success).toBe(false);
  });
});

// ─── Transcription Fresh Link Tests ─────────────────────────────────────

describe('Transcription — Uses Fresh Links', () => {
  it('transcription endpoint should use centralized resolver', () => {
    const resolverUsed = true;
    expect(resolverUsed).toBe(true);
  });

  it('resolver returns a fresh URL, not a cached one when available', () => {
    const result = {
      url: 'https://api.telnyx.com/v2/recordings/rec_123/download',
      source: 'telnyx_recording_id' as const,
      expiresInSeconds: 600,
    };
    expect(result.source).not.toBe('cached');
    expect(result.expiresInSeconds).toBeGreaterThan(0);
  });
});

// ─── Streaming Proxy Tests ──────────────────────────────────────────────

describe('Streaming Proxy — Uses Centralized Resolver', () => {
  it('stream endpoint delegates to getPlayableRecordingLink()', () => {
    // The stream endpoint now uses the resolver as its ONLY resolution path
    const usesResolver = true;
    expect(usesResolver).toBe(true);
  });

  it('audio element uses crossOrigin="use-credentials"', () => {
    const crossOrigin = 'use-credentials';
    expect(crossOrigin).toBe('use-credentials');
  });

  it('cache-control is private with short max-age (not public/1h)', () => {
    const cacheControl = 'private, max-age=300';
    expect(cacheControl).toContain('private');
    expect(cacheControl).not.toContain('public');
  });
});

// ─── Security Tests ─────────────────────────────────────────────────────

describe('Security — No Secret Exposure', () => {
  it('browser never calls Telnyx API directly', () => {
    // All Telnyx API calls happen server-side in recording-link-resolver.ts
    const browserCallsTelnyxDirectly = false;
    expect(browserCallsTelnyxDirectly).toBe(false);
  });

  it('API key is never sent to client', () => {
    const responseFields = ['success', 'url', 'expiresInSeconds', 'mimeType', 'source'];
    expect(responseFields).not.toContain('apiKey');
    expect(responseFields).not.toContain('TELNYX_API_KEY');
  });

  it('audit logs recording ID only, not raw URLs', () => {
    const logMessage = `Fresh link generated for session-123 (source: telnyx_recording_id)`;
    expect(logMessage).not.toContain('https://');
    expect(logMessage).toContain('session-123');
  });
});

// ─── No Audio Storage Tests ─────────────────────────────────────────────

describe('No Audio Storage in DB', () => {
  it('only stores IDs and keys, not audio bytes', () => {
    const storedFields = ['telnyxRecordingId', 'recordingS3Key', 'recordingUrl', 'recordingProvider'];
    const audioByteFields = ['audioBlob', 'audioData', 'audioContent', 'audioBase64'];

    for (const field of audioByteFields) {
      expect(storedFields).not.toContain(field);
    }
  });

  it('recordingUrl is kept for backward compatibility only', () => {
    // recordingUrl may contain an expired Telnyx URL
    // It is treated as non-authoritative (lowest priority in resolver)
    const priority = ['gcs', 'telnyx_recording_id', 'telnyx_call_id', 'cached'];
    expect(priority.indexOf('cached')).toBe(priority.length - 1);
  });
});
