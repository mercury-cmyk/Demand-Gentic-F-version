import { eq, isNull, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { leads, calls, callAttempts, contacts } from '../../shared/schema';
import { transcribeLeadCall } from './assemblyai-transcription';

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
    // First, get the call details to find recordings (with retry)
    const callResponse = await fetchWithRetry(
      `${TELNYX_API_BASE}/calls/${callControlId}`,
      {
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // 404 and 422 are expected - call might not exist, recording not ready, or call_control_id expired
    if (callResponse.status === 404 || callResponse.status === 422) {
      console.log(`[Telnyx] Call not found or expired (${callResponse.status}):`, callControlId);
      return null;
    }

    // Any other non-OK status is an error
    if (!callResponse.ok) {
      const errorText = await callResponse.text();
      throw new Error(`Telnyx API error (${callResponse.status}): ${errorText}`);
    }

    const callData = await callResponse.json();
    
    // Get recordings for this call (with retry)
    const recordingsResponse = await fetchWithRetry(
      `${TELNYX_API_BASE}/recordings?filter[call_control_id]=${callControlId}`,
      {
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (recordingsResponse.status === 404) {
      console.log('[Telnyx] Recordings not found (404) for call:', callControlId);
      return null;
    }

    if (!recordingsResponse.ok) {
      const errorText = await recordingsResponse.text();
      throw new Error(`Telnyx API error fetching recordings (${recordingsResponse.status}): ${errorText}`);
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
      } else {
        console.log('[Telnyx] Recording found but no download URLs available:', recording.id);
        return null;
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
    // Created within last 7 days to keep the search window reasonable
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

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
          gte(leads.createdAt, sevenDaysAgo)
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
async function updateLeadWithRecording(leadId: string, recordingUrl: string, durationSec: number): Promise<void> {
  await db.update(leads)
    .set({
      recordingUrl,
      callDuration: durationSec,
      transcriptionStatus: 'pending',
    })
    .where(eq(leads.id, leadId));

  // Trigger transcription asynchronously (don't wait)
  transcribeLeadCall(leadId).catch(err => {
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
      attempt: callAttempts,
      contact: contacts,
    })
    .from(leads)
    .leftJoin(callAttempts, eq(leads.callAttemptId, callAttempts.id))
    .leftJoin(contacts, eq(leads.contactId, contacts.id))
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  // Strategy 1: Use telnyxCallId from call_attempts (legacy auto-dialer)
  if (lead.attempt?.telnyxCallId) {
    console.log(`[Telnyx-Sync] Trying Strategy 1a: Fetch by call_control_id (from attempt) for lead ${leadId}`);
    const recordingUrl = await fetchTelnyxRecording(lead.attempt.telnyxCallId);
    if (recordingUrl) {
      // These can throw - let them propagate as they're real errors
      await updateLeadWithRecording(leadId, recordingUrl, lead.attempt.duration || 0);
      
      // Also update call attempt with recording URL if not already set
      if (!lead.attempt.recordingUrl) {
        await db.update(callAttempts)
          .set({ recordingUrl })
          .where(eq(callAttempts.id, lead.attempt.id));
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
      await updateLeadWithRecording(leadId, recordingUrl, lead.lead.callDuration || 0);
      
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
        await updateLeadWithRecording(leadId, downloadUrl, durationSec);
        
        // Also update call attempt with telnyx metadata
        if (lead.attempt) {
          await db.update(callAttempts)
            .set({
              telnyxCallId: recording.call_control_id,
              recordingUrl: downloadUrl,
            })
            .where(eq(callAttempts.id, lead.attempt.id));
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
  console.log(`[Telnyx-Sync]   - Has call attempt: ${!!lead.attempt ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Has Telnyx call ID (attempt): ${!!lead.attempt?.telnyxCallId ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Has Telnyx call ID (lead): ${!!lead.lead.telnyxCallId ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Has dialed number (lead): ${!!lead.lead.dialedNumber ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Has dialed number (contact): ${!!dialedPhone ? 'YES' : 'NO'}`);
  console.log(`[Telnyx-Sync]   - Contact phones: Direct=${lead.contact?.directPhone || 'none'}, Mobile=${lead.contact?.mobilePhone || 'none'}`);
  console.log(`[Telnyx-Sync]   - Lead created: ${lead.lead.createdAt ? new Date(lead.lead.createdAt).toISOString() : 'unknown'}`);
  console.log(`[Telnyx-Sync] This lead may have been manually submitted without an actual phone call.`);
  console.log(`[Telnyx-Sync] ========================================`);
  return false;
}
