/**
 * Transcription Reliability Service
 *
 * Ensures every call has a transcript through:
 * 1. Primary: Gemini Live real-time transcription (built-in)
 * 2. Fallback: Deepgram post-call transcription from recording
 * 3. Verification: Compare transcripts and flag discrepancies
 *
 * This service runs as a background job to:
 * - Detect calls with missing transcripts
 * - Trigger fallback transcription from recordings
 * - Verify transcript completeness
 * - Log transcription quality metrics
 */

import { db } from '../db';
import { dialerCallAttempts, callSessions, activityLog, leads } from '@shared/schema';
import { eq, and, or, isNull, isNotNull, gt, lt, sql, inArray } from 'drizzle-orm';
import { transcribeFromRecording } from './deepgram-postcall-transcription';
import { transcribeBatchParallel, resetAllCircuitBreakers, BatchTranscriptionItem } from './transcription-pool';

const LOG_PREFIX = '[Transcription-Reliability]';

// Configuration
const TRANSCRIPTION_CHECK_DELAY_MS = 60000; // Wait 60s after call ends before checking
const MIN_CALL_DURATION_FOR_TRANSCRIPT = 5; // Minimum seconds for a call to have transcript
const TRANSCRIPT_MIN_LENGTH = 20; // Minimum characters for a valid transcript

// Long-call thresholds — calls above these durations get extra protection
const LONG_CALL_DURATION_SEC = 25; // Calls >25s are "long" and must never be missed
const LONG_CALL_UPLOAD_WAIT_MS = 120_000; // Wait up to 2 min for recording upload on long calls
const LONG_CALL_UPLOAD_POLL_MS = 5_000; // Poll every 5s during upload wait

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

