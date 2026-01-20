import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { db } from '../db';
import { leads, dialerCallAttempts, campaignTestCalls } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { AutoRecordingSyncJobData } from '../lib/auto-recording-sync-queue';
import axios from 'axios';
import { submitTranscription, submitStructuredTranscription } from '../services/assemblyai-transcription';
import { getRedisUrl, getRedisConnectionOptions } from '../lib/redis-config';

const connection = new Redis(getRedisUrl(), {
  ...getRedisConnectionOptions(),
  maxRetriesPerRequest: null,
});
connection.on('error', () => {});

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
 * Transcribe audio with Google Cloud Speech-to-Text
 */
async function transcribeWithSpeakers(
  recordingUrl: string,
  contactFirstName: string | null
): Promise<{ transcript: string; structuredTranscript: any; transcriptTurns: any[] } | null> {
  try {
    console.log('[AutoRecordingSyncWorker] 🎤 Starting Google Cloud Speech-to-Text transcription...');
    
    // Use Google Cloud Speech-to-Text service with structured output
    const result = await submitStructuredTranscription(recordingUrl);
    
    if (!result) {
      console.error('[AutoRecordingSyncWorker] Transcription returned empty result');
      return null;
    }

    const { text: plainTranscript, utterances } = result;

    // Heuristic: First speaker is Agent
    const uniqueSpeakers = Array.from(new Set(utterances.map(u => u.speaker)));
    const agentSpeaker = uniqueSpeakers[0] || 'Speaker 1'; 
    
    const transcriptTurns = utterances.map(u => ({
      role: u.speaker === agentSpeaker ? 'agent' : 'contact',
      text: u.text,
      timeOffset: u.start, // Store offset instead of fake Date
      speaker: u.speaker
    }));

    // Build structured transcript (legacy format compatibility)
    const structuredTranscript = {
      fullTranscript: plainTranscript,
      conversation: utterances.map(u => ({
        speaker: u.speaker === agentSpeaker ? 'Agent' : 'Prospect',
        text: u.text,
        timestamp: u.start,
      })),
      speakerMapping: {
        [agentSpeaker]: 'Agent',
        [uniqueSpeakers.find(s => s !== agentSpeaker) || 'Speaker 2']: 'Prospect',
      },
    };

    console.log('[AutoRecordingSyncWorker] ✅ Google Cloud Speech-to-Text completed');
    return {
      transcript: plainTranscript,
      structuredTranscript,
      transcriptTurns,
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
        if (callAttemptId.startsWith('test-attempt-')) {
          const testCallId = callAttemptId.replace('test-attempt-', '');
          await db.update(campaignTestCalls)
            .set({ recordingUrl, updatedAt: new Date() })
            .where(eq(campaignTestCalls.id, testCallId));
        } else {
          await db.update(dialerCallAttempts)
            .set({ recordingUrl, updatedAt: new Date() })
            .where(eq(dialerCallAttempts.id, callAttemptId));
        }
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
        
        if (callAttemptId.startsWith('test-attempt-')) {
          const testCallId = callAttemptId.replace('test-attempt-', '');
          await db.update(campaignTestCalls)
            .set({ 
              fullTranscript: transcriptText,
              transcriptTurns: transcriptionResult.transcriptTurns,
              updatedAt: new Date() 
            })
            .where(eq(campaignTestCalls.id, testCallId));
        } else {
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

autoRecordingSyncWorker.on('error', (err) => {
  // Suppress Redis connection errors - they're expected when Redis is unavailable
  if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
    return; // Silent - Redis is optional
  }
  console.error('[AutoRecordingSyncWorker] Worker error:', err);
});

console.log('[AutoRecordingSyncWorker] Worker started successfully');
