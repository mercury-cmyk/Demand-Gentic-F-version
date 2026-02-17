/**
 * Recording Link Resolver — Centralized service for generating fresh, playable
 * recording URLs on demand.
 *
 * Resolution priority:
 *   1. GCS presigned URL  (permanent storage, 7-day expiry)
 *   2. Telnyx Recording ID (stable, generates ~10-min download URL)
 *   3. Telnyx Call Control ID search (finds recording via call, discovers recording ID)
 *   4. Cached recording URL (may be expired, last resort)
 *
 * Security:
 *   - Never exposes Telnyx API key to the browser
 *   - Logs only IDs/status, never raw URLs
 *   - Caller is responsible for auth/tenant checks before invoking
 */

import { db } from '../db';
import { callSessions, leads, dialerCallAttempts } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import {
  getCallSessionRecordingUrl,
  getRecordingUrl,
} from './recording-storage';

// ─── Types ─────────────────────────────────────────────────────────────

export interface RecordingLinkResult {
  url: string;
  source: 'gcs' | 'telnyx_recording_id' | 'telnyx_call_id' | 'cached';
  expiresInSeconds: number;
  mimeType: string;
  telnyxRecordingId?: string;
}

export interface RecordingLinkOptions {
  skipCached?: boolean;
}

function normalizePhoneCandidates(...rawValues: Array<string | null | undefined>): string[] {
  const candidates = new Set<string>();

  for (const raw of rawValues) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    candidates.add(trimmed);

    const digits = trimmed.replace(/[^\d]/g, '');
    if (!digits) continue;

    if (digits.length === 11 && digits.startsWith('1')) {
      candidates.add(`+${digits}`);
      candidates.add(digits);
      candidates.add(digits.slice(1));
      continue;
    }

    if (digits.length === 10) {
      candidates.add(`+1${digits}`);
      candidates.add(`1${digits}`);
      candidates.add(digits);
      continue;
    }

    candidates.add(`+${digits}`);
    candidates.add(digits);
  }

  return Array.from(candidates);
}

// ─── Telnyx helpers (server-only) ──────────────────────────────────────

const TELNYX_API = 'https://api.telnyx.com/v2';

/**
 * Fetch a fresh download URL using a stable Telnyx Recording ID.
 * GET /v2/recordings/:recording_id → download_urls.mp3
 */
async function fetchUrlByTelnyxRecordingId(
  recordingId: string,
): Promise<{ url: string; mimeType: string } | null> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const resp = await fetch(`${TELNYX_API}/recordings/${recordingId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.warn(`[RecordingResolver] Telnyx recording ${recordingId} returned ${resp.status}`);
      return null;
    }

    const json = await resp.json();
    const urls = json?.data?.download_urls;
    const mp3 = urls?.mp3;
    const wav = urls?.wav;

    if (mp3) return { url: mp3, mimeType: 'audio/mpeg' };
    if (wav) return { url: wav, mimeType: 'audio/wav' };

    return null;
  } catch (err: any) {
    console.warn(`[RecordingResolver] fetchUrlByTelnyxRecordingId error: ${err.message}`);
    return null;
  }
}

/**
 * Fetch a recording URL by searching Telnyx using the call_control_id.
 * Also attempts to discover and backfill the recording_id.
 */
async function fetchUrlByTelnyxCallId(
  telnyxCallId: string,
): Promise<{ url: string; mimeType: string; discoveredRecordingId?: string } | null> {
  try {
    const { fetchTelnyxRecording } = await import('./telnyx-recordings');
    const freshUrl = await fetchTelnyxRecording(telnyxCallId);
    if (!freshUrl) return null;

    // Attempt to discover the recording ID for backfill
    let discoveredRecordingId: string | undefined;
    const apiKey = process.env.TELNYX_API_KEY;
    if (apiKey) {
      try {
        const resp = await fetch(
          `${TELNYX_API}/recordings?filter[call_control_id]=${telnyxCallId}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        if (resp.ok) {
          const json = await resp.json();
          const recordings = json?.data;
          if (Array.isArray(recordings) && recordings.length > 0) {
            discoveredRecordingId = recordings[0].id;
          }
        }
      } catch {
        // Non-critical — we still have the URL
      }
    }

    const mimeType = freshUrl.includes('.wav') ? 'audio/wav' : 'audio/mpeg';
    return { url: freshUrl, mimeType, discoveredRecordingId };
  } catch (err: any) {
    console.warn(`[RecordingResolver] fetchUrlByTelnyxCallId error: ${err.message}`);
    return null;
  }
}

