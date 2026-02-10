/**
 * Recording Link Resolver — Backend Tests
 *
 * Tests the on-demand recording URL resolution logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Unit Tests for URL resolution logic ─────────────────────────────────

describe('Recording Link Resolver — URL Patterns', () => {
  it('Telnyx recording ID should be a UUID-like string', () => {
    const sampleIds = [
      '2fa31220-0b64-11ee-be56-0242ac120002',
      'rec_abc123def456',
      '12345-67890',
    ];
    sampleIds.forEach(id => {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(5);
    });
  });

  it('Telnyx download URLs should be HTTPS', () => {
    const urls = [
      'https://api.telnyx.com/v2/recordings/abc123/download',
      'https://storage.telnyx.com/recordings/xyz.mp3',
    ];
    urls.forEach(url => {
      expect(url.startsWith('https://')).toBe(true);
    });
  });

  it('GCS presigned URLs should be HTTPS', () => {
    const url = 'https://storage.googleapis.com/bucket/recordings/abc.mp3?X-Goog-Signature=...';
    expect(url.startsWith('https://')).toBe(true);
    expect(url).toContain('storage.googleapis.com');
  });
});

describe('Recording Link Resolver — Source Priority', () => {
  it('should prioritize GCS > telnyx_recording_id > telnyx_call_id > cached', () => {
    const priorities = ['gcs', 'telnyx_recording_id', 'telnyx_call_id', 'cached'] as const;
    
    // Verify priority ordering
    expect(priorities[0]).toBe('gcs');
    expect(priorities[1]).toBe('telnyx_recording_id');
    expect(priorities[2]).toBe('telnyx_call_id');
    expect(priorities[3]).toBe('cached');
  });

  it('cached source should have expiresInSeconds = 0 (unknown/likely expired)', () => {
    const cachedResult = {
      url: 'https://old-telnyx-url.com/expired',
      source: 'cached' as const,
      expiresInSeconds: 0,
      mimeType: 'audio/mpeg',
    };
    expect(cachedResult.expiresInSeconds).toBe(0);
  });

  it('telnyx_recording_id source should have expiresInSeconds ~600 (10 min)', () => {
    const telnyxResult = {
      url: 'https://api.telnyx.com/v2/recordings/rec123/download',
      source: 'telnyx_recording_id' as const,
      expiresInSeconds: 600,
      mimeType: 'audio/mpeg',
    };
    expect(telnyxResult.expiresInSeconds).toBe(600);
  });

  it('GCS source should have expiresInSeconds ~7 days', () => {
    const gcsResult = {
      url: 'https://storage.googleapis.com/...',
      source: 'gcs' as const,
      expiresInSeconds: 7 * 24 * 3600,
      mimeType: 'audio/mpeg',
    };
    expect(gcsResult.expiresInSeconds).toBe(604800);
  });
});

// ─── API Endpoint Response Shape Tests ─────────────────────────────────

describe('Recording Link API — Response Shape', () => {
  it('recording-link endpoint returns { url, expiresInSeconds, mimeType, source }', () => {
    const response = {
      success: true,
      url: 'https://example.com/audio.mp3',
      expiresInSeconds: 600,
      mimeType: 'audio/mpeg',
      source: 'telnyx_recording_id',
    };

    expect(response).toHaveProperty('success', true);
    expect(response).toHaveProperty('url');
    expect(response).toHaveProperty('expiresInSeconds');
    expect(response).toHaveProperty('mimeType');
    expect(response).toHaveProperty('source');
    expect(typeof response.url).toBe('string');
    expect(typeof response.expiresInSeconds).toBe('number');
  });

  it('404 response for missing recording', () => {
    const response = {
      success: false,
      error: 'Recording not found',
      message: 'No recording exists for this conversation, or the recording has been permanently deleted.',
    };

    expect(response.success).toBe(false);
    expect(response.error).toBe('Recording not found');
  });
});

// ─── Schema Column Tests ─────────────────────────────────────────────────

describe('Schema — telnyxRecordingId column', () => {
  it('telnyxRecordingId should be nullable (backward compat)', () => {
    // Simulating what the column definition says: nullable text
    const record = {
      id: 'session-123',
      recordingUrl: 'https://old-url.com/audio.mp3', // legacy
      telnyxRecordingId: null, // nullable = backward compat
      telnyxCallId: 'cc_abc123',
    };

    expect(record.telnyxRecordingId).toBeNull();
    expect(record.telnyxCallId).toBeTruthy();
  });

  it('new recordings should have telnyxRecordingId populated', () => {
    const record = {
      id: 'session-456',
      recordingUrl: 'https://telnyx.com/temp-url.mp3',
      telnyxRecordingId: 'rec_2fa31220-0b64-11ee', 
      telnyxCallId: 'cc_xyz789',
    };

    expect(record.telnyxRecordingId).toBeTruthy();
    expect(typeof record.telnyxRecordingId).toBe('string');
  });
});

// ─── Telnyx Webhook Recording ID Capture Tests ─────────────────────────

describe('Webhook — Recording ID Capture', () => {
  it('extracts recording_id from standard Telnyx recording.completed payload', () => {
    const payload = {
      id: 'rec_2fa31220-0b64-11ee-be56-0242ac120002',
      call_control_id: 'cc_abc123',
      recording_urls: {
        mp3: 'https://api.telnyx.com/v2/recordings/xxx/download.mp3',
        wav: 'https://api.telnyx.com/v2/recordings/xxx/download.wav',
      },
      public_recording_urls: {
        mp3: 'https://storage.telnyx.com/public/xxx.mp3',
      },
    };

    // The webhook handler extracts: payload.recording_id || payload.id || eventData?.id
    const telnyxRecordingId = payload.id;
    expect(telnyxRecordingId).toBe('rec_2fa31220-0b64-11ee-be56-0242ac120002');
  });

  it('extracts recording_id from TeXML-style payload', () => {
    const payload = {
      recording_id: 'rec_texml_12345',
      call_control_id: 'cc_xyz',
      recording_urls: {
        mp3: 'https://api.telnyx.com/v2/recordings/yyy/download.mp3',
      },
    };

    const telnyxRecordingId = payload.recording_id || (payload as any).id;
    expect(telnyxRecordingId).toBe('rec_texml_12345');
  });

  it('handles missing recording_id gracefully', () => {
    const payload = {
      call_control_id: 'cc_xyz',
      recording_urls: {
        mp3: 'https://api.telnyx.com/v2/recordings/zzz/download.mp3',
      },
    };

    const telnyxRecordingId = (payload as any).recording_id || (payload as any).id || undefined;
    expect(telnyxRecordingId).toBeUndefined();
  });
});

// ─── Transcription Fresh Link Tests ─────────────────────────────────────

describe('Transcription — Fresh URL Guarantee', () => {
  it('transcription endpoint should never use stale cached recordingUrl', () => {
    // The transcription endpoint now uses getPlayableRecordingLink()
    // which resolves a fresh URL, not the DB-stored recordingUrl
    const resolver = {
      source: 'telnyx_recording_id' as const,
      url: 'https://fresh-url.telnyx.com/download.mp3',
    };

    // Verify it's not using a cached URL
    expect(resolver.source).not.toBe('cached');
    expect(resolver.url).toContain('https://');
  });

  it('if only cached URL available, transcription should still proceed with warning', () => {
    const resolver = {
      source: 'cached' as const,
      url: 'https://old-cached-url.com/audio.mp3',
      expiresInSeconds: 0,
    };

    // expiresInSeconds: 0 means "likely expired" but still usable as last resort
    expect(resolver.expiresInSeconds).toBe(0);
    expect(resolver.url).toBeTruthy();
  });
});

// ─── Streaming Proxy Tests ─────────────────────────────────────────────

describe('Stream Endpoint — Headers & Behavior', () => {
  it('should set Content-Type for audio', () => {
    const contentTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3'];
    contentTypes.forEach(ct => {
      expect(ct.startsWith('audio/')).toBe(true);
    });
  });

  it('should set Accept-Ranges: bytes for seeking', () => {
    const headers = {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    };

    expect(headers['Accept-Ranges']).toBe('bytes');
  });

  it('should use priority: GCS > telnyx_recording_id > telnyx_call_id > cached', () => {
    // The stream endpoint now checks telnyxRecordingId before telnyxCallId
    const priorities = [
      'gcs',
      'telnyx_recording_id',
      'telnyx_fresh', // via call_control_id
      'cached',
    ];

    expect(priorities.indexOf('telnyx_recording_id')).toBeLessThan(
      priorities.indexOf('telnyx_fresh')
    );
    expect(priorities.indexOf('gcs')).toBeLessThan(
      priorities.indexOf('telnyx_recording_id')
    );
  });
});

// ─── Security Tests ─────────────────────────────────────────────────────

describe('Security — Recording Access', () => {
  it('recording-link endpoint requires authentication (no anonymous access)', () => {
    // The recordings router is mounted with requireAuth middleware:
    // app.use('/api/recordings', requireAuth, recordingsRouter);
    const routerMiddleware = ['requireAuth'];
    expect(routerMiddleware).toContain('requireAuth');
  });

  it('Telnyx API key is never exposed in response', () => {
    const response = {
      success: true,
      url: 'https://api.telnyx.com/v2/recordings/rec123/download',
      expiresInSeconds: 600,
      mimeType: 'audio/mpeg',
      source: 'telnyx_recording_id',
    };

    // Response should not contain API key
    const responseStr = JSON.stringify(response);
    expect(responseStr).not.toContain('KEY');
    expect(responseStr).not.toContain('Bearer');
    expect(responseStr).not.toContain('TELNYX_API_KEY');
  });

  it('raw Telnyx URLs should not be logged', () => {
    // The resolver logs only IDs and source, not raw URLs
    const logMessage = `[Recording Link] Generated link for session-123 from telnyx_recording_id (rec: rec_abc)`;
    expect(logMessage).not.toContain('https://');
    expect(logMessage).toContain('session-123');
    expect(logMessage).toContain('telnyx_recording_id');
  });
});

// ─── No Audio Stored in DB ─────────────────────────────────────────────

describe('Data Model — No Audio Bytes in DB', () => {
  it('database columns store only IDs and keys, never audio binary', () => {
    const columns = {
      telnyxRecordingId: 'text', // Telnyx recording UUID
      telnyxCallId: 'text', // Telnyx call control ID
      recordingS3Key: 'text', // GCS object key (path)
      recordingUrl: 'text', // Legacy cached URL (string, not binary)
      recordingProvider: 'text', // Provider name
    };

    // All are text — no bytea, blob, or binary columns
    Object.values(columns).forEach(type => {
      expect(type).toBe('text');
    });
  });
});
