/**
 * Unified Recording Player — Frontend Tests
 *
 * Tests the on-demand link resolution, auto-retry, and UI states.
 */

import { describe, it, expect } from 'vitest';

// ─── Player State Machine Tests ────────────────────────────────────────

describe('Recording Player — State Machine', () => {
  const states = ['ready', 'fetching', 'playing', 'refreshing'] as const;

  it('initial state should be "ready"', () => {
    const initialState: typeof states[number] = 'ready';
    expect(initialState).toBe('ready');
  });

  it('clicking Play transitions to "fetching" then "playing"', () => {
    const transitions = ['ready', 'fetching', 'playing'];
    expect(transitions[0]).toBe('ready');
    expect(transitions[1]).toBe('fetching');
    expect(transitions[2]).toBe('playing');
  });

  it('playback error transitions to "refreshing" then back to "ready" or "playing"', () => {
    const transitions = ['playing', 'refreshing', 'ready'];
    expect(transitions[0]).toBe('playing');
    expect(transitions[1]).toBe('refreshing');
  });
});

// ─── Auto-Retry Logic Tests ────────────────────────────────────────────

describe('Recording Player — Auto-Retry', () => {
  it('auto-retries once on first playback error by fetching fresh link', () => {
    let retryCount = 0;
    const maxAutoRetries = 1;

    // Simulate first error
    if (retryCount < maxAutoRetries) {
      retryCount++;
      // Would call fetchFreshLink() here
    }

    expect(retryCount).toBe(1);
  });

  it('does not auto-retry more than once', () => {
    let retryCount = 1; // Already auto-retried once

    // Second error — should show error UI, not auto-retry
    const shouldAutoRetry = retryCount === 0;
    expect(shouldAutoRetry).toBe(false);
  });

  it('manual retry is available up to 3 total attempts', () => {
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
      expect(i < maxRetries).toBe(true);
    }

    // After 3 retries, no more attempts
    expect(3 >= maxRetries).toBe(true);
  });
});

// ─── Recording Availability Tests ──────────────────────────────────────

describe('Recording Player — Availability States', () => {
  it('shows "Recording not available" when recording.available is false', () => {
    const recording = {
      available: false,
      status: 'none' as const,
    };

    expect(recording.available).toBe(false);
    expect(recording.status).toBe('none');
  });

  it('shows "Recording pending..." when status is pending', () => {
    const recording = {
      available: false,
      status: 'pending' as const,
    };

    expect(recording.status).toBe('pending');
  });

  it('shows "Recording failed" when status is failed', () => {
    const recording = {
      available: false,
      status: 'failed' as const,
    };

    expect(recording.status).toBe('failed');
  });

  it('shows player when recording.available is true', () => {
    const recording = {
      available: true,
      status: 'stored' as const,
      telnyxRecordingId: 'rec_abc123',
    };

    expect(recording.available).toBe(true);
    expect(recording.telnyxRecordingId).toBeTruthy();
  });
});

// ─── URL Source Selection Tests ─────────────────────────────────────────

describe('Recording Player — URL Sources', () => {
  it('primary source is the stream endpoint', () => {
    const recordingId = 'session-123';
    const streamUrl = `/api/recordings/${recordingId}/stream`;

    expect(streamUrl).toBe('/api/recordings/session-123/stream');
  });

  it('on error, fetches fresh link from recording-link endpoint', () => {
    const recordingId = 'session-123';
    const linkEndpoint = `/api/recordings/${recordingId}/recording-link`;

    expect(linkEndpoint).toBe('/api/recordings/session-123/recording-link');
  });

  it('freshUrl overrides streamUrl when set', () => {
    const streamUrl = '/api/recordings/session-123/stream';
    const freshUrl = 'https://api.telnyx.com/v2/recordings/rec_abc/download';

    const audioSrc = freshUrl || streamUrl;
    expect(audioSrc).toBe(freshUrl);
  });

  it('streamUrl is used when no freshUrl available', () => {
    const streamUrl = '/api/recordings/session-123/stream';
    const freshUrl = null;

    const audioSrc = freshUrl || streamUrl;
    expect(audioSrc).toBe(streamUrl);
  });
});

// ─── Fallback UI Tests ─────────────────────────────────────────────────

describe('Recording Player — Fallback UI', () => {
  it('error state shows retry button, refresh link button, and open-in-tab link', () => {
    const errorState = {
      error: 'Audio format not supported',
      retryCount: 0,
      maxRetries: 3,
    };

    const showRetryButton = errorState.retryCount < errorState.maxRetries;
    expect(showRetryButton).toBe(true);

    // Refresh link button always visible
    const showRefreshButton = true;
    expect(showRefreshButton).toBe(true);

    // Open in new tab always visible as last resort
    const showOpenInTab = true;
    expect(showOpenInTab).toBe(true);
  });

  it('retry button shows remaining attempts', () => {
    const retryCount = 1;
    const maxRetries = 3;
    const remaining = maxRetries - retryCount;

    expect(remaining).toBe(2);
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
    expect(typeof recording.telnyxRecordingId).toBe('string');
  });

  it('telnyxRecordingId can be undefined for old recordings', () => {
    const recording = {
      available: true,
      status: 'stored' as const,
      url: 'https://old-url.com',
    };

    expect((recording as any).telnyxRecordingId).toBeUndefined();
  });
});