/**
 * Search Telnyx recordings by phone number and time window, then backfill IDs.
 */
async function searchByPhoneAndTime(
  phoneNumbers: string[],
  timestamp: Date,
  conversationId: string,
): Promise<RecordingLinkResult | null> {
  if (!phoneNumbers.length) return null;

  try {
    const { searchRecordingsByDialedNumber } = await import('./telnyx-recordings');
    const windows = [
      { beforeMinutes: 30, afterMinutes: 30 },
      { beforeMinutes: 120, afterMinutes: 120 },
    ];

    for (const phoneNumber of phoneNumbers) {
      for (const window of windows) {
        const searchStart = new Date(timestamp);
        searchStart.setMinutes(searchStart.getMinutes() - window.beforeMinutes);

        const searchEnd = new Date(timestamp);
        searchEnd.setMinutes(searchEnd.getMinutes() + window.afterMinutes);

        const recordings = await searchRecordingsByDialedNumber(phoneNumber, searchStart, searchEnd);
        const completed = recordings.find((r) => r.status === 'completed');
        const recording = completed || recordings[0];

        if (!recording) continue;

        const downloadUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;
        if (!downloadUrl) continue;

        console.log(
          `[RecordingResolver] Found recording via phone search for ${conversationId}: ${recording.id} (phone=${phoneNumber})`,
        );

        db.update(callSessions)
          .set({
            telnyxCallId: recording.call_control_id,
            telnyxRecordingId: recording.id,
            recordingUrl: downloadUrl,
          } as any)
          .where(eq(callSessions.id, conversationId))
          .then(() =>
            console.log(`[RecordingResolver] Backfilled Telnyx IDs for call_session ${conversationId}`),
          )
          .catch(() => {});

        return {
          url: downloadUrl,
          source: 'telnyx_recording_id',
          expiresInSeconds: 600,
          mimeType: downloadUrl.includes('.wav') ? 'audio/wav' : 'audio/mpeg',
          telnyxRecordingId: recording.id,
        };
      }
    }

    return null;
  } catch (err: any) {
    console.warn(`[RecordingResolver] Phone number search failed for ${conversationId}: ${err.message}`);
    return null;
  }
}

/**
 * Fire-and-forget: backfill telnyxRecordingId on the relevant DB rows.
 */
function backfillRecordingId(
  conversationId: string,
  telnyxRecordingId: string,
  table: 'call_sessions' | 'leads' | 'dialer_call_attempts',
) {
  const target =
    table === 'call_sessions'
      ? callSessions
      : table === 'leads'
        ? leads
        : dialerCallAttempts;

  db.update(target)
    .set({ telnyxRecordingId } as any)
    .where(eq(target.id, conversationId))
    .then(() =>
      console.log(
        `[RecordingResolver] Backfilled telnyxRecordingId=${telnyxRecordingId} on ${table}/${conversationId}`,
      ),
    )
    .catch((err) =>
      console.warn(`[RecordingResolver] Backfill failed for ${table}/${conversationId}:`, err.message),
    );
}

// ─── Main resolver ─────────────────────────────────────────────────────

/**
 * Resolve a playable recording URL for the given conversation ID.
 *
 * Searches call_sessions → leads → dialer_call_attempts → direct Telnyx
 * recording ID lookup (in case the ID itself was passed).
 */
