/**
 * Recording Link Resolver
 *
 * Centralized utility for resolving playable recording URLs on-demand.
 * Never returns stale/expired URLs — always generates fresh links.
 *
 * Resolution priority:
 *   1. GCS presigned URL (if recording was stored permanently)
 *   2. Telnyx Recording ID → GET /v2/recordings/:id → download_urls (preferred stable path)
 *   3. Telnyx Call Control ID filter search → download_urls (fallback)
 *   4. Cached DB recordingUrl (last resort, may be expired)
 *
 * Security:
 *   - Telnyx API key is never exposed to the browser
 *   - The browser receives either a presigned GCS URL or a backend proxy URL
 *   - No audio bytes are stored in the DB — only IDs/keys
 */

import { db } from '../db';
import { callSessions, leads, dialerCallAttempts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getCallSessionRecordingUrl, getRecordingUrl } from './recording-storage';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';
const TELNYX_FETCH_TIMEOUT_MS = 15000;

export interface RecordingLinkResult {
  url: string;
  source: 'gcs' | 'telnyx_recording_id' | 'telnyx_call_id' | 'cached';
  expiresInSeconds: number;
  mimeType: string;
  telnyxRecordingId?: string;
}

/**
 * Fetch a fresh playable download URL directly from a Telnyx recording ID.
 * Returns null if the recording doesn't exist or API is unavailable.
 */
