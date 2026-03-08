/**
 * Telnyx Sync Service
 * 
 * Provides functionality to:
 * - Fetch all recordings from Telnyx API (with pagination)
 * - Sync recordings to local database (call_sessions table)
 * - Support for historical recordings and ongoing sync
 */

import { db } from '../db';
import { callSessions, campaigns, contacts, dialerCallAttempts } from '@shared/schema';
import { eq, sql, and, or, isNull, desc, gte, lte } from 'drizzle-orm';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';
const TELNYX_TIMEOUT_MS = 60000;
const TELNYX_MAX_RETRIES = 3;
const TELNYX_RETRY_DELAY_MS = 2000;

// ==================== TYPES ====================

export interface TelnyxRecordingData {
  id: string;
  call_control_id: string;
  call_leg_id: string;
  call_session_id: string;
  channels: string;
  created_at: string;
  download_urls: {
    mp3?: string;
    wav?: string;
  };
  duration_millis: number;
  recording_started_at: string;
  recording_ended_at: string;
  status: 'completed' | 'processing' | 'partial';
  from?: string;
  to?: string;
}

export interface TelnyxCallData {
  id: string;
  call_control_id: string;
  call_session_id: string;
  call_leg_id: string;
  from: string;
  to: string;
  state: string;
  start_time: string;
  end_time?: string;
  is_alive: boolean;
  record_type: string;
}

export interface SyncResult {
  success: boolean;
  totalFetched: number;
  newRecordings: number;
  updatedRecordings: number;
  errors: number;
  recordings: TelnyxRecordingData[];
}

export interface ListRecordingsOptions {
  startDate?: Date;
  endDate?: Date;
  phoneNumber?: string;
  callControlId?: string;
  pageSize?: number;
  maxPages?: number;
}

// ==================== HELPERS ====================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resolve contactId and campaignId from a phone number.
 * Strategy:
 * 1. Try matching against dialerCallAttempts.phoneDialed (most reliable — has both contactId and campaignId)
 * 2. Fallback: match against contacts.directPhoneE164 or contacts.mobilePhoneE164
 */
