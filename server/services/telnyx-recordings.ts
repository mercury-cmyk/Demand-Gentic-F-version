import { eq, isNull, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { leads, calls, callAttempts, dialerCallAttempts, contacts } from '../../shared/schema';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';
const TELNYX_TIMEOUT_MS = 60000; // 60 second timeout for API calls (increased for slow connections)
const TELNYX_MAX_RETRIES = 5;
const TELNYX_RETRY_DELAY_MS = 2000; // Start with 2 seconds

interface TelnyxRecording {
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
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for fetch calls with exponential backoff
 */
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
      
      // If 422, it might be an invalid ID format, don't retry same URL
      if (response.status === 422) {
         // Don't throw loop, just return response so caller can handle
         return response; 
      }

      return response;
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on abort errors (user cancelled)
      if (error.name === 'AbortError' && !error.message?.includes('timeout')) {
        throw error;
      }
      
      // If this was the last attempt, throw
      if (attempt === retries) {
        break;
      }
      
      // Log retry attempt
      const delay = TELNYX_RETRY_DELAY_MS * Math.pow(2, attempt);
      console.log(`[Telnyx] Connection failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  // If we get here, all retries failed
  throw new Error(`Telnyx API connection failed after ${retries + 1} attempts: ${lastError?.message}`);
}

/**
 * Fetch call recording details from Telnyx API
 * Returns null only for 404 (not found), throws for API/network errors
 */
export async function fetchTelnyxRecording(callControlId: string): Promise<string | null> {
  if (!TELNYX_API_KEY) {
    throw new Error('Telnyx API key not configured');
  }

  try {
    // Attempt 1: call_control_id
    let recordingsResponse = await fetchWithRetry(
      `${TELNYX_API_BASE}/recordings?filter[call_control_id]=${encodeURIComponent(callControlId)}`,
      { headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    
    // Attempt 2: call_leg_id
    if (!recordingsResponse.ok || (await isResponseEmpty(recordingsResponse))) {
        console.log(`[Telnyx] No recordings found with call_control_id, trying call_leg_id: ${callControlId}`);
        recordingsResponse = await fetchWithRetry(
            `${TELNYX_API_BASE}/recordings?filter[call_leg_id]=${encodeURIComponent(callControlId)}`,
            { headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}`, 'Content-Type': 'application/json' } }
        );
    }

    // Attempt 3: call_session_id (only valid for UUID-like session IDs)
    if (!recordingsResponse.ok || (await isResponseEmpty(recordingsResponse))) {
      if (!looksLikeUuid(callControlId)) {
        console.log(`[Telnyx] Skipping call_session_id lookup (non-UUID identifier): ${callControlId}`);
        return null;
      }

      console.log(`[Telnyx] No recordings found with call_leg_id, trying call_session_id: ${callControlId}`);
      recordingsResponse = await fetchWithRetry(
        `${TELNYX_API_BASE}/recordings?filter[call_session_id]=${encodeURIComponent(callControlId)}`,
        { headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}`, 'Content-Type': 'application/json' } }
      );
    }

    if (recordingsResponse.status === 404) {
      console.log('[Telnyx] Recordings not found (404) for call:', callControlId);
      return null;
    }

    if (!recordingsResponse.ok) {
      const errorText = await recordingsResponse.text();
      // Only throw if it's a real error, not just a "not found" disguised as 422
      console.warn(`[Telnyx] API returned error (${recordingsResponse.status}): ${errorText}`);
      return null;
    }

    const recordingsData = await recordingsResponse.json();
    
    // Get the first recording and extract download URL directly from response
    if (recordingsData.data && recordingsData.data.length > 0) {
      const recording = recordingsData.data[0] as TelnyxRecording;
      
      // Use download URL directly from recording object (mp3 preferred, fallback to wav)
      const downloadUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;
      
      if (downloadUrl) {
        console.log('[Telnyx] Download URL retrieved from recording object');
        return downloadUrl;
      }
    }

    console.log('[Telnyx] No recordings found for call:', callControlId);
    return null;
  } catch (error: any) {
    // Handle timeout errors with helpful message
    if (error.name === 'AbortError') {
      throw new Error(`Telnyx API timeout after ${TELNYX_TIMEOUT_MS / 1000}s. Please check your network connection or try again later.`);
    }
    // Re-throw other errors
    throw error;
  }
}

// Helper to check if response data is empty without consuming body if not needed (using clone)
async function isResponseEmpty(response: Response): Promise<boolean> {
    try {
        const data = await response.clone().json();
        return !data.data || data.data.length === 0;
    } catch {
        return false;
    }
}


/**
 * Update lead with Telnyx recording URL
 */
export async function updateLeadRecording(leadId: string, telnyxCallId: string): Promise<void> {
  try {
    console.log('[Telnyx] Fetching recording for lead:', leadId, 'call:', telnyxCallId);
    
    const recordingUrl = await fetchTelnyxRecording(telnyxCallId);
    
    if (recordingUrl) {
      await db
        .update(leads)
        .set({ recordingUrl })
        .where(eq(leads.id, leadId));
      
      console.log('[Telnyx] ✅ Updated lead with recording URL:', leadId);
    }
  } catch (error) {
    console.error('[Telnyx] Failed to update lead recording:', error);
  }
}

/**
 * Update manual call with Telnyx recording URL
 */
export async function updateCallRecording(callId: string, telnyxCallId: string): Promise<void> {
  try {
    console.log('[Telnyx] Fetching recording for call:', callId, 'telnyx:', telnyxCallId);
    
    const recordingUrl = await fetchTelnyxRecording(telnyxCallId);
    
    if (recordingUrl) {
      await db
        .update(calls)
        .set({ recordingUrl })
        .where(eq(calls.id, callId));
      
      console.log('[Telnyx] ✅ Updated call with recording URL:', callId);
    }
  } catch (error) {
    console.error('[Telnyx] Failed to update call recording:', error);
  }
}

/**
 * Search for recordings by dialed number and time range
 * This is useful when we don't have the call_control_id
 * Returns empty array only for 404/no results, throws for API/network errors
 */
export async function searchRecordingsByDialedNumber(
  dialedNumber: string,
  startTime: Date,
  endTime?: Date
): Promise<TelnyxRecording[]> {
  if (!TELNYX_API_KEY) {
    throw new Error('Telnyx API key not configured');
  }

  // Build query parameters
  const params = new URLSearchParams();
  params.append('filter[to]', dialedNumber);
  params.append('filter[created_at][gte]', startTime.toISOString());
  if (endTime) {
    params.append('filter[created_at][lte]', endTime.toISOString());
  }
  params.append('page[size]', '50'); // Get up to 50 recordings

  const response = await fetchWithRetry(
    `${TELNYX_API_BASE}/recordings?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  // 404 or empty results are expected - no recordings found
  if (response.status === 404) {
    console.log('[Telnyx] No recordings found (404) for:', dialedNumber);
    return [];
  }

  // Any other non-OK status is an error
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telnyx API error searching recordings (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.data || [];
}


/**
 * Sync recordings for leads missing recording URLs
 * Searches by dialed number and timestamps
 */
export async function syncMissingLeadRecordings(limit: number = 50): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  const stats = { processed: 0, updated: 0, errors: 0 };

  try {
    // Find leads with call attempts but no recording URL
    // Created within last 24 hours to keep the search window reasonable
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const leadsWithoutRecordings = await db
      .select({
        lead: leads,
        attempt: callAttempts,
        contact: contacts,
      })
      .from(leads)
      .innerJoin(callAttempts, eq(leads.callAttemptId, callAttempts.id))
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .where(
        and(
          isNull(leads.recordingUrl),
          gte(leads.createdAt, oneDayAgo)
        )
      )
      .limit(limit);

    console.log(`[Telnyx-Sync] Found ${leadsWithoutRecordings.length} leads without recordings`);

    for (const row of leadsWithoutRecordings) {
      stats.processed++;
      
      try {
        const { lead, attempt, contact } = row;

        // Strategy 1: Use telnyxCallId if available
        if (attempt.telnyxCallId) {
          console.log(`[Telnyx-Sync] Fetching by call_control_id for lead ${lead.id}`);
          const recordingUrl = await fetchTelnyxRecording(attempt.telnyxCallId);
          
          if (recordingUrl) {
            await updateLeadWithRecording(lead.id, recordingUrl, attempt.duration || 0);
            stats.updated++;
            continue;
          }
        }

        // Strategy 2: Search by dialed number + time range
        const dialedPhone = contact.directPhone || contact.mobilePhone;
        if (dialedPhone && lead.createdAt) {
          console.log(`[Telnyx-Sync] Searching by dialed number for lead ${lead.id}: ${dialedPhone}`);
          
          // Search in a 1-hour window around the lead creation time
          const searchStart = new Date(lead.createdAt);
          searchStart.setMinutes(searchStart.getMinutes() - 30);
          const searchEnd = new Date(lead.createdAt);
          searchEnd.setMinutes(searchEnd.getMinutes() + 30);

          const recordings = await searchRecordingsByDialedNumber(
            dialedPhone,
            searchStart,
            searchEnd
          );

          if (recordings.length > 0) {
            // Use the first completed recording
            const completed = recordings.find(r => r.status === 'completed');
            const recording = completed || recordings[0];
            
            // Use download URL directly from recording object (mp3 preferred, fallback to wav)
            const downloadUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;
            if (downloadUrl) {
              const durationSec = Math.floor(recording.duration_millis / 1000);
              await updateLeadWithRecording(lead.id, downloadUrl, durationSec);
              
              // Also update the call attempt with telnyx metadata
              await db.update(callAttempts)
                .set({
                  telnyxCallId: recording.call_control_id,
                  recordingUrl: downloadUrl,
                })
                .where(eq(callAttempts.id, attempt.id));
              
              stats.updated++;
              console.log(`[Telnyx-Sync] ✅ Updated lead ${lead.id} with recording`);
            }
          }
        }
      } catch (error) {
        console.error(`[Telnyx-Sync] Error processing lead:`, error);
        stats.errors++;
      }
    }

    console.log(`[Telnyx-Sync] Complete. Processed: ${stats.processed}, Updated: ${stats.updated}, Errors: ${stats.errors}`);
    return stats;
  } catch (error) {
    console.error('[Telnyx-Sync] Failed to sync recordings:', error);
    return stats;
  }
}

/**
 * Update lead with recording URL and trigger transcription
 */
async function updateLeadWithRecording(
  leadId: string,
  recordingUrl: string,
  durationSec: number,
  telnyxCallId?: string | null
): Promise<void> {
  await db.update(leads)
    .set({
      recordingUrl,
      callDuration: durationSec,
      transcriptionStatus: 'pending',
      recordingStatus: 'completed',
    })
    .where(eq(leads.id, leadId));

  // Best-effort: persist the fetched recording in GCS/S3 for durable URL delivery
  try {
    const { isRecordingStorageEnabled, downloadAndStoreRecording } = await import('./recording-storage');
    if (isRecordingStorageEnabled()) {
      const recordingS3Key = await downloadAndStoreRecording(recordingUrl, leadId, telnyxCallId || null);
      if (recordingS3Key) {
        await db.update(leads)
          .set({ recordingS3Key, recordingStatus: 'completed' })
          .where(eq(leads.id, leadId));
      }
    }
  } catch (error) {
    console.warn(`[Telnyx-Sync] Recording persisted URL update skipped for lead ${leadId}:`, error);
  }

  // Trigger transcription asynchronously (don't wait)
  import('./google-transcription')
    .then(({ transcribeLeadCall }) => transcribeLeadCall(leadId))
    .catch(err => {
      console.error(`[Telnyx-Sync] Failed to start transcription for lead ${leadId}:`, err);
    });
}

/**
 * Sync recordings for a specific lead by ID
 * Throws errors for database/persistence failures (so API can return 500)
 * Returns false only when no recording is found (expected case)
 */
export async function syncRecordingForLead(leadId: string): Promise<boolean> {
  const [lead] = await db
    .select({
      lead: leads,
      contact: contacts,
    })
    .from(leads)
    .leftJoin(contacts, eq(leads.contactId, contacts.id))
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  // Resolve call attempt from either legacy call_attempts or dialer_call_attempts
  let legacyAttempt: any = null;
  let dialerAttempt: any = null;
  if (lead.lead.callAttemptId) {
    [legacyAttempt] = await db
      .select()
      .from(callAttempts)
      .where(eq(callAttempts.id, lead.lead.callAttemptId))
      .limit(1);

    [dialerAttempt] = await db
      .select()
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, lead.lead.callAttemptId))
      .limit(1);
  }

  const resolvedAttempt = legacyAttempt || dialerAttempt;
  const resolvedAttemptTelnyxCallId: string | null = resolvedAttempt?.telnyxCallId || null;
  const resolvedAttemptDuration: number = Number(resolvedAttempt?.duration || 0);

  // Early exit: Skip leads without evidence that an actual call was made
  // Contact phones alone don't count - they just mean we *could* call, not that we *did*
  const hasCallEvidence = !!(
    resolvedAttemptTelnyxCallId || // Call attempt has Telnyx call ID
    lead.lead.telnyxCallId ||      // Lead has direct Telnyx call ID
    lead.lead.dialedNumber         // Lead has a dialed number recorded
  );

  if (!hasCallEvidence) {
    console.log(`[Telnyx-Sync] Skipping lead ${leadId} - no call evidence (no telnyxCallId or dialedNumber). Lead may have been manually submitted.`);
    return false;
  }

  // Strategy 1: Use telnyxCallId from call_attempts (legacy auto-dialer)
  if (resolvedAttemptTelnyxCallId) {
    console.log(`[Telnyx-Sync] Trying Strategy 1a: Fetch by call_control_id (from attempt) for lead ${leadId}`);
    const recordingUrl = await fetchTelnyxRecording(resolvedAttemptTelnyxCallId);
    if (recordingUrl) {
      // These can throw - let them propagate as they're real errors
      await updateLeadWithRecording(leadId, recordingUrl, resolvedAttemptDuration, resolvedAttemptTelnyxCallId);
      
      // Also update call attempt with recording URL if not already set
      if (resolvedAttempt && !resolvedAttempt.recordingUrl) {
        if (legacyAttempt) {
          await db.update(callAttempts)
            .set({ recordingUrl })
            .where(eq(callAttempts.id, legacyAttempt.id));
        }
        if (dialerAttempt) {
          await db.update(dialerCallAttempts)
            .set({ recordingUrl, updatedAt: new Date() })
            .where(eq(dialerCallAttempts.id, dialerAttempt.id));
        }
      }
      
      console.log(`[Telnyx-Sync] ✅ Strategy 1a success: Updated lead ${leadId} with recording`);
      return true;
    }
    console.log(`[Telnyx-Sync] Strategy 1a failed: No recording found by call_control_id`);
  }

  // Strategy 1b: Use telnyxCallId from leads table (manual queue / agent console)
  if (lead.lead.telnyxCallId) {
    console.log(`[Telnyx-Sync] Trying Strategy 1b: Fetch by call_control_id (from lead) for lead ${leadId}`);
    const recordingUrl = await fetchTelnyxRecording(lead.lead.telnyxCallId);
    if (recordingUrl) {
      // These can throw - let them propagate as they're real errors
      await updateLeadWithRecording(leadId, recordingUrl, lead.lead.callDuration || 0, lead.lead.telnyxCallId);
      
      console.log(`[Telnyx-Sync] ✅ Strategy 1b success: Updated lead ${leadId} with recording`);
      return true;
    }
    console.log(`[Telnyx-Sync] Strategy 1b failed: No recording found by call_control_id`);
  }

  // Strategy 2: Search by dialed number (use lead's dialedNumber first, fallback to contact phones)
  const dialedPhone = lead.lead.dialedNumber || lead.contact?.directPhone || lead.contact?.mobilePhone;
  if (dialedPhone && lead.lead.createdAt) {
    console.log(`[Telnyx-Sync] Trying Strategy 2: Search by dialed number for lead ${leadId}: ${dialedPhone}`);
    
    const searchStart = new Date(lead.lead.createdAt);
    searchStart.setMinutes(searchStart.getMinutes() - 30);
    const searchEnd = new Date(lead.lead.createdAt);
    searchEnd.setMinutes(searchEnd.getMinutes() + 30);

    const recordings = await searchRecordingsByDialedNumber(dialedPhone, searchStart, searchEnd);
    
    if (recordings.length > 0) {
      console.log(`[Telnyx-Sync] Found ${recordings.length} recordings for ${dialedPhone}`);
      
      // Filter to only completed recordings
      const completedRecordings = recordings.filter(r => r.status === 'completed');
      
      if (completedRecordings.length === 0) {
        const statuses = recordings.map(r => r.status).join(', ');
        console.log(`[Telnyx-Sync] Strategy 2 failed: Found recordings but none are completed (statuses: ${statuses})`);
        console.log(`[Telnyx-Sync] ℹ️ Recordings are still processing. Try again in 30-60 seconds.`);
        return false;
      }
      
      // Use the first completed recording
      const recording = completedRecordings[0];
      console.log(`[Telnyx-Sync] Using completed recording ${recording.id} (status: ${recording.status})`);
      
      // Use download URL directly from recording object (mp3 preferred, fallback to wav)
      const downloadUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;
      if (downloadUrl) {
        console.log(`[Telnyx-Sync] Found download URL: ${downloadUrl}`);
        const durationSec = Math.floor(recording.duration_millis / 1000);
        // These can throw - let them propagate as they're real errors
          await updateLeadWithRecording(leadId, downloadUrl, durationSec, recording.call_control_id);
        
        // Also update call attempt with telnyx metadata
          if (legacyAttempt) {
          await db.update(callAttempts)
            .set({
              telnyxCallId: recording.call_control_id,
              recordingUrl: downloadUrl,
            })
              .where(eq(callAttempts.id, legacyAttempt.id));
          }

          if (dialerAttempt) {
            await db.update(dialerCallAttempts)
              .set({
                telnyxCallId: recording.call_control_id,
                recordingUrl: downloadUrl,
                updatedAt: new Date(),
              })
              .where(eq(dialerCallAttempts.id, dialerAttempt.id));
        }
        
        console.log(`[Telnyx-Sync] ✅ Strategy 2 success: Updated lead ${leadId} with recording`);
        return true;
      }
    }
    console.log(`[Telnyx-Sync] Strategy 2 failed: No recordings found for ${dialedPhone}`);
  }

  console.log(`[Telnyx-Sync] ========================================`);
  console.log(`[Telnyx-Sync] ❌ NO RECORDING FOUND FOR LEAD: ${leadId}`);
  console.log(`[Telnyx-Sync] Diagnosis:`);
  console.log(`[Telnyx-Sync]   - Has call attempt: ${!!resolvedAttempt ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Has Telnyx call ID (attempt): ${!!resolvedAttemptTelnyxCallId ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Has Telnyx call ID (lead): ${!!lead.lead.telnyxCallId ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Has dialed number (lead): ${!!lead.lead.dialedNumber ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Has dialed number (contact): ${!!dialedPhone ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Contact phones: Direct=${lead.contact?.directPhone || 'none'}, Mobile=${lead.contact?.mobilePhone || 'none'}`);
  console.log(`[Telnyx-Sync]   - Lead created: ${lead.lead.createdAt ? new Date(lead.lead.createdAt).toISOString() : 'unknown'}`);
  console.log(`[Telnyx-Sync] This lead may have been manually submitted without an actual phone call.`);
  console.log(`[Telnyx-Sync] ========================================`);
  return false;
}
