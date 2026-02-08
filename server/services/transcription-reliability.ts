/**
 * Transcription Reliability Service
 *
 * Ensures every call has a transcript through:
 * 1. Primary: Gemini Live real-time transcription (built-in)
 * 2. Fallback: Google Cloud Speech-to-Text from recording
 * 3. Verification: Compare transcripts and flag discrepancies
 *
 * This service runs as a background job to:
 * - Detect calls with missing transcripts
 * - Trigger fallback transcription from recordings
 * - Verify transcript completeness
 * - Log transcription quality metrics
 */

import { db } from '../db';
import { dialerCallAttempts, callSessions, activityLog } from '@shared/schema';
import { eq, and, or, isNull, isNotNull, gt, lt, sql } from 'drizzle-orm';
import { transcribeFromRecording } from './google-transcription';

const LOG_PREFIX = '[Transcription-Reliability]';

// Configuration
const TRANSCRIPTION_CHECK_DELAY_MS = 60000; // Wait 60s after call ends before checking
const MIN_CALL_DURATION_FOR_TRANSCRIPT = 5; // Minimum seconds for a call to have transcript
const TRANSCRIPT_MIN_LENGTH = 20; // Minimum characters for a valid transcript

interface TranscriptionStatus {
  hasTranscript: boolean;
  transcriptSource: 'gemini_live' | 'fallback_stt' | 'none';
  transcriptLength: number;
  verificationStatus: 'pending' | 'verified' | 'discrepancy' | 'failed';
  fallbackAttempted: boolean;
  fallbackSuccessful: boolean;
}

interface TranscriptionResult {
  success: boolean;
  transcript?: string;
  source: 'gemini_live' | 'fallback_stt' | 'verification';
  wordCount?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Check if a call attempt has a valid transcript
 */
export async function checkTranscriptStatus(callAttemptId: string): Promise<TranscriptionStatus> {
  try {
    const [attempt] = await db
      .select({
        fullTranscript: dialerCallAttempts.fullTranscript,
        aiTranscript: dialerCallAttempts.aiTranscript,
        recordingUrl: dialerCallAttempts.recordingUrl,
        startedAt: dialerCallAttempts.callStartedAt,
        endedAt: dialerCallAttempts.callEndedAt,
      })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!attempt) {
      return {
        hasTranscript: false,
        transcriptSource: 'none',
        transcriptLength: 0,
        verificationStatus: 'failed',
        fallbackAttempted: false,
        fallbackSuccessful: false,
      };
    }

    const transcript = attempt.fullTranscript || attempt.aiTranscript;
    const hasValidTranscript = transcript && transcript.length >= TRANSCRIPT_MIN_LENGTH;

    return {
      hasTranscript: hasValidTranscript,
      transcriptSource: hasValidTranscript ? 'gemini_live' : 'none',
      transcriptLength: transcript?.length || 0,
      verificationStatus: hasValidTranscript ? 'verified' : 'pending',
      fallbackAttempted: false,
      fallbackSuccessful: false,
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error checking transcript status:`, error);
    return {
      hasTranscript: false,
      transcriptSource: 'none',
      transcriptLength: 0,
      verificationStatus: 'failed',
      fallbackAttempted: false,
      fallbackSuccessful: false,
    };
  }
}

/**
 * Attempt fallback transcription from recording URL
 */
export async function attemptFallbackTranscription(
  callAttemptId: string,
  recordingUrl: string | null,
  telnyxCallId?: string | null
): Promise<TranscriptionResult> {
  console.log(`${LOG_PREFIX} Attempting fallback transcription for call ${callAttemptId}`);

  try {
    let urlToUse = recordingUrl;

    // If we don't have a recording URL (or it's been cleared), try to fetch a fresh one using Telnyx call ID.
    if (!urlToUse && telnyxCallId) {
      try {
        const { fetchTelnyxRecording } = await import('./telnyx-recordings');
        urlToUse = await fetchTelnyxRecording(telnyxCallId);
      } catch (e: any) {
        console.warn(`${LOG_PREFIX} Could not fetch recording URL from Telnyx for ${callAttemptId}:`, e?.message || e);
      }
    }

    if (!urlToUse) {
      // Mark as failed in DB to prevent infinite retry loops
      await db.update(dialerCallAttempts)
        .set({
          fullTranscript: '[SYSTEM: No recording available]',
          updatedAt: new Date(),
        })
        .where(eq(dialerCallAttempts.id, callAttemptId));

      return {
        success: false,
        source: 'fallback_stt',
        error: 'No recording URL available for fallback transcription',
      };
    }

    // Use Google Cloud STT for fallback
    const result = await transcribeFromRecording(urlToUse, { telnyxCallId });

    if (result && result.transcript && result.transcript.length > TRANSCRIPT_MIN_LENGTH) {
      // Save the fallback transcript
      await db.update(dialerCallAttempts)
        .set({
          fullTranscript: result.transcript,
          updatedAt: new Date(),
        })
        .where(eq(dialerCallAttempts.id, callAttemptId));

      console.log(`${LOG_PREFIX} ✅ Fallback transcription successful: ${result.transcript.length} chars`);

      // Log activity
      await logTranscriptionActivity(callAttemptId, 'fallback_completed', {
        source: 'google_stt',
        transcriptLength: result.transcript.length,
        wordCount: result.transcript.split(/\s+/).length,
        refreshedVia: telnyxCallId ? 'telnyx_possible' : 'none',
      });

      return {
        success: true,
        transcript: result.transcript,
        source: 'fallback_stt',
        wordCount: result.transcript.split(/\s+/).length,
      };
    }

    console.warn(`${LOG_PREFIX} Fallback transcription returned empty or too short`);
    return {
      success: false,
      source: 'fallback_stt',
      error: 'Transcription returned empty or too short',
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Fallback transcription failed:`, error);

    // Check for permanent errors (like 422 or 404 from Telnyx/Google) to prevent retry loops
    const errorMessage = error.message || 'Unknown error';
    const isPermanentError = errorMessage.includes('422') || 
                             errorMessage.includes('not found') || 
                             errorMessage.includes('expired') ||
                             errorMessage.includes('Invalid');

    if (isPermanentError) {
      await db.update(dialerCallAttempts)
        .set({
          fullTranscript: `[SYSTEM: Transcription failed - ${errorMessage}]`,
          updatedAt: new Date(),
        })
        .where(eq(dialerCallAttempts.id, callAttemptId));
    }

    await logTranscriptionActivity(callAttemptId, 'fallback_failed', {
      error: error.message,
    });

    return {
      success: false,
      source: 'fallback_stt',
      error: error.message,
    };
  }
}