async function resolveContactAndCampaignByPhone(
  phoneNumber: string,
  callTime?: Date
): Promise<{ contactId: string | null; campaignId: string | null; accountId: string | null }> {
  if (!phoneNumber || phoneNumber === 'unknown') {
    return { contactId: null, campaignId: null, accountId: null };
  }

  try {
    // Strategy 1: Match against dialerCallAttempts (has both contactId and campaignId)
    // Look for the most recent attempt to this phone number
    const conditions: any[] = [eq(dialerCallAttempts.phoneDialed, phoneNumber)];
    if (callTime) {
      // Look within a reasonable window (24 hours before the recording)
      const windowStart = new Date(callTime.getTime() - 24 * 60 * 60 * 1000);
      conditions.push(gte(dialerCallAttempts.createdAt, windowStart));
    }

    const [attempt] = await db
      .select({
        contactId: dialerCallAttempts.contactId,
        campaignId: dialerCallAttempts.campaignId,
      })
      .from(dialerCallAttempts)
      .where(and(...conditions))
      .orderBy(desc(dialerCallAttempts.createdAt))
      .limit(1);

    if (attempt) {
      // Get accountId from contact
      const [contact] = await db
        .select({ accountId: contacts.accountId })
        .from(contacts)
        .where(eq(contacts.id, attempt.contactId))
        .limit(1);

      return {
        contactId: attempt.contactId,
        campaignId: attempt.campaignId,
        accountId: contact?.accountId || null,
      };
    }

    // Strategy 2: Match against contacts phone fields
    const [contact] = await db
      .select({
        id: contacts.id,
        accountId: contacts.accountId,
      })
      .from(contacts)
      .where(
        or(
          eq(contacts.directPhoneE164, phoneNumber),
          eq(contacts.mobilePhoneE164, phoneNumber)
        )
      )
      .limit(1);

    if (contact) {
      // Try to find a campaign this contact was in
      const [recentAttempt] = await db
        .select({ campaignId: dialerCallAttempts.campaignId })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.contactId, contact.id))
        .orderBy(desc(dialerCallAttempts.createdAt))
        .limit(1);

      return {
        contactId: contact.id,
        campaignId: recentAttempt?.campaignId || null,
        accountId: contact.accountId || null,
      };
    }

    return { contactId: null, campaignId: null, accountId: null };
  } catch (error) {
    console.error('[TelnyxSync] Error resolving contact/campaign by phone:', error);
    return { contactId: null, campaignId: null, accountId: null };
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = TELNYX_MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TELNYX_TIMEOUT_MS);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      lastError = error;
      
      if (error.name === 'AbortError' && !error.message?.includes('timeout')) {
        throw error;
      }
      
      if (attempt === retries) {
        break;
      }
      
      const delay = TELNYX_RETRY_DELAY_MS * Math.pow(2, attempt);
      console.log(`[TelnyxSync] Connection failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw new Error(`Telnyx API connection failed after ${retries + 1} attempts: ${lastError?.message}`);
}

// ==================== MAIN SERVICE FUNCTIONS ====================

/**
 * Fetch all recordings from Telnyx API with pagination
 */
export async function fetchTelnyxRecordings(options: ListRecordingsOptions = {}): Promise<TelnyxRecordingData[]> {
  if (!TELNYX_API_KEY) {
    throw new Error('TELNYX_API_KEY not configured');
  }

  const {
    startDate,
    endDate,
    phoneNumber,
    callControlId,
    pageSize = 100,
    maxPages = 50, // Limit to prevent excessive API calls
  } = options;

  const allRecordings: TelnyxRecordingData[] = [];
  let pageNumber = 1;
  let hasMore = true;

  console.log('[TelnyxSync] Starting to fetch recordings from Telnyx...');
  console.log(`[TelnyxSync] Filters: startDate=${startDate?.toISOString()}, endDate=${endDate?.toISOString()}, phone=${phoneNumber || 'any'}`);

  while (hasMore && pageNumber <= maxPages) {
    try {
      const params = new URLSearchParams();
      params.append('page[size]', pageSize.toString());
      params.append('page[number]', pageNumber.toString());

      if (startDate) {
        params.append('filter[created_at][gte]', startDate.toISOString());
      }
      if (endDate) {
        params.append('filter[created_at][lte]', endDate.toISOString());
      }
      if (phoneNumber) {
        // Try both to and from filters
        params.append('filter[to]', phoneNumber);
      }
      if (callControlId) {
        params.append('filter[call_control_id]', callControlId);
      }

      const response = await fetchWithRetry(
        `${TELNYX_API_BASE}/recordings?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${TELNYX_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Telnyx API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const recordings: TelnyxRecordingData[] = data.data || [];

      allRecordings.push(...recordings);
      console.log(`[TelnyxSync] Fetched page ${pageNumber}: ${recordings.length} recordings (total: ${allRecordings.length})`);

      // Check if there are more pages
      const meta = data.meta;
      if (meta?.page_number && meta?.total_pages) {
        hasMore = meta.page_number < meta.total_pages;
      } else {
        hasMore = recordings.length === pageSize;
      }

      pageNumber++;
    } catch (error) {
      console.error(`[TelnyxSync] Error fetching page ${pageNumber}:`, error);
      throw error;
    }
  }

  console.log(`[TelnyxSync] Completed: fetched ${allRecordings.length} recordings from Telnyx`);
  return allRecordings;
}

/**
 * Get call details from Telnyx for a specific recording
 */