export async function fetchUrlByTelnyxRecordingId(
  recordingId: string,
): Promise<{ url: string; mimeType: string } | null> {
  if (!TELNYX_API_KEY || !recordingId) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELNYX_FETCH_TIMEOUT_MS);

    const response = await fetch(`${TELNYX_API_BASE}/recordings/${recordingId}`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[RecordingResolver] Telnyx recording ${recordingId} returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const mp3 = data.data?.download_urls?.mp3;
    const wav = data.data?.download_urls?.wav;

    if (mp3) return { url: mp3, mimeType: 'audio/mpeg' };
    if (wav) return { url: wav, mimeType: 'audio/wav' };

    return null;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[RecordingResolver] Telnyx recording lookup timed out for ${recordingId}`);
    } else {
      console.warn(`[RecordingResolver] Telnyx recording lookup failed for ${recordingId}:`, err.message);
    }
    return null;
  }
}

/**
 * Fetch a fresh download URL by searching Telnyx recordings via call_control_id.
 * Also returns the recording ID so it can be persisted for future lookups.
 */
async function fetchUrlByTelnyxCallId(
  telnyxCallId: string,
): Promise<{ url: string; mimeType: string; recordingId: string } | null> {
  if (!TELNYX_API_KEY || !telnyxCallId) return null;

  try {
    const { fetchTelnyxRecording } = await import('./telnyx-recordings');
    const url = await fetchTelnyxRecording(telnyxCallId);
    if (!url) return null;

    // Also try to get the recording ID from a direct list call
    let recordingId = '';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TELNYX_FETCH_TIMEOUT_MS);
      const listResp = await fetch(
        `${TELNYX_API_BASE}/recordings?filter[call_control_id]=${encodeURIComponent(telnyxCallId)}`,
        {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);
      if (listResp.ok) {
        const listData = await listResp.json();
        recordingId = listData.data?.[0]?.id || '';
      }
    } catch {
      // Non-critical — we still have the URL
    }

    const mimeType = url.toLowerCase().includes('.wav') ? 'audio/wav' : 'audio/mpeg';
    return { url, mimeType, recordingId };
  } catch (err: any) {
    console.warn(`[RecordingResolver] Telnyx call_id lookup failed for ${telnyxCallId}:`, err.message);
    return null;
  }
}

/**
 * Resolve a playable recording link for a conversation/call session.
 *
 * @param conversationId - Call session ID, lead ID, or dialer_call_attempt ID
 * @returns Fresh URL result, or null if no recording exists
 */
export async function getPlayableRecordingLink(
  conversationId: string,
): Promise<RecordingLinkResult | null> {
  const triedSources: string[] = [];

  // ──────────────────────────────────────────────────────────
  // 1. Look up call_sessions first (most common for Unified Intel)
  // ──────────────────────────────────────────────────────────
  const [session] = await db
    .select({
      recordingUrl: callSessions.recordingUrl,
      recordingS3Key: callSessions.recordingS3Key,
      recordingStatus: callSessions.recordingStatus,
      telnyxCallId: callSessions.telnyxCallId,
      telnyxRecordingId: callSessions.telnyxRecordingId,
    })
    .from(callSessions)
    .where(eq(callSessions.id, conversationId));

  if (session) {
    // Priority 1: GCS stored recording (permanent, reliable)
    if (session.recordingS3Key) {
      triedSources.push('gcs');
      try {
        const gcsResult = await getCallSessionRecordingUrl(conversationId);
        if (gcsResult.url) {
          return {
            url: gcsResult.url,
            source: 'gcs',
            expiresInSeconds: 7 * 24 * 3600, // GCS presigned = 7 days
            mimeType: 'audio/mpeg',
            telnyxRecordingId: session.telnyxRecordingId || undefined,
          };
        }
      } catch (err: any) {
        console.warn(`[RecordingResolver] GCS failed for ${conversationId}:`, err.message);
      }
    }

    // Priority 2: Telnyx Recording ID (stable, always fresh)
    if (session.telnyxRecordingId) {
      triedSources.push('telnyx_recording_id');
      const result = await fetchUrlByTelnyxRecordingId(session.telnyxRecordingId);
      if (result) {
        return {
          url: result.url,
          source: 'telnyx_recording_id',
          expiresInSeconds: 600, // Telnyx download URLs ~10 min
          mimeType: result.mimeType,
          telnyxRecordingId: session.telnyxRecordingId,
        };
      }
    }

    // Priority 3: Telnyx Call Control ID search (slower, but discovers recording)
    if (session.telnyxCallId) {
      triedSources.push('telnyx_call_id');
      const result = await fetchUrlByTelnyxCallId(session.telnyxCallId);
      if (result) {
        // Backfill the recording ID for future lookups
        if (result.recordingId) {
          db.update(callSessions)
            .set({ telnyxRecordingId: result.recordingId })
            .where(eq(callSessions.id, conversationId))
            .catch(() => {}); // fire-and-forget
        }
        return {
          url: result.url,
          source: 'telnyx_call_id',
          expiresInSeconds: 600,
          mimeType: result.mimeType,
          telnyxRecordingId: result.recordingId || undefined,
        };
      }
    }

    // Priority 4: Cached URL (last resort)
    if (session.recordingUrl) {
      triedSources.push('cached');
      return {
        url: session.recordingUrl,
        source: 'cached',
        expiresInSeconds: 0, // Unknown, likely expired
        mimeType: 'audio/mpeg',
        telnyxRecordingId: session.telnyxRecordingId || undefined,
      };
    }
  }

  // ──────────────────────────────────────────────────────────
  // 2. Check leads table
  // ──────────────────────────────────────────────────────────
  const [lead] = await db
    .select({
      recordingUrl: leads.recordingUrl,
      recordingS3Key: leads.recordingS3Key,
      telnyxCallId: leads.telnyxCallId,
      telnyxRecordingId: leads.telnyxRecordingId,
    })
    .from(leads)
    .where(eq(leads.id, conversationId));

  if (lead) {
    if (lead.recordingS3Key) {
      triedSources.push('leads_gcs');
      try {
        const gcsResult = await getRecordingUrl(conversationId);
        if (gcsResult.url) {
          return {
            url: gcsResult.url,
            source: 'gcs',
            expiresInSeconds: 7 * 24 * 3600,
            mimeType: 'audio/mpeg',
            telnyxRecordingId: lead.telnyxRecordingId || undefined,
          };
        }
      } catch {}
    }

    if (lead.telnyxRecordingId) {
      triedSources.push('leads_telnyx_recording_id');
      const result = await fetchUrlByTelnyxRecordingId(lead.telnyxRecordingId);
      if (result) {
        return {
          url: result.url,
          source: 'telnyx_recording_id',
          expiresInSeconds: 600,
          mimeType: result.mimeType,
          telnyxRecordingId: lead.telnyxRecordingId,
        };
      }
    }

    if (lead.telnyxCallId) {
      triedSources.push('leads_telnyx_call_id');
      const result = await fetchUrlByTelnyxCallId(lead.telnyxCallId);
      if (result) {
        if (result.recordingId) {
          db.update(leads)
            .set({ telnyxRecordingId: result.recordingId })
            .where(eq(leads.id, conversationId))
            .catch(() => {});
        }
        return {
          url: result.url,
          source: 'telnyx_call_id',
          expiresInSeconds: 600,
          mimeType: result.mimeType,
          telnyxRecordingId: result.recordingId || undefined,
        };
      }
    }

    if (lead.recordingUrl) {
      return {
        url: lead.recordingUrl,
        source: 'cached',
        expiresInSeconds: 0,
        mimeType: 'audio/mpeg',
        telnyxRecordingId: lead.telnyxRecordingId || undefined,
      };
    }
  }

  // ──────────────────────────────────────────────────────────
  // 3. Check dialer_call_attempts
  // ──────────────────────────────────────────────────────────
  const [attempt] = await db
    .select({
      recordingUrl: dialerCallAttempts.recordingUrl,
      telnyxCallId: dialerCallAttempts.telnyxCallId,
      telnyxRecordingId: dialerCallAttempts.telnyxRecordingId,
    })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.id, conversationId));

  if (attempt) {
    if (attempt.telnyxRecordingId) {
      const result = await fetchUrlByTelnyxRecordingId(attempt.telnyxRecordingId);
      if (result) {
        return {
          url: result.url,
          source: 'telnyx_recording_id',
          expiresInSeconds: 600,
          mimeType: result.mimeType,
          telnyxRecordingId: attempt.telnyxRecordingId,
        };
      }
    }

    if (attempt.telnyxCallId) {
      const result = await fetchUrlByTelnyxCallId(attempt.telnyxCallId);
      if (result) {
        if (result.recordingId) {
          db.update(dialerCallAttempts)
            .set({ telnyxRecordingId: result.recordingId })
            .where(eq(dialerCallAttempts.id, conversationId))
            .catch(() => {});
        }
        return {
          url: result.url,
          source: 'telnyx_call_id',
          expiresInSeconds: 600,
          mimeType: result.mimeType,
          telnyxRecordingId: result.recordingId || undefined,
        };
      }
    }

    if (attempt.recordingUrl) {
      return {
        url: attempt.recordingUrl,
        source: 'cached',
        expiresInSeconds: 0,
        mimeType: 'audio/mpeg',
      };
    }
  }

  // ──────────────────────────────────────────────────────────
  // 4. Try treating the ID as a Telnyx recording ID directly
  // ──────────────────────────────────────────────────────────
  const directResult = await fetchUrlByTelnyxRecordingId(conversationId);
  if (directResult) {
    return {
      url: directResult.url,
      source: 'telnyx_recording_id',
      expiresInSeconds: 600,
      mimeType: directResult.mimeType,
      telnyxRecordingId: conversationId,
    };
  }

  console.warn(`[RecordingResolver] No recording found for ${conversationId}. Tried: ${triedSources.join(', ')}`);
  return null;
}

/**
 * Get a fresh audio URL suitable for download/transcription.
 * Same as getPlayableRecordingLink but returns only the URL string for simpler consumers.
 */
export async function getFreshAudioUrl(conversationId: string): Promise<string | null> {
  const result = await getPlayableRecordingLink(conversationId);
  return result?.url || null;
}