/**
 * Process calls that may be missing transcripts
 * Run this as a background job
 */
export async function processMissingTranscripts(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  console.log(`${LOG_PREFIX} Starting missing transcript check...`);

  const stats = { processed: 0, succeeded: 0, failed: 0 };

  try {
    // Find calls that ended more than 60 seconds ago but have no transcript
    const cutoffTime = new Date(Date.now() - TRANSCRIPTION_CHECK_DELAY_MS);

    const callsWithoutTranscripts = await db
      .select({
        id: dialerCallAttempts.id,
        recordingUrl: dialerCallAttempts.recordingUrl,
        telnyxCallId: dialerCallAttempts.telnyxCallId,
        callStartedAt: dialerCallAttempts.callStartedAt,
        callEndedAt: dialerCallAttempts.callEndedAt,
        campaignId: dialerCallAttempts.campaignId,
        contactId: dialerCallAttempts.contactId,
        fullTranscript: dialerCallAttempts.fullTranscript,
      })
      .from(dialerCallAttempts)
      .where(
        and(
          // Find calls with no transcript OR marked for background processing
          or(
            and(
              isNull(dialerCallAttempts.fullTranscript),
              isNull(dialerCallAttempts.aiTranscript)
            ),
            sql`${dialerCallAttempts.fullTranscript} = '[PENDING_FALLBACK_TRANSCRIPTION]'`
          ),
          isNotNull(dialerCallAttempts.callEndedAt),
          lt(dialerCallAttempts.callEndedAt, cutoffTime),
          or(
            isNotNull(dialerCallAttempts.recordingUrl),
            isNotNull(dialerCallAttempts.telnyxCallId)
          )
        )
      )
      .limit(50); // Process in batches

    console.log(`${LOG_PREFIX} Found ${callsWithoutTranscripts.length} calls without transcripts`);

    for (const call of callsWithoutTranscripts) {
      stats.processed++;

      // Calculate call duration
      if (call.callStartedAt && call.callEndedAt) {
        const durationSec = (new Date(call.callEndedAt).getTime() - new Date(call.callStartedAt).getTime()) / 1000;

        if (durationSec < MIN_CALL_DURATION_FOR_TRANSCRIPT) {
          console.log(`${LOG_PREFIX} Skipping call ${call.id} - too short (${durationSec}s)`);
          continue;
        }
      }

      {
        const result = await attemptFallbackTranscription(call.id, call.recordingUrl ?? null, call.telnyxCallId);

        if (result.success) {
          stats.succeeded++;
        } else {
          stats.failed++;
        }
      }

      // Small delay between calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`${LOG_PREFIX} Completed: ${stats.processed} processed, ${stats.succeeded} succeeded, ${stats.failed} failed`);
    return stats;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error processing missing transcripts:`, error);
    return stats;
  }
}

/**
 * Verify transcript quality and completeness
 * Compares real-time transcript with post-call transcription if available
 */
export async function verifyTranscriptQuality(callAttemptId: string): Promise<{
  verified: boolean;
  qualityScore: number;
  issues: string[];
}> {
  try {
    const [attempt] = await db
      .select({
        fullTranscript: dialerCallAttempts.fullTranscript,
        aiTranscript: dialerCallAttempts.aiTranscript,
        startedAt: dialerCallAttempts.callStartedAt,
        endedAt: dialerCallAttempts.callEndedAt,
      })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!attempt) {
      return { verified: false, qualityScore: 0, issues: ['Call attempt not found'] };
    }

    const issues: string[] = [];
    let qualityScore = 100;

    const transcript = attempt.fullTranscript || attempt.aiTranscript || '';

    // Check 1: Transcript exists
    if (!transcript || transcript.length === 0) {
      issues.push('No transcript available');
      return { verified: false, qualityScore: 0, issues };
    }

    // Check 2: Minimum length
    if (transcript.length < TRANSCRIPT_MIN_LENGTH) {
      issues.push(`Transcript too short (${transcript.length} chars)`);
      qualityScore -= 30;
    }

    // Check 3: Has both Agent and Contact speech (for full transcripts)
    if (attempt.fullTranscript) {
      const hasAgentSpeech = transcript.includes('Agent:') || transcript.includes('[Agent]');
      const hasContactSpeech = transcript.includes('Contact:') || transcript.includes('[Contact]');

      if (!hasAgentSpeech) {
        issues.push('Missing agent speech in transcript');
        qualityScore -= 20;
      }
      if (!hasContactSpeech) {
        issues.push('Missing contact speech in transcript');
        qualityScore -= 20;
      }
    }

    // Check 4: Ratio of transcript length to call duration
    if (attempt.startedAt && attempt.endedAt) {
      const durationSec = (new Date(attempt.endedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000;
      const wordsPerMinute = (transcript.split(/\s+/).length / durationSec) * 60;

      // Normal conversation is 100-150 WPM
      if (wordsPerMinute < 30) {
        issues.push(`Low word density (${wordsPerMinute.toFixed(0)} WPM) - may be incomplete`);
        qualityScore -= 15;
      }
    }

    // Check 5: Look for transcription artifacts
    const artifacts = [
      '[inaudible]',
      '[unclear]',
      '???',
      '...',
    ];

    for (const artifact of artifacts) {
      if (transcript.toLowerCase().includes(artifact.toLowerCase())) {
        issues.push(`Contains unclear portions: ${artifact}`);
        qualityScore -= 5;
      }
    }

    return {
      verified: issues.length === 0,
      qualityScore: Math.max(0, qualityScore),
      issues,
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error verifying transcript:`, error);
    return {
      verified: false,
      qualityScore: 0,
      issues: [`Verification error: ${error.message}`],
    };
  }
}