export async function fetchTelnyxCallDetails(callControlId: string): Promise<TelnyxCallData | null> {
  if (!TELNYX_API_KEY) {
    throw new Error('TELNYX_API_KEY not configured');
  }

  try {
    const response = await fetchWithRetry(
      `${TELNYX_API_BASE}/calls/${callControlId}`,
      {
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 404 || response.status === 422) {
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telnyx API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('[TelnyxSync] Error fetching call details:', error);
    return null;
  }
}

/**
 * Sync Telnyx recordings to local database (call_sessions table)
 * Creates new call_sessions entries for recordings not yet in the system
 */
export async function syncTelnyxRecordingsToDatabase(options: ListRecordingsOptions = {}): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    totalFetched: 0,
    newRecordings: 0,
    updatedRecordings: 0,
    errors: 0,
    recordings: [],
  };

  try {
    // Fetch recordings from Telnyx
    const recordings = await fetchTelnyxRecordings(options);
    result.totalFetched = recordings.length;
    result.recordings = recordings;

    console.log(`[TelnyxSync] Processing ${recordings.length} recordings for database sync...`);

    // Track Telnyx recording IDs processed in this batch to skip duplicates within the same sync
    const processedRecordingIds = new Set<string>();

    for (const recording of recordings) {
      try {
        // Skip if we already processed this exact Telnyx recording ID in this batch
        if (processedRecordingIds.has(recording.id)) {
          continue;
        }
        processedRecordingIds.add(recording.id);

        const downloadUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;
        const durationSec = Math.floor(recording.duration_millis / 1000);
        const recordingStartedAt = new Date(recording.recording_started_at);
        const recordingEndedAt = recording.recording_ended_at ? new Date(recording.recording_ended_at) : null;

        // === DEDUP STRATEGY ===
        // Strategy 1: Match by telnyxCallId (call_control_id) — only when it's not null/empty
        let existingSession: { id: string; recordingUrl: string | null }[] = [];

        if (recording.call_control_id) {
          existingSession = await db
            .select({ id: callSessions.id, recordingUrl: callSessions.recordingUrl })
            .from(callSessions)
            .where(eq(callSessions.telnyxCallId, recording.call_control_id))
            .limit(1);
        }

        // Strategy 2: Fallback — match by phone number + time window (±60 seconds)
        // This catches recordings where call_control_id is null (common with Telnyx)
        if (existingSession.length === 0) {
          const fromNumber = recording.from || '';
          const toNumber = recording.to || '';

          if (toNumber && recordingStartedAt) {
            const windowStart = new Date(recordingStartedAt.getTime() - 60_000);
            const windowEnd = new Date(recordingStartedAt.getTime() + 60_000);

            existingSession = await db
              .select({ id: callSessions.id, recordingUrl: callSessions.recordingUrl })
              .from(callSessions)
              .where(
                and(
                  eq(callSessions.toNumberE164, toNumber),
                  ...(fromNumber ? [eq(callSessions.fromNumber, fromNumber)] : []),
                  gte(callSessions.startedAt, windowStart),
                  lte(callSessions.startedAt, windowEnd)
                )
              )
              .limit(1);
          }
        }

        // Strategy 3: Match via dialer_call_attempts.telnyx_call_id → find linked call_session
        // SIP calls create sessions with telnyx_call_id=null, but the attempt stores the Telnyx call ID.
        // This bridges the gap between Telnyx recordings and SIP-originated sessions.
        if (existingSession.length === 0 && recording.call_control_id) {
          const attemptMatch = await db
            .select({
              callSessionId: dialerCallAttempts.callSessionId,
            })
            .from(dialerCallAttempts)
            .where(eq(dialerCallAttempts.telnyxCallId, recording.call_control_id))
            .limit(1);

          if (attemptMatch.length > 0 && attemptMatch[0].callSessionId) {
            existingSession = await db
              .select({ id: callSessions.id, recordingUrl: callSessions.recordingUrl })
              .from(callSessions)
              .where(eq(callSessions.id, attemptMatch[0].callSessionId))
              .limit(1);

            if (existingSession.length > 0) {
              console.log(`[TelnyxSync] Strategy 3: Matched recording to session ${existingSession[0].id} via attempt.telnyx_call_id`);
            }
          }
        }

        if (existingSession.length > 0) {
          // Update existing session if it doesn't have recording URL
          if (!existingSession[0].recordingUrl && downloadUrl) {
            await db
              .update(callSessions)
              .set({
                recordingUrl: downloadUrl,
                recordingDurationSec: durationSec,
                recordingStatus: recording.status === 'completed' ? 'stored' : 'pending',
                recordingFormat: downloadUrl?.includes('.wav') ? 'wav' : 'mp3',
                // Also backfill telnyxCallId if it was null and we now have one
                ...(recording.call_control_id ? { telnyxCallId: recording.call_control_id } : {}),
              })
              .where(eq(callSessions.id, existingSession[0].id));
            
            result.updatedRecordings++;
            console.log(`[TelnyxSync] Updated recording for session: ${existingSession[0].id}`);
          }
          // Skip — session already exists (with or without recording)
        } else {
          // Create new call_session entry for this recording
          // Try to get call details for from/to numbers
          let fromNumber = recording.from || '';
          let toNumber = recording.to || '';

          if (!fromNumber || !toNumber) {
            const callDetails = await fetchTelnyxCallDetails(recording.call_control_id);
            if (callDetails) {
              fromNumber = fromNumber || callDetails.from;
              toNumber = toNumber || callDetails.to;
            }
          }

          // Resolve contact and campaign from phone number
          const resolved = await resolveContactAndCampaignByPhone(toNumber, recordingStartedAt);
          if (resolved.contactId) {
            console.log(`[TelnyxSync] Resolved contact ${resolved.contactId} and campaign ${resolved.campaignId || 'none'} for phone ${toNumber}`);
          }

          await db.insert(callSessions).values({
            telnyxCallId: recording.call_control_id || null,
            fromNumber: fromNumber,
            toNumberE164: toNumber || 'unknown',
            startedAt: recordingStartedAt,
            endedAt: recordingEndedAt,
            durationSec: durationSec,
            recordingUrl: downloadUrl,
            recordingDurationSec: durationSec,
            recordingStatus: recording.status === 'completed' ? 'stored' : 'pending',
            recordingFormat: downloadUrl?.includes('.wav') ? 'wav' : 'mp3',
            status: 'completed',
            agentType: 'ai',
            contactId: resolved.contactId,
            campaignId: resolved.campaignId,
          });

          result.newRecordings++;
          console.log(`[TelnyxSync] Created new session for recording: ${recording.id}`);
        }
      } catch (error) {
        console.error(`[TelnyxSync] Error processing recording ${recording.id}:`, error);
        result.errors++;
      }
    }

    result.success = true;
    console.log(`[TelnyxSync] Sync complete: ${result.newRecordings} new, ${result.updatedRecordings} updated, ${result.errors} errors`);
  } catch (error) {
    console.error('[TelnyxSync] Sync failed:', error);
    throw error;
  }

  return result;
}

