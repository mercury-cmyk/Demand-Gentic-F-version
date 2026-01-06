import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { db } from '../db';
import { leads, dialerCallAttempts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { AutoRecordingSyncJobData } from '../lib/auto-recording-sync-queue';
import axios from 'axios';

const connection = new Redis(process.env.REDIS_URL || '', {
  maxRetriesPerRequest: null,
});

const OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

/**
 * Fetch recording from Telnyx
 */
async function fetchRecordingFromTelnyx(
  telnyxCallId: string | null,
  dialedNumber: string | null
): Promise<string | null> {
  if (!telnyxCallId && !dialedNumber) {
    console.log('[AutoRecordingSyncWorker] No call ID or dialed number provided');
    return null;
  }

  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    console.error('[AutoRecordingSyncWorker] TELNYX_API_KEY not configured');
    return null;
  }

  try {
    // Strategy 1: Search by call_control_id if available
    if (telnyxCallId) {
      try {
        const response = await axios.get(
          `https://api.telnyx.com/v2/recordings?filter[call_control_id]=${telnyxCallId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 10000,
          }
        );

        if (response.data?.data?.length > 0) {
          const recording = response.data.data[0];
          const recordingUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;
          console.log(`[AutoRecordingSyncWorker] Found recording by call_control_id: ${telnyxCallId}`);
          return recordingUrl || null;
        }
      } catch (err: any) {
        console.log(`[AutoRecordingSyncWorker] Strategy 1 (call_control_id) failed:`, err.message);
      }
    }

    // Strategy 2: Search by dialed number with time-based filtering
    if (dialedNumber) {
      try {
        const now = new Date();
        const startTime = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
        const endTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 min future buffer

        const response = await axios.get(
          `https://api.telnyx.com/v2/recordings`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            params: {
              'filter[created_at][gte]': startTime.toISOString(),
              'filter[created_at][lte]': endTime.toISOString(),
              'page[size]': 50,
            },
            timeout: 10000,
          }
        );

        if (response.data?.data?.length > 0) {
          // Find recording matching dialed number
          const recording = response.data.data.find((rec: any) =>
            rec.to === dialedNumber || rec.from === dialedNumber
          );

          if (recording) {
            const recordingUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;
            console.log(`[AutoRecordingSyncWorker] Found recording by dialed number: ${dialedNumber}`);
            return recordingUrl || null;
          }
        }
      } catch (err: any) {
        console.log(`[AutoRecordingSyncWorker] Strategy 2 (dialed number) failed:`, err.message);
      }
    }

    console.log('[AutoRecordingSyncWorker] No recording found');
    return null;
  } catch (error: any) {
    console.error('[AutoRecordingSyncWorker] Error fetching recording:', error);
    return null;
  }
}

/**
 * Transcribe audio with OpenAI Whisper
 */
async function transcribeWithSpeakers(
  recordingUrl: string,
  contactFirstName: string | null
): Promise<{ transcript: string; structuredTranscript: any } | null> {
  if (!OPENAI_API_KEY) {
    console.log('[AutoRecordingSyncWorker] OpenAI API key not configured');
    return null;
  }

  try {
    // Download audio file
    const audioResponse = await axios.get(recordingUrl, { responseType: 'blob' });
    const audioBlob = audioResponse.data;

    // Create form data for Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AutoRecordingSyncWorker] Transcription failed:', errorText);
      return null;
    }

    const data = await response.json();
    const plainTranscript = data.text || '';

    // Build structured transcript (basic structure without speaker diarization)
    const structuredTranscript = {
      fullTranscript: plainTranscript,
      conversation: [
        {
          speaker: 'Mixed',
          text: plainTranscript,
          timestamp: 0,
        }
      ],
      speakerMapping: {
        Mixed: 'Agent & Prospect',
      },
    };

    console.log('[AutoRecordingSyncWorker] Transcription completed');
    return {
      transcript: plainTranscript,
      structuredTranscript,
    };
  } catch (error: any) {
    console.error('[AutoRecordingSyncWorker] Error transcribing:', error);
    return null;
  }
}