/**
 * Get transcription statistics for a campaign
 */
export async function getTranscriptionStats(campaignId: string): Promise<{
  totalCalls: number;
  callsWithTranscripts: number;
  callsWithoutTranscripts: number;
  averageTranscriptLength: number;
  transcriptionRate: number;
}> {
  try {
    const results = await db
      .select({
        totalCalls: sql<number>`count(*)`,
        withTranscript: sql<number>`count(*) filter (where full_transcript is not null or ai_transcript is not null)`,
        avgLength: sql<number>`avg(coalesce(length(full_transcript), length(ai_transcript), 0))`,
      })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.campaignId, campaignId));

    const stats = results[0] || { totalCalls: 0, withTranscript: 0, avgLength: 0 };

    return {
      totalCalls: Number(stats.totalCalls) || 0,
      callsWithTranscripts: Number(stats.withTranscript) || 0,
      callsWithoutTranscripts: (Number(stats.totalCalls) || 0) - (Number(stats.withTranscript) || 0),
      averageTranscriptLength: Math.round(Number(stats.avgLength) || 0),
      transcriptionRate: stats.totalCalls > 0
        ? Math.round((Number(stats.withTranscript) / Number(stats.totalCalls)) * 100)
        : 0,
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error getting transcription stats:`, error);
    return {
      totalCalls: 0,
      callsWithTranscripts: 0,
      callsWithoutTranscripts: 0,
      averageTranscriptLength: 0,
      transcriptionRate: 0,
    };
  }
}

/**
 * Log transcription activity for audit trail
 */
async function logTranscriptionActivity(
  callAttemptId: string,
  eventType: string,
  payload: Record<string, any>
): Promise<void> {
  try {
    await db.insert(activityLog).values({
      entityType: 'dialer_call_attempt',
      entityId: callAttemptId,
      action: `transcription_${eventType}`,
      details: payload,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to log activity:`, error);
  }
}