async function triggerAnalysisAfterTranscript(
  callAttemptId: string,
  transcriptText?: string
): Promise<void> {
  try {
    const [attempt] = await db
      .select({
        callSessionId: dialerCallAttempts.callSessionId,
        campaignId: dialerCallAttempts.campaignId,
        contactId: dialerCallAttempts.contactId,
        callDurationSeconds: dialerCallAttempts.callDurationSeconds,
        disposition: dialerCallAttempts.disposition,
        fullTranscript: dialerCallAttempts.fullTranscript,
        aiTranscript: dialerCallAttempts.aiTranscript,
      })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!attempt) {
      return;
    }

    const transcript = (transcriptText || attempt.fullTranscript || attempt.aiTranscript || '').trim();

    if (attempt.callSessionId) {
      const { schedulePostCallAnalysis } = await import('./post-call-analyzer');

      schedulePostCallAnalysis(attempt.callSessionId, {
        callAttemptId,
        campaignId: attempt.campaignId || undefined,
        contactId: attempt.contactId || undefined,
        callDurationSec: attempt.callDurationSeconds || undefined,
        disposition: attempt.disposition || undefined,
        geminiTranscript: transcript || undefined,
      });

      console.log(`${LOG_PREFIX} 📊 Scheduled post-call analyzer after transcription for attempt ${callAttemptId} (session ${attempt.callSessionId})`);
    }

    const [lead] = await db
      .select({
        id: leads.id,
        transcript: leads.transcript,
        aiScore: leads.aiScore,
      })
      .from(leads)
      .where(eq(leads.callAttemptId, callAttemptId))
      .limit(1);

    if (!lead?.id) {
      return;
    }

    if (!lead.transcript && transcript) {
      await db.update(leads)
        .set({
          transcript,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, lead.id));
    }

    const { analyzeCall } = await import('./call-quality-analyzer');
    await analyzeCall(lead.id);

    if (!lead.aiScore) {
      const { analyzeLeadQualification } = await import('./ai-qa-analyzer');
      await analyzeLeadQualification(lead.id);
    }

    console.log(`${LOG_PREFIX} ✅ Triggered lead analyzers after transcription for lead ${lead.id}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to trigger analysis after transcription for ${callAttemptId}:`, error);
  }
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
      // Check if the recording is still being uploaded before giving up permanently
      let stillUploading = false;
      try {
        const [attempt] = await db
          .select({ callSessionId: dialerCallAttempts.callSessionId })
          .from(dialerCallAttempts)
          .where(eq(dialerCallAttempts.id, callAttemptId))
          .limit(1);

        if (attempt?.callSessionId) {
          const [session] = await db
            .select({ recordingStatus: callSessions.recordingStatus })
            .from(callSessions)
            .where(eq(callSessions.id, attempt.callSessionId))
            .limit(1);

          stillUploading = session?.recordingStatus === 'recording' || session?.recordingStatus === 'uploading';
        }
      } catch {
        // Non-critical — default to permanent mark
      }

      if (stillUploading) {
        // Recording not ready yet — don't permanently mark as failed, let future retries pick it up
        console.log(`${LOG_PREFIX} Recording still uploading for ${callAttemptId} — skipping (will retry later)`);
        return {
          success: false,
          source: 'fallback_stt',
          error: 'Recording still uploading — will retry later',
        };
      }

      // Check if the call ended recently (< 10 minutes) — recording may still be processing
      const [attemptTiming] = await db
        .select({ callEndedAt: dialerCallAttempts.callEndedAt })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, callAttemptId))
        .limit(1);

      const endedAt = attemptTiming?.callEndedAt ? new Date(attemptTiming.callEndedAt).getTime() : 0;
      const minutesSinceEnd = endedAt ? (Date.now() - endedAt) / 60_000 : Infinity;

      if (minutesSinceEnd < 10) {
        console.log(`${LOG_PREFIX} Call ${callAttemptId} ended ${minutesSinceEnd.toFixed(1)}m ago — recording may still be processing, skipping permanent mark`);
        return {
          success: false,
          source: 'fallback_stt',
          error: 'No recording URL yet — call ended recently, will retry later',
        };
      }

      // Truly no recording available — mark permanently to prevent infinite retry loops
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

    // Resolve S3 key from linked call session (gives Deepgram a presigned GCS URL)
    let recordingS3Key: string | null = null;
    try {
      const [attemptForS3] = await db
        .select({ callSessionId: dialerCallAttempts.callSessionId })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, callAttemptId))
        .limit(1);

      if (attemptForS3?.callSessionId) {
        const [session] = await db
          .select({ recordingS3Key: callSessions.recordingS3Key })
          .from(callSessions)
          .where(eq(callSessions.id, attemptForS3.callSessionId))
          .limit(1);

        recordingS3Key = session?.recordingS3Key || null;
      }
    } catch {
      // Non-critical — proceed without S3 key
    }

    // Use Deepgram post-call transcription for fallback
    const result = await transcribeFromRecording(urlToUse, { telnyxCallId, recordingS3Key });

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
        source: 'deepgram',
        transcriptLength: result.transcript.length,
        wordCount: result.transcript.split(/\s+/).length,
        refreshedVia: telnyxCallId ? 'telnyx_possible' : 'none',
      });

      await triggerAnalysisAfterTranscript(callAttemptId, result.transcript);

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

    // Check for permanent errors (like 422/404/403 from provider fetch/transcription) to prevent retry loops
    const errorMessage = error.message || 'Unknown error';
    const isPermanentError = errorMessage.includes('422') || 
                             errorMessage.includes('not found') || 
                             errorMessage.includes('expired') ||
                             errorMessage.includes('Invalid') ||
                             errorMessage.includes('403') ||
                             errorMessage.includes('Forbidden');

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

  // Reset circuit breakers at the start of each batch so stale open circuits
  // don't permanently block all providers across runs
  resetAllCircuitBreakers();

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
      .limit(100); // Process in parallel batches

    console.log(`${LOG_PREFIX} Found ${callsWithoutTranscripts.length} calls without transcripts`);

    // Check which call sessions are still uploading recordings — skip those
    const callSessionIds = callsWithoutTranscripts
      .map(c => c.id)
      .filter(Boolean);

    const uploadingSessionIds = new Set<string>();
    if (callSessionIds.length > 0) {
      try {
        // Look up recording status for linked call sessions
        const sessions = await db
          .select({
            id: callSessions.id,
            recordingStatus: callSessions.recordingStatus,
          })
          .from(callSessions)
          .innerJoin(dialerCallAttempts, eq(dialerCallAttempts.callSessionId, callSessions.id))
          .where(
            and(
              inArray(dialerCallAttempts.id, callSessionIds),
              or(
                eq(callSessions.recordingStatus, 'recording'),
                eq(callSessions.recordingStatus, 'uploading')
              )
            )
          );

        for (const s of sessions) {
          uploadingSessionIds.add(s.id);
        }
      } catch {
        // Non-critical — proceed without filter
      }
    }

    let skippedTooShort = 0;
    let skippedUploading = 0;
    let skippedTooRecent = 0;

    // Build batch of eligible calls for parallel processing
    const batchItems: BatchTranscriptionItem[] = [];

    for (const call of callsWithoutTranscripts) {
      // Skip calls whose recording is still being uploaded
      if (uploadingSessionIds.size > 0) {
        try {
          const [attempt] = await db
            .select({ callSessionId: dialerCallAttempts.callSessionId })
            .from(dialerCallAttempts)
            .where(eq(dialerCallAttempts.id, call.id))
            .limit(1);

          if (attempt?.callSessionId && uploadingSessionIds.has(attempt.callSessionId)) {
            skippedUploading++;
            continue;
          }
        } catch {
          // Non-critical — proceed with transcription attempt
        }
      }

      // Calculate call duration
      let callDurationSec = 0;
      if (call.callStartedAt && call.callEndedAt) {
        callDurationSec = (new Date(call.callEndedAt).getTime() - new Date(call.callStartedAt).getTime()) / 1000;

        if (callDurationSec < MIN_CALL_DURATION_FOR_TRANSCRIPT) {
          skippedTooShort++;
          continue;
        }
      }

      // Duration-aware delay: long calls need more time for recording upload
      if (call.callEndedAt) {
        const minutesSinceEnd = (Date.now() - new Date(call.callEndedAt).getTime()) / 60_000;
        const requiredDelayMin = callDurationSec > 120 ? 5 : callDurationSec > 30 ? 3 : 1;

        if (minutesSinceEnd < requiredDelayMin) {
          skippedTooRecent++;
          continue;
        }
      }

      batchItems.push({
        callAttemptId: call.id,
        recordingUrl: call.recordingUrl ?? null,
        telnyxCallId: call.telnyxCallId ?? null,
      });
    }

    // Process eligible calls in parallel via multi-provider pool
    if (batchItems.length > 0) {
      console.log(`${LOG_PREFIX} Submitting ${batchItems.length} calls to parallel transcription pool`);
      const batchResults = await transcribeBatchParallel(batchItems, 10, 200);

      // Save results to DB sequentially (protects connection pool)
      for (const result of batchResults) {
        stats.processed++;
        if (result.success && result.transcript) {
          stats.succeeded++;
          await db.update(dialerCallAttempts)
            .set({
              fullTranscript: result.transcript,
              updatedAt: new Date(),
            })
            .where(eq(dialerCallAttempts.id, result.callAttemptId));

          await logTranscriptionActivity(result.callAttemptId, 'fallback_completed', {
            source: result.provider || 'pool',
            transcriptLength: result.transcript.length,
            wordCount: result.wordCount || result.transcript.split(/\s+/).length,
          });

          await triggerAnalysisAfterTranscript(result.callAttemptId, result.transcript);
        } else {
          stats.failed++;
          // Permanently mark calls that will never succeed to stop infinite retries
          const failedCall = callsWithoutTranscripts.find(c => c.id === result.callAttemptId);
          const batchItem = batchItems.find(b => b.callAttemptId === result.callAttemptId);
          const hasNoAudioSource = batchItem && !batchItem.recordingUrl && !batchItem.recordingS3Key && !batchItem.telnyxCallId;
          const hasOnlyTelnyxId = batchItem && !batchItem.recordingUrl && !batchItem.recordingS3Key && !!batchItem.telnyxCallId;
          const hoursSinceEnd = failedCall?.callEndedAt
            ? (Date.now() - new Date(failedCall.callEndedAt).getTime()) / (60 * 60 * 1000) : 0;

          if (hasNoAudioSource) {
            // No audio source at all (SIP calls without recordings) — mark immediately
            await db.update(dialerCallAttempts)
              .set({ fullTranscript: '[SYSTEM: Recording unavailable - no audio source]', updatedAt: new Date() })
              .where(eq(dialerCallAttempts.id, result.callAttemptId));
            markedMissing++;
          } else if (hasOnlyTelnyxId && hoursSinceEnd > 6) {
            // Only has Telnyx call ID but no recording URL/S3 key after 6 hours — recording won't appear
            await db.update(dialerCallAttempts)
              .set({ fullTranscript: '[SYSTEM: Recording unavailable - no recording for SIP call]', updatedAt: new Date() })
              .where(eq(dialerCallAttempts.id, result.callAttemptId));
            markedMissing++;
          } else if (failedCall?.callEndedAt) {
            const daysSinceEnd = (Date.now() - new Date(failedCall.callEndedAt).getTime()) / (24 * 60 * 60 * 1000);
            if (daysSinceEnd > 1) {
              await db.update(dialerCallAttempts)
                .set({ fullTranscript: '[SYSTEM: Recording unavailable - transcription failed]', updatedAt: new Date() })
                .where(eq(dialerCallAttempts.id, result.callAttemptId));
              markedMissing++;
            }
          }
        }
      }
    }

    if (skippedUploading > 0) {
      console.log(`${LOG_PREFIX} Skipped ${skippedUploading} calls with recordings still uploading`);
    }
    if (skippedTooShort > 0) {
      console.log(`${LOG_PREFIX} Skipped ${skippedTooShort} calls shorter than ${MIN_CALL_DURATION_FOR_TRANSCRIPT}s`);
    }
    if (skippedTooRecent > 0) {
      console.log(`${LOG_PREFIX} Skipped ${skippedTooRecent} long calls that ended too recently (waiting for upload)`);
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
 * For long calls (>25s), wait for recording upload to finish before attempting fallback.
 * Returns the S3 key (and therefore a usable presigned URL) once the recording is stored,
 * or null if it times out or no linked session exists.
 */
async function waitForRecordingUpload(callAttemptId: string, callDurationSec: number): Promise<string | null> {
  if (callDurationSec < LONG_CALL_DURATION_SEC) return null; // only for long calls

  try {
    const [attempt] = await db
      .select({ callSessionId: dialerCallAttempts.callSessionId })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.id, callAttemptId))
      .limit(1);

    if (!attempt?.callSessionId) return null;

    const deadline = Date.now() + LONG_CALL_UPLOAD_WAIT_MS;
    let polls = 0;

    while (Date.now() < deadline) {
      const [session] = await db
        .select({
          recordingStatus: callSessions.recordingStatus,
          recordingS3Key: callSessions.recordingS3Key,
        })
        .from(callSessions)
        .where(eq(callSessions.id, attempt.callSessionId))
        .limit(1);

      if (!session) break;

      if (session.recordingStatus === 'stored' && session.recordingS3Key) {
        console.log(`${LOG_PREFIX} ✅ Long-call recording ready for ${callAttemptId} after ${polls * (LONG_CALL_UPLOAD_POLL_MS / 1000)}s`);
        return session.recordingS3Key;
      }

      if (session.recordingStatus === 'failed') {
        console.warn(`${LOG_PREFIX} Recording failed for long call ${callAttemptId} — will still attempt Telnyx fallback`);
        break;
      }

      polls++;
      await new Promise(resolve => setTimeout(resolve, LONG_CALL_UPLOAD_POLL_MS));
    }

    console.warn(`${LOG_PREFIX} ⏰ Timed out waiting for recording upload on long call ${callAttemptId}`);
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} Error waiting for recording upload:`, err?.message);
  }

  return null;
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
      callStartedAt: dialerCallAttempts.callStartedAt,
      callEndedAt: dialerCallAttempts.callEndedAt,
      callDurationSeconds: dialerCallAttempts.callDurationSeconds,
    })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.id, callAttemptId))
    .limit(1);

  if (attempt) {
    // For long calls, wait for recording upload to finish before attempting fallback
    const callDuration = attempt.callDurationSeconds
      || (attempt.callStartedAt && attempt.callEndedAt
        ? Math.round((new Date(attempt.callEndedAt).getTime() - new Date(attempt.callStartedAt).getTime()) / 1000)
        : 0);

    if (callDuration >= LONG_CALL_DURATION_SEC) {
      console.log(`${LOG_PREFIX} 🔒 Long call detected (${callDuration}s) — waiting for recording upload before fallback`);
      await waitForRecordingUpload(callAttemptId, callDuration);
    }

    if (attempt.recordingUrl || attempt.telnyxCallId) {
      console.log(`${LOG_PREFIX} No real-time transcript - attempting fallback from recording`);
      return await attemptFallbackTranscription(callAttemptId, attempt.recordingUrl ?? null, attempt.telnyxCallId);
    }
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

/**
 * Priority cron job: Aggressively find and transcribe long calls (>25s) missing transcripts.
 *
 * This targets the most valuable missing transcripts — real conversations that should
 * never be lost. Uses multiple strategies:
 * 1. Recording URL from S3/GCS (if available)
 * 2. Telnyx phone lookup (searches by dialed number + time window)
 * 3. Telnyx call control ID lookup
 *
 * Run this on a schedule (e.g., every 10 minutes) to catch stragglers.
 */
export async function processLongCallMissingTranscripts(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  alreadyMarked: number;
}> {
  console.log(`${LOG_PREFIX} 🔒 Starting priority long-call transcript recovery (>=${LONG_CALL_DURATION_SEC}s)...`);

  const stats = { processed: 0, succeeded: 0, failed: 0, alreadyMarked: 0 };

  try {
    // Find long calls from last 7 days without valid transcripts
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Allow enough time for recording upload (5 min for long calls)
    const uploadGracePeriod = new Date(Date.now() - 5 * 60 * 1000);

    const longCallsMissingTranscripts = await db
      .select({
        id: dialerCallAttempts.id,
        recordingUrl: dialerCallAttempts.recordingUrl,
        telnyxCallId: dialerCallAttempts.telnyxCallId,
        callStartedAt: dialerCallAttempts.callStartedAt,
        callEndedAt: dialerCallAttempts.callEndedAt,
        callDurationSeconds: dialerCallAttempts.callDurationSeconds,
        fullTranscript: dialerCallAttempts.fullTranscript,
        phoneDialed: dialerCallAttempts.phoneDialed,
        callSessionId: dialerCallAttempts.callSessionId,
      })
      .from(dialerCallAttempts)
      .where(
        and(
          // Missing or system-marked transcript (not a real conversation)
          or(
            isNull(dialerCallAttempts.fullTranscript),
            sql`${dialerCallAttempts.fullTranscript} = '[PENDING_FALLBACK_TRANSCRIPTION]'`,
            sql`${dialerCallAttempts.fullTranscript} LIKE '[SYSTEM:%'`
          ),
          // Call ended before grace period
          isNotNull(dialerCallAttempts.callEndedAt),
          lt(dialerCallAttempts.callEndedAt, uploadGracePeriod),
          // Recent enough to still find recordings
          gt(dialerCallAttempts.callEndedAt, sevenDaysAgo),
          // Long call (>25s) — the valuable ones we must not lose
          or(
            gt(dialerCallAttempts.callDurationSeconds, LONG_CALL_DURATION_SEC),
            // Fallback: compute from timestamps if callDurationSeconds is null
            sql`EXTRACT(EPOCH FROM (${dialerCallAttempts.callEndedAt} - ${dialerCallAttempts.callStartedAt})) > ${LONG_CALL_DURATION_SEC}`
          )
        )
      )
      .orderBy(sql`${dialerCallAttempts.callEndedAt} DESC`)
      .limit(100); // Process up to 100 long calls per run

    console.log(`${LOG_PREFIX} 🔒 Found ${longCallsMissingTranscripts.length} long calls without transcripts`);

    // Phase 1: Build primary batch from eligible calls
    const primaryBatch: BatchTranscriptionItem[] = [];
    const callMap = new Map<string, typeof longCallsMissingTranscripts[number]>();

    for (const call of longCallsMissingTranscripts) {
      const transcript = call.fullTranscript || '';
      if (transcript.startsWith('[SYSTEM:') && !transcript.includes('No recording available')) {
        stats.alreadyMarked++;
        continue;
      }

      callMap.set(call.id, call);
      primaryBatch.push({
        callAttemptId: call.id,
        recordingUrl: call.recordingUrl ?? null,
        telnyxCallId: call.telnyxCallId ?? null,
      });
    }

    // Phase 1: Parallel batch transcription with primary URLs
    if (primaryBatch.length > 0) {
      console.log(`${LOG_PREFIX} 🔒 Phase 1: Submitting ${primaryBatch.length} long calls to parallel pool`);
      const primaryResults = await transcribeBatchParallel(primaryBatch, 8, 300);

      // Save successful results, collect failures for Phase 2
      const failedCallIds: string[] = [];
      for (const result of primaryResults) {
        stats.processed++;
        if (result.success && result.transcript) {
          stats.succeeded++;
          await db.update(dialerCallAttempts)
            .set({ fullTranscript: result.transcript, updatedAt: new Date() })
            .where(eq(dialerCallAttempts.id, result.callAttemptId));
            await triggerAnalysisAfterTranscript(result.callAttemptId, result.transcript);
          console.log(`${LOG_PREFIX} 🔒 ✅ Long call ${result.callAttemptId} transcribed (${result.provider})`);
        } else {
          failedCallIds.push(result.callAttemptId);
        }
      }

      // Phase 2: Retry failed calls with alternative strategies (S3 key, phone lookup)
      if (failedCallIds.length > 0) {
        console.log(`${LOG_PREFIX} 🔒 Phase 2: Retrying ${failedCallIds.length} failed calls with alternative strategies`);
        const retryBatch: BatchTranscriptionItem[] = [];

        for (const callId of failedCallIds) {
          const call = callMap.get(callId);
          if (!call) continue;

          let altUrl: string | null = null;
          let altTelnyxId: string | null = call.telnyxCallId ?? null;

          // Strategy 2: Try S3 key from linked session
          if (call.callSessionId) {
            try {
              const [session] = await db
                .select({
                  recordingS3Key: callSessions.recordingS3Key,
                  recordingUrl: callSessions.recordingUrl,
                })
                .from(callSessions)
                .where(eq(callSessions.id, call.callSessionId))
                .limit(1);

              if (session?.recordingUrl) {
                altUrl = session.recordingUrl;
              }
            } catch { /* Non-critical */ }
          }

          // Strategy 3: Telnyx phone lookup
          if (!altUrl && call.phoneDialed && call.callStartedAt) {
            try {
              const { searchRecordingsByDialedNumber } = await import('./telnyx-recordings');
              const searchStart = new Date(call.callStartedAt);
              searchStart.setMinutes(searchStart.getMinutes() - 30);
              const searchEnd = new Date(call.callEndedAt || call.callStartedAt);
              searchEnd.setMinutes(searchEnd.getMinutes() + 30);

              const recordings = await searchRecordingsByDialedNumber(call.phoneDialed, searchStart, searchEnd);
              const completed = recordings.find((r: any) => r.status === 'completed');
              if (completed) {
                const downloadUrl = completed.download_urls?.mp3 || completed.download_urls?.wav;
                if (downloadUrl) {
                  altUrl = downloadUrl;
                  altTelnyxId = completed.call_control_id || altTelnyxId;
                }
              }
            } catch (err: any) {
              console.warn(`${LOG_PREFIX} Phone lookup failed for ${callId}:`, err?.message);
            }
          }

          if (altUrl) {
            retryBatch.push({
              callAttemptId: callId,
              recordingUrl: altUrl,
              telnyxCallId: altTelnyxId,
            });
          } else {
            stats.failed++;
          }
        }

        // Process retry batch in parallel
        if (retryBatch.length > 0) {
          const retryResults = await transcribeBatchParallel(retryBatch, 5, 500);
          for (const result of retryResults) {
            if (result.success && result.transcript) {
              stats.succeeded++;
              await db.update(dialerCallAttempts)
                .set({ fullTranscript: result.transcript, updatedAt: new Date() })
                .where(eq(dialerCallAttempts.id, result.callAttemptId));
              await triggerAnalysisAfterTranscript(result.callAttemptId, result.transcript);
              console.log(`${LOG_PREFIX} 🔒 ✅ Long call ${result.callAttemptId} transcribed on retry (${result.provider})`);
            } else {
              stats.failed++;
            }
          }
        }
      }
    }

    console.log(`${LOG_PREFIX} 🔒 Long-call recovery complete: ${stats.processed} processed, ${stats.succeeded} succeeded, ${stats.failed} failed, ${stats.alreadyMarked} already marked`);
    return stats;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error in long-call recovery:`, error);
    return stats;
  }
}

export default {
  checkTranscriptStatus,
  attemptFallbackTranscription,
  processMissingTranscripts,
  processLongCallMissingTranscripts,
  verifyTranscriptQuality,
  getTranscriptionStats,
  ensureTranscript,
  markForBackgroundTranscription,
};