/**
 * Get recordings directly from Telnyx (without saving to database)
 * Useful for viewing all Telnyx recordings in the dashboard
 */
export async function getTelnyxRecordingsForDashboard(options: {
  startDate?: Date;
  endDate?: Date;
  phoneNumber?: string;
  callId?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{
  recordings: any[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}> {
  const {
    // Default: last 1 hour - Telnyx presigned URLs expire after 10 minutes
    // so older recordings won't have valid download URLs anyway
    startDate = new Date(Date.now() - 60 * 60 * 1000), // Default: last 1 hour
    endDate = new Date(),
    phoneNumber,
    callId,
    page = 1,
    limit = 20,
  } = options;

  // Fetch recordings from Telnyx
  const telnyxRecordings = await fetchTelnyxRecordings({
    startDate,
    endDate,
    phoneNumber,
    callControlId: callId,
    pageSize: 100, // Fetch more to support client-side pagination
    maxPages: 10,
  });

  // Filter by phone number if specified (Telnyx API might not filter perfectly)
  let filteredRecordings = telnyxRecordings;
  if (phoneNumber) {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    filteredRecordings = telnyxRecordings.filter(r => {
      const from = (r.from || '').replace(/\D/g, '');
      const to = (r.to || '').replace(/\D/g, '');
      return from.includes(normalizedPhone) || to.includes(normalizedPhone);
    });
  }

  // Apply pagination
  const total = filteredRecordings.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const paginatedRecordings = filteredRecordings.slice(offset, offset + limit);

  // Transform to dashboard format
  const recordings = paginatedRecordings.map(r => ({
    id: r.id,
    telnyxCallId: r.call_control_id,
    fromNumber: r.from || null,
    toNumber: r.to || null,
    startedAt: r.recording_started_at,
    endedAt: r.recording_ended_at,
    durationSec: Math.floor(r.duration_millis / 1000),
    recordingUrl: r.download_urls?.mp3 || r.download_urls?.wav,
    recordingStatus: r.status === 'completed' ? 'stored' : 'pending',
    recordingFormat: r.download_urls?.mp3 ? 'mp3' : 'wav',
    source: 'telnyx',
    createdAt: r.created_at,
    hasRecording: !!(r.download_urls?.mp3 || r.download_urls?.wav),
  }));

  return {
    recordings,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

/**
 * Transcribe a recording from Telnyx
 */
export async function transcribeTelnyxRecording(recordingId: string): Promise<{
  success: boolean;
  transcript?: string;
  error?: string;
}> {
  if (!TELNYX_API_KEY) {
    return { success: false, error: 'TELNYX_API_KEY not configured' };
  }

  try {
    // First, get the recording details to get the download URL
    const response = await fetchWithRetry(
      `${TELNYX_API_BASE}/recordings/${recordingId}`,
      {
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Failed to get recording: ${errorText}` };
    }

    const data = await response.json();
    const recording = data.data;
    const downloadUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;

    if (!downloadUrl) {
      return { success: false, error: 'No download URL available for recording' };
    }

    // Use Google Speech-to-Text for transcription (returns transcript directly)
    const { submitTranscription } = await import('./google-transcription');
    
    const transcriptText = await submitTranscription(downloadUrl);
    
    if (!transcriptText) {
      return { success: false, error: 'Transcription returned empty result' };
    }

    return { success: true, transcript: transcriptText };
  } catch (error: any) {
    console.error('[TelnyxSync] Transcription error:', error);
    return { success: false, error: error.message };
  }
}

export default {
  fetchTelnyxRecordings,
  fetchTelnyxCallDetails,
  syncTelnyxRecordingsToDatabase,
  getTelnyxRecordingsForDashboard,
  transcribeTelnyxRecording,
};