/**
 * Ensure transcript exists for a call
 * Call this at the end of each call as a safety net
 */
export async function ensureTranscript(
  callAttemptId: string,
  realtimeTranscript?: string
): Promise<TranscriptionResult> {
  console.log(`${LOG_PREFIX} Ensuring transcript for call ${callAttemptId}`);

  // First, check if we already have a transcript from the real-time system
  if (realtimeTranscript && realtimeTranscript.length >= TRANSCRIPT_MIN_LENGTH) {
    console.log(`${LOG_PREFIX} Real-time transcript available (${realtimeTranscript.length} chars)`);
    return {
      success: true,
      transcript: realtimeTranscript,
      source: 'gemini_live',
      wordCount: realtimeTranscript.split(/\s+/).length,
    };
  }

  // Check database for existing transcript
  const status = await checkTranscriptStatus(callAttemptId);

  if (status.hasTranscript) {
    console.log(`${LOG_PREFIX} Transcript already exists in database`);
    return {
      success: true,
      source: status.transcriptSource,
      wordCount: status.transcriptLength,
    };
  }

  // No transcript - get recording URL and attempt fallback
  const [attempt] = await db
    .select({
      recordingUrl: dialerCallAttempts.recordingUrl,
      telnyxCallId: dialerCallAttempts.telnyxCallId,
    })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.id, callAttemptId))
    .limit(1);

  if (attempt?.recordingUrl || attempt?.telnyxCallId) {
    console.log(`${LOG_PREFIX} No real-time transcript - attempting fallback from recording`);
    return await attemptFallbackTranscription(callAttemptId, attempt.recordingUrl ?? null, attempt.telnyxCallId);
  }

  console.warn(`${LOG_PREFIX} No transcript and no recording URL available`);
  return {
    success: false,
    source: 'gemini_live',
    error: 'No transcript source available',
  };
}

/**
 * Mark a call attempt for priority background transcription processing
 * Used when all real-time fallback retries have failed
 */
export async function markForBackgroundTranscription(callAttemptId: string): Promise<void> {
  try {
    await db.update(dialerCallAttempts)
      .set({
        fullTranscript: '[PENDING_FALLBACK_TRANSCRIPTION]',
        updatedAt: new Date(),
      })
      .where(eq(dialerCallAttempts.id, callAttemptId));

    console.log(`${LOG_PREFIX} ⏳ Marked ${callAttemptId} for background transcription`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to mark for background transcription:`, error);
  }
}

export default {
  checkTranscriptStatus,
  attemptFallbackTranscription,
  processMissingTranscripts,
  verifyTranscriptQuality,
  getTranscriptionStats,
  ensureTranscript,
  markForBackgroundTranscription,
};