export async function getPlayableRecordingLink(
  conversationId: string,
  options: RecordingLinkOptions = {},
): Promise<RecordingLinkResult | null> {
  // ── 1. call_sessions ──────────────────────────────────────────────
  const [session] = await db
    .select({
      recordingS3Key: callSessions.recordingS3Key,
      telnyxRecordingId: callSessions.telnyxRecordingId,
      telnyxCallId: callSessions.telnyxCallId,
      recordingUrl: callSessions.recordingUrl,
      toNumberE164: callSessions.toNumberE164,
      fromNumber: callSessions.fromNumber,
      startedAt: callSessions.startedAt,
    })
    .from(callSessions)
    .where(eq(callSessions.id, conversationId));

  if (session) {
    // Priority 1: GCS
    if (session.recordingS3Key) {
      try {
        const result = await getCallSessionRecordingUrl(conversationId);
        if (result.url) {
          // Keep gcs-internal:// URLs as-is — server-side stream endpoints
          // (recordings, showcase-calls) handle them directly via readFromGCS().
          // Converting to /api/recordings/... breaks server-side fetch() calls.
          return {
            url: result.url,
            source: 'gcs',
            expiresInSeconds: result.url.startsWith('gcs-internal://') ? 3600 : 604_800,
            mimeType: 'audio/mpeg',
            telnyxRecordingId: session.telnyxRecordingId || undefined,
          };
        }
      } catch {
        /* fall through */
      }
    }

    // Priority 2: Telnyx Recording ID
    if (session.telnyxRecordingId) {
      const result = await fetchUrlByTelnyxRecordingId(session.telnyxRecordingId);
      if (result) {
        return {
          url: result.url,
          source: 'telnyx_recording_id',
          expiresInSeconds: 600,
          mimeType: result.mimeType,
          telnyxRecordingId: session.telnyxRecordingId,
        };
      }
    }

    // Priority 3: Telnyx Call Control ID search
    if (session.telnyxCallId) {
      const result = await fetchUrlByTelnyxCallId(session.telnyxCallId);
      if (result) {
        if (result.discoveredRecordingId) {
          backfillRecordingId(conversationId, result.discoveredRecordingId, 'call_sessions');
        }
        return {
          url: result.url,
          source: 'telnyx_call_id',
          expiresInSeconds: 600,
          mimeType: result.mimeType,
          telnyxRecordingId: result.discoveredRecordingId,
        };
      }
    }

    // Priority 4: Cached URL
    if (session.recordingUrl && !options.skipCached) {
      return {
        url: session.recordingUrl,
        source: 'cached',
        expiresInSeconds: 0, // Unknown / possibly expired
        mimeType: 'audio/mpeg',
      };
    }

    // Priority 5: Search Telnyx by call_session-linked dialer attempts
    const attemptsBySession = await db
      .select({
        id: dialerCallAttempts.id,
        recordingUrl: dialerCallAttempts.recordingUrl,
        telnyxRecordingId: dialerCallAttempts.telnyxRecordingId,
        telnyxCallId: dialerCallAttempts.telnyxCallId,
        phoneDialed: dialerCallAttempts.phoneDialed,
        callStartedAt: dialerCallAttempts.callStartedAt,
      })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.callSessionId, conversationId))
      .orderBy(desc(dialerCallAttempts.createdAt))
      .limit(5);

    for (const attempt of attemptsBySession) {
      if (attempt.telnyxRecordingId) {
        const result = await fetchUrlByTelnyxRecordingId(attempt.telnyxRecordingId);
        if (result) {
          backfillRecordingId(conversationId, attempt.telnyxRecordingId, 'call_sessions');
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
          if (result.discoveredRecordingId) {
            backfillRecordingId(conversationId, result.discoveredRecordingId, 'call_sessions');
            backfillRecordingId(attempt.id, result.discoveredRecordingId, 'dialer_call_attempts');
          }
          return {
            url: result.url,
            source: 'telnyx_call_id',
            expiresInSeconds: 600,
            mimeType: result.mimeType,
            telnyxRecordingId: result.discoveredRecordingId,
          };
        }
      }

      if (attempt.recordingUrl && !options.skipCached) {
        return {
          url: attempt.recordingUrl,
          source: 'cached',
          expiresInSeconds: 0,
          mimeType: 'audio/mpeg',
        };
      }

      if (attempt.callStartedAt || session.startedAt) {
        const phoneCandidates = normalizePhoneCandidates(
          attempt.phoneDialed,
          session.toNumberE164,
          session.fromNumber,
        );

        const result = await searchByPhoneAndTime(
          phoneCandidates,
          attempt.callStartedAt || session.startedAt!,
          conversationId,
        );
        if (result) {
          return result;
        }
      }
    }

    // Priority 6: Search Telnyx by dialed phone number + time range
    if (session.startedAt) {
      const phoneCandidates = normalizePhoneCandidates(session.toNumberE164, session.fromNumber);
      const result = await searchByPhoneAndTime(phoneCandidates, session.startedAt, conversationId);
      if (result) {
        return result;
      }
    }
  }

  // ── 2. leads ──────────────────────────────────────────────────────
  const [lead] = await db
    .select({
      recordingS3Key: leads.recordingS3Key,
      telnyxRecordingId: leads.telnyxRecordingId,
      telnyxCallId: leads.telnyxCallId,
      recordingUrl: leads.recordingUrl,
    })
    .from(leads)
    .where(eq(leads.id, conversationId));

  if (lead) {
    if (lead.recordingS3Key) {
      try {
        const result = await getRecordingUrl(conversationId);
        if (result.url) {
          return {
            url: result.url,
            source: 'gcs',
            expiresInSeconds: result.url.startsWith('gcs-internal://') ? 3600 : 604_800,
            mimeType: 'audio/mpeg',
            telnyxRecordingId: lead.telnyxRecordingId || undefined,
          };
        }
      } catch {
        /* fall through */
      }
    }

    if (lead.telnyxRecordingId) {
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
      const result = await fetchUrlByTelnyxCallId(lead.telnyxCallId);
      if (result) {
        if (result.discoveredRecordingId) {
          backfillRecordingId(conversationId, result.discoveredRecordingId, 'leads');
        }
        return {
          url: result.url,
          source: 'telnyx_call_id',
          expiresInSeconds: 600,
          mimeType: result.mimeType,
          telnyxRecordingId: result.discoveredRecordingId,
        };
      }
    }

    if (lead.recordingUrl && !options.skipCached) {
      return {
        url: lead.recordingUrl,
        source: 'cached',
        expiresInSeconds: 0,
        mimeType: 'audio/mpeg',
      };
    }
  }

  // ── 3. dialer_call_attempts ───────────────────────────────────────
  const [attempt] = await db
    .select({
      recordingUrl: dialerCallAttempts.recordingUrl,
      telnyxRecordingId: dialerCallAttempts.telnyxRecordingId,
      telnyxCallId: dialerCallAttempts.telnyxCallId,
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
        if (result.discoveredRecordingId) {
          backfillRecordingId(conversationId, result.discoveredRecordingId, 'dialer_call_attempts');
        }
        return {
          url: result.url,
          source: 'telnyx_call_id',
          expiresInSeconds: 600,
          mimeType: result.mimeType,
          telnyxRecordingId: result.discoveredRecordingId,
        };
      }
    }

    if (attempt.recordingUrl && !options.skipCached) {
      return {
        url: attempt.recordingUrl,
        source: 'cached',
        expiresInSeconds: 0,
        mimeType: 'audio/mpeg',
      };
    }
  }

  // ── 4. Try conversationId as a direct Telnyx recording ID ─────────
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

  return null;
}

/**
 * Simplified wrapper — returns just the URL string (for transcription etc.)
 */
export async function getFreshAudioUrl(
  conversationId: string,
): Promise<string | null> {
  const result = await getPlayableRecordingLink(conversationId);
  return result?.url ?? null;
}
