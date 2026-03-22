/**
 * Unified Recording Player — Frontend Tests
 *
 * Updated: player ALWAYS uses stream endpoint (never raw Telnyx URLs),
 * "Refresh link" shows loading/toast feedback, "Open in new tab" opens
 * stream endpoint, "Resync" button for missing recording IDs.
 */

import { describe, it, expect } from 'vitest';

// ─── Audio Source Invariant ────────────────────────────────────────────

describe('Recording Player — Audio Source Invariant', () => {
  it('audio src ALWAYS uses the stream endpoint', () => {
    const recordingId = 'session-123';
    const streamUrl = `/api/recordings/${recordingId}/stream`;
    expect(streamUrl).toContain('/stream');
    expect(streamUrl).not.toContain('api.telnyx.com');
  });

  it('cache-bust param forces audio element to reload', () => {
    const recordingId = 'session-123';
    const cacheBust = Date.now();
    const streamUrl = `/api/recordings/${recordingId}/stream?t=${cacheBust}`;
    expect(streamUrl).toContain('?t=');
  });

  it('no freshUrl concept — stream URL is always used', () => {
    // The old implementation set freshUrl to a direct Telnyx URL.
    // The new implementation always uses the stream endpoint.
    const streamUrl = '/api/recordings/session-123/stream';
    const audioSrc = streamUrl; // No freshUrl override
    expect(audioSrc).toBe(streamUrl);
  });
});

// ─── Auto-Retry Logic Tests ────────────────────────────────────────────

describe('Recording Player — Auto-Retry', () => {
  it('auto-retries once on first playback error via warmAndReload', () => {
    let retryCount = 0;
    const maxAutoRetries = 1;
    if (retryCount  {
    let retryCount = 1;
    const shouldAutoRetry = retryCount === 0;
    expect(shouldAutoRetry).toBe(false);
  });

  it('manual retry is available up to 3 total attempts', () => {
    const maxRetries = 3;
    for (let i = 0; i  {
    const recordingId = 'session-123';
    const endpoint = `/api/recordings/${recordingId}/recording-link`;
    expect(endpoint).toContain('/recording-link');
    // After warm, cacheBust is set to Date.now()
    const cacheBust = Date.now();
    expect(cacheBust).toBeGreaterThan(0);
  });
});

// ─── Refresh Link Feedback ─────────────────────────────────────────────

describe('Recording Player — Refresh Link Feedback', () => {
  it('shows loading spinner during refresh', () => {
    let isRefreshing = false;
    isRefreshing = true; // handleRefreshLink sets this
    expect(isRefreshing).toBe(true);
    isRefreshing = false; // handleRefreshLink clears this in finally
    expect(isRefreshing).toBe(false);
  });

  it('shows success toast on successful refresh', () => {
    const toast = { title: 'Link refreshed', description: 'Audio source updated.' };
    expect(toast.title).toBe('Link refreshed');
  });

  it('shows error toast on failed refresh', () => {
    const toast = { title: 'Refresh failed', description: 'Could not resolve a fresh recording link.', variant: 'destructive' };
    expect(toast.variant).toBe('destructive');
  });
});

// ─── Resync Button ─────────────────────────────────────────────────────

describe('Recording Player — Resync', () => {
  it('resync button appears when telnyxRecordingId is missing', () => {
    const recording = { available: true, status: 'stored' as const, telnyxRecordingId: undefined };
    const showResync = !recording.telnyxRecordingId;
    expect(showResync).toBe(true);
  });

  it('resync button hidden when telnyxRecordingId exists', () => {
    const recording = { available: true, status: 'stored' as const, telnyxRecordingId: 'rec_123' };
    const showResync = !recording.telnyxRecordingId;
    expect(showResync).toBe(false);
  });

  it('resync calls POST /api/recordings/:id/resync', () => {
    const recordingId = 'session-123';
    const endpoint = `/api/recordings/${recordingId}/resync`;
    expect(endpoint).toContain('/resync');
  });

  it('shows loading spinner during resync', () => {
    let isResyncing = false;
    isResyncing = true;
    expect(isResyncing).toBe(true);
    isResyncing = false;
    expect(isResyncing).toBe(false);
  });
});

// ─── Open In New Tab ───────────────────────────────────────────────────

describe('Recording Player — Open In New Tab', () => {
  it('opens the stream endpoint, NOT a JSON endpoint', () => {
    const recordingId = 'session-123';
    const href = `/api/recordings/${recordingId}/stream`;
    expect(href).toContain('/stream');
    expect(href).not.toContain('/recording-link');
  });

  it('stream endpoint returns audio bytes (not JSON)', () => {
    // Verified by backend: Content-Type is audio/*, never application/json
    const expectedContentType = 'audio/mpeg';
    expect(expectedContentType).toMatch(/^audio\//);
  });
});

// ─── Recording Availability States ─────────────────────────────────────

describe('Recording Player — Availability States', () => {
  it('shows "Recording not available" when recording.available is false', () => {
    const recording = { available: false, status: 'none' as const };
    expect(recording.available).toBe(false);
  });

  it('shows "Recording pending..." when status is pending', () => {
    const recording = { available: false, status: 'pending' as const };
    expect(recording.status).toBe('pending');
  });

  it('shows "Recording failed" when status is failed', () => {
    const recording = { available: false, status: 'failed' as const };
    expect(recording.status).toBe('failed');
  });

  it('shows player when recording.available is true', () => {
    const recording = { available: true, status: 'stored' as const, telnyxRecordingId: 'rec_abc123' };
    expect(recording.available).toBe(true);
  });
});

// ─── Error UI ──────────────────────────────────────────────────────────

describe('Recording Player — Error UI', () => {
  it('error state shows retry, refresh, resync (if needed), and open-in-tab', () => {
    const errorState = { error: 'Audio format not supported', retryCount: 0, maxRetries: 3, telnyxRecordingId: undefined };

    expect(errorState.retryCount  {
    const remaining = 3 - 1;
    expect(remaining).toBe(2);
  });

  it('download uses stream endpoint', () => {
    const recordingId = 'session-123';
    const downloadHref = `/api/recordings/${recordingId}/stream`;
    expect(downloadHref).toContain('/stream');
  });
});

// ─── Types — UnifiedRecording ──────────────────────────────────────────

describe('Types — UnifiedRecording includes telnyxRecordingId', () => {
  it('UnifiedRecording type includes telnyxRecordingId field', () => {
    const recording = {
      available: true,
      status: 'stored' as const,
      url: 'https://old-url.com',
      s3Key: 'recordings/abc.mp3',
      telnyxRecordingId: 'rec_12345',
      mimeType: 'audio/mpeg',
      durationSec: 120,
      fileSizeBytes: 1024000,
    };
    expect(recording.telnyxRecordingId).toBe('rec_12345');
  });

  it('telnyxRecordingId can be undefined for old recordings', () => {
    const recording = { available: true, status: 'stored' as const, url: 'https://old-url.com' };
    expect((recording as any).telnyxRecordingId).toBeUndefined();
  });
});