// Create worker
export const autoRecordingSyncWorker = new Worker<AutoRecordingSyncJobData>(
  'auto-recording-sync',
  async (job) => {
    const { leadId, callAttemptId, contactFirstName, telnyxCallId, dialedNumber } = job.data;

    if (!leadId && !callAttemptId) {
      console.error('[AutoRecordingSyncWorker] Job missing leadId and callAttemptId');
      return { success: false, reason: 'Missing leadId and callAttemptId' };
    }

    const targetLabel = leadId ? `lead ${leadId}` : `call attempt ${callAttemptId}`;
    console.log(`[AutoRecordingSyncWorker] Processing job for ${targetLabel}`);

    try {
      // Update status to fetching for leads only
      if (leadId) {
        await db.update(leads)
          .set({ recordingStatus: 'fetching' })
          .where(eq(leads.id, leadId));
      }

      // Step 1: Fetch recording from Telnyx
      const recordingUrl = await fetchRecordingFromTelnyx(telnyxCallId, dialedNumber);

      if (!recordingUrl) {
        if (leadId) {
          await db.update(leads)
            .set({ recordingStatus: 'failed' })
            .where(eq(leads.id, leadId));
        }
        console.log(`[AutoRecordingSyncWorker] No recording found for ${targetLabel}`);
        return { success: false, reason: 'No recording found' };
      }

      // Update lead with recording URL
      if (leadId) {
        await db.update(leads)
          .set({ recordingUrl })
          .where(eq(leads.id, leadId));
      }

      // Update call attempt with recording URL
      if (callAttemptId) {
        await db.update(dialerCallAttempts)
          .set({ recordingUrl, updatedAt: new Date() })
          .where(eq(dialerCallAttempts.id, callAttemptId));
      }

      console.log(`[AutoRecordingSyncWorker] Recording URL saved for ${targetLabel}`);

      // Step 2: Transcribe with speaker diarization
      if (leadId) {
        await db.update(leads)
          .set({ transcriptionStatus: 'processing' })
          .where(eq(leads.id, leadId));
      }

      const transcriptionResult = await transcribeWithSpeakers(recordingUrl, contactFirstName);

      if (!transcriptionResult) {
        if (leadId) {
          await db.update(leads)
            .set({
              transcriptionStatus: 'failed',
              recordingStatus: 'completed',
            })
            .where(eq(leads.id, leadId));
        }
        console.log(`[AutoRecordingSyncWorker] Transcription failed for ${targetLabel}`);
        return { success: true, transcriptionFailed: true };
      }

      // Step 3: Save transcript and structured transcript
      if (leadId) {
        await db.update(leads)
          .set({
            transcript: transcriptionResult.transcript,
            structuredTranscript: transcriptionResult.structuredTranscript,
            transcriptionStatus: 'completed',
            recordingStatus: 'completed',
          })
          .where(eq(leads.id, leadId));
      }

      if (callAttemptId && transcriptionResult.transcript?.trim()) {
        const transcriptText = transcriptionResult.transcript.trim();
        const transcriptMarker = "[Call Transcript]";
        const [attempt] = await db
          .select({ notes: dialerCallAttempts.notes })
          .from(dialerCallAttempts)
          .where(eq(dialerCallAttempts.id, callAttemptId))
          .limit(1);
        const existingNotes = attempt?.notes || "";
        const hasTranscript = existingNotes.includes(transcriptMarker);
        const transcriptBlock = `${transcriptMarker}\n${transcriptText}`;
        const nextNotes = hasTranscript
          ? existingNotes
          : existingNotes
            ? `${existingNotes}\n\n${transcriptBlock}`
            : transcriptBlock;

        await db.update(dialerCallAttempts)
          .set({
            notes: nextNotes,
            updatedAt: new Date()
          })
          .where(eq(dialerCallAttempts.id, callAttemptId));
      }

      console.log(`[AutoRecordingSyncWorker] Completed processing for ${targetLabel}`);
      return { success: true };
    } catch (error: any) {
      console.error(`[AutoRecordingSyncWorker] Error processing ${targetLabel}:`, error);

      if (leadId) {
        await db.update(leads)
          .set({ recordingStatus: 'failed', transcriptionStatus: 'failed' })
          .where(eq(leads.id, leadId));
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 5, // Process up to 5 jobs concurrently
  }
);

console.log('[AutoRecordingSyncWorker] Worker started successfully');
