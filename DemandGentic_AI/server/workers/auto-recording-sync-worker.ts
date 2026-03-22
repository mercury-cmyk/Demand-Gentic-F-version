import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { db } from '../db';
import { leads, dialerCallAttempts, campaignTestCalls, callSessions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { AutoRecordingSyncJobData } from '../lib/auto-recording-sync-queue';
import axios from 'axios';
import { submitStructuredTranscription } from '../services/google-transcription';
import { getRedisUrl, getRedisConnectionOptions } from '../lib/redis-config';
import { downloadAndStoreRecording, isRecordingStorageEnabled } from '../services/recording-storage';
import { fetchTelnyxRecording } from '../services/telnyx-recordings';
import { buildPostCallTranscriptWithSummaryAsync } from '../services/post-call-transcript-summary';

// Lazy Redis connection - only connect when worker is actually used
let connection: Redis | null = null;

function getConnection(): Redis {
  if (!connection) {
    const redisUrl = getRedisUrl();
    if (!redisUrl) {
      throw new Error('[AutoRecordingSyncWorker] Redis URL not configured');
    }
    connection = new Redis(redisUrl, {
      ...getRedisConnectionOptions(),
      maxRetriesPerRequest: null,
      lazyConnect: true, // Don't connect until first command
    });
    connection.on('error', (err) => {
      console.error('[AutoRecordingSyncWorker] Redis connection error:', err.message);
    });
  }
  return connection;
}

/**
 * Fetch recording from Telnyx using the shared service
 */
async function fetchRecordingFromTelnyx(
  telnyxCallId: string | null,
  dialedNumber: string | null
): Promise {
  if (!telnyxCallId && !dialedNumber) {
    console.log('[AutoRecordingSyncWorker] No call ID or dialed number provided');
    return null;
  }

  try {
    // Strategy 1: Use the robust shared service (handles call_control_id vs call_leg_id automatically)
    if (telnyxCallId) {
       console.log(`[AutoRecordingSyncWorker] Fetching by call ID: ${telnyxCallId}`);
       const recordingUrl = await fetchTelnyxRecording(telnyxCallId);
       if (recordingUrl) {
         console.log(`[AutoRecordingSyncWorker] Found recording by call ID: ${telnyxCallId}`);
         return recordingUrl;
       }
       console.log(`[AutoRecordingSyncWorker] Strategy 1 failed: No recording found for ${telnyxCallId}`);
    }

    // Strategy 2: Search by dialed number with time-based filtering
    // Note: fetchTelnyxRecording doesn't support dialed number search, so we keep the local logic or
    // we could delegate to searchRecordingsByDialedNumber if we imported it.
    // Let's import searchRecordingsByDialedNumber too?
    // For now, let's keep the dialed number logic if it works, or replace it if we really want to unify.
    // The previous implementation of Strategy 2 used axios directly.
    // Let's rely on the shared service for consistency if possible.
    // I'll leave Strategy 2 as is for now or use searchRecordingsByDialedNumber if I imported it.
    // But I didn't import it. Let's stick to replacing just the fetchTelnyxRecording part for Strategy 1 first.
    
    const apiKey = process.env.TELNYX_API_KEY;
    if (dialedNumber && apiKey) {
      try {
        const now = new Date();
        const startTime = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
        const endTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 min future buffer

        const response = await axios.get(
          `https://api.telnyx.com/v2/recordings`,
          {
            headers: { Authorization: `Bearer ${apiKey.trim()}` },
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
 * Transcribe audio with Deepgram post-call transcription
 */
async function transcribeWithSpeakers(
  recordingUrl: string,
  contactFirstName: string | null,
  telnyxCallId?: string | null
): Promise {
  try {
    console.log('[AutoRecordingSyncWorker] 🎤 Starting Google STT post-call transcription...');
    
    // Use Google Speech-to-Text service with structured output
    const result = await submitStructuredTranscription(recordingUrl, { telnyxCallId });
    
    if (!result) {
      console.error('[AutoRecordingSyncWorker] Transcription returned empty result');
      return null;
    }

    const { text: plainTranscript, utterances } = result;

    const hasChannelTags = utterances.some((u: any) => typeof u.channelTag === 'number');

    let transcriptTurns: Array = [];
    let structuredTranscript: any;

    if (hasChannelTags) {
      // Strict mapping for stereo recordings from call-recording-manager:
      // Channel 1 (left) = Contact, Channel 2 (right) = Agent.
      transcriptTurns = utterances
        .map((u: any) => {
          if (u.channelTag === 2) {
            return {
              role: 'agent' as const,
              text: u.text,
              timeOffset: u.start,
              speaker: 'Channel 2',
            };
          }
          if (u.channelTag === 1) {
            return {
              role: 'contact' as const,
              text: u.text,
              timeOffset: u.start,
              speaker: 'Channel 1',
            };
          }
          return null;
        })
        .filter((t): t is NonNullable => !!t);

      structuredTranscript = {
        fullTranscript: plainTranscript,
        conversation: transcriptTurns.map(t => ({
          speaker: t.role === 'agent' ? 'Agent' : 'Contact',
          text: t.text,
          timestamp: t.timeOffset,
        })),
        speakerMapping: {
          'Channel 2': 'Agent',
          'Channel 1': 'Contact',
        },
      };
    } else {
      // Fallback for non-stereo/legacy transcripts.
      const uniqueSpeakers = Array.from(new Set(utterances.map(u => u.speaker)));

      const inferAgentSpeaker = (): string => {
        if (utterances.length === 0) return uniqueSpeakers[0] || 'Speaker 1';

        const scores = new Map();
        uniqueSpeakers.forEach((s) => scores.set(s, 0));

        const normalizedFirstName = (contactFirstName || '').trim().toLowerCase();

        const agentCues = [
          'this is',
          'calling from',
          'may i speak',
          'am i speaking with',
          'i am calling',
          "i'm calling",
          "i'll be brief",
          'quick question',
          'follow up',
        ];

        const contactCues = [
          'hello',
          'speaking',
          'who is this',
          'wrong number',
          'not interested',
          'do not call',
          "don't call",
          'take me off',
        ];

        for (let i = 0; i  text.includes(c))) score += 3;
          if (contactCues.some(c => text.includes(c))) score -= 2;

          if (normalizedFirstName && text.includes(normalizedFirstName) && text.includes('speak')) {
            score += 2;
          }

          // Very short opener like "hello" / "speaking" is usually the contact.
          if (i === 0 && words.length = 10) score += 1;

          scores.set(speaker, score);
        }

        let bestSpeaker = uniqueSpeakers[0] || 'Speaker 1';
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const speaker of uniqueSpeakers) {
          const score = scores.get(speaker) || 0;
          if (score > bestScore) {
            bestScore = score;
            bestSpeaker = speaker;
          }
        }

        // Tie-breaker: if first turn is a short greeting and second speaker exists, prefer second speaker as agent.
        const first = utterances[0];
        const second = utterances[1];
        const firstWords = String(first?.text || '').trim().split(/\s+/).filter(Boolean).length;
        if (
          second &&
          first?.speaker === bestSpeaker &&
          firstWords  ({
        role: u.speaker === agentSpeaker ? 'agent' : 'contact',
        text: u.text,
        timeOffset: u.start, // Store offset instead of fake Date
        speaker: u.speaker
      }));

      structuredTranscript = {
        fullTranscript: plainTranscript,
        conversation: utterances.map(u => ({
          speaker: u.speaker === agentSpeaker ? 'Agent' : 'Contact',
          text: u.text,
          timestamp: u.start,
        })),
        speakerMapping: {
          [agentSpeaker]: 'Agent',
          [uniqueSpeakers.find(s => s !== agentSpeaker) || 'Speaker 2']: 'Contact',
        },
      };
    }

    console.log('[AutoRecordingSyncWorker] ✅ Google STT transcription completed');
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

// Worker instance - created lazily to avoid blocking module load
let autoRecordingSyncWorker: Worker | null = null;

// Initialize worker (call this after server starts)
export function initializeAutoRecordingSyncWorker(): Worker | null {
  if (autoRecordingSyncWorker) {
    return autoRecordingSyncWorker;
  }

  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    console.log('[AutoRecordingSyncWorker] Redis not configured, worker disabled');
    return null;
  }

  try {
    autoRecordingSyncWorker = new Worker(
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

      // Step 1.5: Download recording to GCS for permanent storage
      // This prevents loss when Telnyx presigned URLs expire (10 minutes)
      let recordingS3Key: string | null = null;
      if (leadId && isRecordingStorageEnabled()) {
        console.log(`[AutoRecordingSyncWorker] 📥 Downloading recording to GCS for ${targetLabel}...`);
        recordingS3Key = await downloadAndStoreRecording(recordingUrl, leadId, telnyxCallId);

        if (recordingS3Key) {
          await db.update(leads)
            .set({ recordingS3Key })
            .where(eq(leads.id, leadId));
          console.log(`[AutoRecordingSyncWorker] ✅ Recording stored in GCS: ${recordingS3Key}`);
        } else {
          console.log(`[AutoRecordingSyncWorker] ⚠️ Failed to store recording in GCS (will use Telnyx URL)`);
        }
      }

      // Step 2: Transcribe with speaker diarization
      if (leadId) {
        await db.update(leads)
          .set({ transcriptionStatus: 'processing' })
          .where(eq(leads.id, leadId));
      }

      const transcriptionResult = await transcribeWithSpeakers(recordingUrl, contactFirstName, telnyxCallId);

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

      const transcriptWithSummary = await buildPostCallTranscriptWithSummaryAsync(
        transcriptionResult.transcript,
        (transcriptionResult.transcriptTurns || []).map((turn: any) => ({
          role: turn.role === 'agent' ? 'agent' : 'contact',
          text: String(turn.text || ''),
          timeOffset: typeof turn.timeOffset === 'number' ? turn.timeOffset : undefined,
        }))
      );

      // Step 3: Save transcript and structured transcript
      if (leadId) {
        await db.update(leads)
          .set({
            transcript: transcriptWithSummary,
            structuredTranscript: transcriptionResult.structuredTranscript,
            transcriptionStatus: 'completed',
            recordingStatus: 'completed',
          })
          .where(eq(leads.id, leadId));
      }

      if (callAttemptId && transcriptionResult.transcript?.trim()) {
        const transcriptText = transcriptWithSummary.trim();
        
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

      // Step 4: Propagate transcript to call_sessions.aiTranscript so Conversation Quality tab can display it
      if (callAttemptId && transcriptionResult.transcript?.trim()) {
        try {
          const [attemptRow] = await db
            .select({ callSessionId: dialerCallAttempts.callSessionId })
            .from(dialerCallAttempts)
            .where(eq(dialerCallAttempts.id, callAttemptId))
            .limit(1);

          if (attemptRow?.callSessionId) {
            await db.update(callSessions)
              .set({ aiTranscript: transcriptWithSummary })
              .where(eq(callSessions.id, attemptRow.callSessionId));
            console.log(`[AutoRecordingSyncWorker] ✅ Synced transcript to call_sessions.aiTranscript for session ${attemptRow.callSessionId}`);
          }
        } catch (syncErr: any) {
          console.warn(`[AutoRecordingSyncWorker] Failed to sync transcript to call_sessions: ${syncErr.message}`);
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
    connection: getConnection(),
    concurrency: 5, // Process up to 5 jobs concurrently
  }
);

    autoRecordingSyncWorker.on('error', (err) => {
      // Suppress Redis connection errors - they're expected when Redis is unavailable
      const errorCode = (err as any)?.code;
      if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT' || err.message?.includes('ECONNREFUSED') || err.message?.includes('ETIMEDOUT')) {
        return; // Silent - Redis connection issues are handled with reconnection
      }
      console.error('[AutoRecordingSyncWorker] Worker error:', err);
    });

    console.log('[AutoRecordingSyncWorker] Worker initialized successfully');
    return autoRecordingSyncWorker;
  } catch (error) {
    console.error('[AutoRecordingSyncWorker] Failed to initialize worker:', error);
    return null;
  }
}

// Export the worker getter for compatibility
export { autoRecordingSyncWorker };