/**
 * Google Cloud Speech-to-Text Transcription Service
 *
 * Uses Google's telephony-optimized model for best accuracy on phone call recordings.
 * Features:
 * - Telephony model (optimized for 8kHz phone audio)
 * - Speaker diarization (separates AI agent vs prospect)
 * - Automatic punctuation
 * - Native GCP integration (uses Cloud Run service account)
 */

import { db } from "../db";
import { leads, activityLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { SpeechClient, protos } from "@google-cloud/speech";

// Lazy initialization of Speech client
let _speechClient: SpeechClient | null = null;

function getSpeechClient(): SpeechClient {
  if (!_speechClient) {
    _speechClient = new SpeechClient();
  }
  return _speechClient;
}

// Type aliases for readability
type RecognitionConfig = protos.google.cloud.speech.v1.IRecognitionConfig;
type RecognitionAudio = protos.google.cloud.speech.v1.IRecognitionAudio;

interface TranscriptionResult {
  text: string;
  confidence: number;
  wordCount: number;
  speakerCount?: number;
  durationSeconds?: number;
}

/**
 * Download audio from URL and convert to base64
 */
async function downloadAudio(audioUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      console.error('[Transcription] Failed to download audio:', response.statusText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Detect mime type from URL or content-type header
    const contentType = response.headers.get('content-type') || '';
    let mimeType = 'audio/mpeg'; // default

    if (contentType.includes('wav')) {
      mimeType = 'audio/wav';
    } else if (contentType.includes('mp3') || contentType.includes('mpeg')) {
      mimeType = 'audio/mpeg';
    } else if (contentType.includes('ogg')) {
      mimeType = 'audio/ogg';
    } else if (contentType.includes('flac')) {
      mimeType = 'audio/flac';
    } else if (audioUrl.includes('.wav')) {
      mimeType = 'audio/wav';
    } else if (audioUrl.includes('.mp3')) {
      mimeType = 'audio/mpeg';
    }

    return { base64, mimeType };
  } catch (error) {
    console.error('[Transcription] Error downloading audio:', error);
    return null;
  }
}

/**
 * Get encoding type from mime type
 */
function getEncodingFromMimeType(mimeType: string): protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding {
  const AudioEncoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

  switch (mimeType) {
    case 'audio/wav':
    case 'audio/wave':
      return AudioEncoding.LINEAR16;
    case 'audio/flac':
      return AudioEncoding.FLAC;
    case 'audio/ogg':
      return AudioEncoding.OGG_OPUS;
    case 'audio/mpeg':
    case 'audio/mp3':
    default:
      return AudioEncoding.MP3;
  }
}

/**
 * Submit audio to Google Speech-to-Text for transcription
 */
export async function submitTranscription(audioUrl: string): Promise<string | null> {
  try {
    const client = getSpeechClient();

    // Download audio file
    const audioData = await downloadAudio(audioUrl);
    if (!audioData) {
      return null;
    }

    console.log(`[Transcription] 🎤 Using Google Speech-to-Text (telephony model) | Audio type: ${audioData.mimeType}`);

    // Configure recognition for phone call audio
    const config: RecognitionConfig = {
      // Use telephony model optimized for phone audio
      model: 'telephony',
      // Auto-detect language, primarily English
      languageCode: 'en-US',
      // Alternative languages for mixed conversations
      alternativeLanguageCodes: ['en-GB'],
      // Audio encoding based on file type
      encoding: getEncodingFromMimeType(audioData.mimeType),
      // Sample rate - let Google auto-detect for telephony
      sampleRateHertz: audioData.mimeType === 'audio/wav' ? 8000 : undefined,
      // Enable automatic punctuation
      enableAutomaticPunctuation: true,
      // Enable word-level confidence
      enableWordConfidence: true,
      // Enable speaker diarization (separate AI agent from prospect)
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 2,
      },
      // Use enhanced model for better accuracy
      useEnhanced: true,
      // Enable profanity filter (optional, can be disabled)
      profanityFilter: false,
    };

    const audio: RecognitionAudio = {
      content: audioData.base64,
    };

    // For longer audio files (>1 min), use longRunningRecognize
    // For shorter files, use synchronous recognize
    const audioSizeBytes = Buffer.from(audioData.base64, 'base64').length;
    const estimatedDurationSeconds = audioSizeBytes / (8000 * 2); // Rough estimate for 8kHz mono

    let transcriptText: string;
    let confidence: number = 0;

    if (estimatedDurationSeconds > 60) {
      // Use async long-running recognition for longer audio
      console.log(`[Transcription] Using long-running recognition (estimated ${Math.round(estimatedDurationSeconds)}s)`);

      const [operation] = await client.longRunningRecognize({ config, audio });
      const [response] = await operation.promise();

      if (!response.results || response.results.length === 0) {
        console.error('[Transcription] No results from Google Speech-to-Text');
        return null;
      }

      // Combine all results
      transcriptText = response.results
        .map(result => result.alternatives?.[0]?.transcript || '')
        .join(' ')
        .trim();

      // Calculate average confidence
      const confidences = response.results
        .map(result => result.alternatives?.[0]?.confidence || 0)
        .filter(c => c > 0);
      confidence = confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

    } else {
      // Use synchronous recognition for shorter audio
      console.log(`[Transcription] Using synchronous recognition (estimated ${Math.round(estimatedDurationSeconds)}s)`);

      const [response] = await client.recognize({ config, audio });

      if (!response.results || response.results.length === 0) {
        console.error('[Transcription] No results from Google Speech-to-Text');
        return null;
      }

      // Combine all results
      transcriptText = response.results
        .map(result => result.alternatives?.[0]?.transcript || '')
        .join(' ')
        .trim();

      // Calculate average confidence
      const confidences = response.results
        .map(result => result.alternatives?.[0]?.confidence || 0)
        .filter(c => c > 0);
      confidence = confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;
    }

    if (!transcriptText) {
      console.error('[Transcription] Empty transcript returned');
      return null;
    }

    console.log(`[Transcription] ✅ Google STT completed | Confidence: ${(confidence * 100).toFixed(1)}% | Length: ${transcriptText.length} chars`);
    return transcriptText;

  } catch (error) {
    console.error('[Transcription] Error with Google Speech-to-Text:', error);
    return null;
  }
}

/**
 * Transcribe call recording for a lead using Google Speech-to-Text
 */
export async function transcribeLeadCall(leadId: string): Promise<boolean> {
  const startTime = Date.now();

  try {
    // Get lead data
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);

    if (!lead || !lead.recordingUrl) {
      console.log('[Transcription] ⚠️ No recording URL for lead:', leadId);
      return false;
    }

    // Log transcription started
    console.log(`[Transcription] 🎙️ STARTED: Lead ${leadId} | Recording: ${lead.recordingUrl.substring(0, 50)}...`);

    // Update status to processing
    await db.update(leads)
      .set({ transcriptionStatus: 'processing' })
      .where(eq(leads.id, leadId));

    // Insert activity log for transcription started
    try {
      await db.insert(activityLog).values({
        entityType: 'lead',
        entityId: leadId,
        eventType: 'transcription_started',
        payload: {
          recordingUrl: lead.recordingUrl,
          campaignId: lead.campaignId,
          contactId: lead.contactId,
          provider: 'google-speech-to-text',
        },
        createdBy: null,
      });
    } catch (logErr) {
      console.error('[Transcription] Failed to log transcription_started:', logErr);
    }

    // Submit for transcription using Google Speech-to-Text
    const transcriptText = await submitTranscription(lead.recordingUrl);
    const duration = Date.now() - startTime;

    if (!transcriptText) {
      console.error(`[Transcription] ❌ FAILED: Lead ${leadId} | Duration: ${duration}ms | No transcript returned`);

      await db.update(leads)
        .set({ transcriptionStatus: 'failed' })
        .where(eq(leads.id, leadId));

      // Insert activity log for transcription failed
      try {
        await db.insert(activityLog).values({
          entityType: 'lead',
          entityId: leadId,
          eventType: 'transcription_failed',
          payload: {
            recordingUrl: lead.recordingUrl,
            campaignId: lead.campaignId,
            contactId: lead.contactId,
            durationMs: duration,
            provider: 'google-speech-to-text',
            error: 'No transcript returned from Google Speech-to-Text',
          },
          createdBy: null,
        });
      } catch (logErr) {
        console.error('[Transcription] Failed to log transcription_failed:', logErr);
      }

      return false;
    }

    // Save transcript
    await db.update(leads)
      .set({
        transcript: transcriptText,
        transcriptionStatus: 'completed',
      })
      .where(eq(leads.id, leadId));

    const wordCount = transcriptText.split(/\s+/).length;
    console.log(`[Transcription] ✅ COMPLETED: Lead ${leadId} | Duration: ${duration}ms | Words: ${wordCount}`);

    // Insert activity log for transcription completed
    try {
      await db.insert(activityLog).values({
        entityType: 'lead',
        entityId: leadId,
        eventType: 'transcription_completed',
        payload: {
          recordingUrl: lead.recordingUrl,
          campaignId: lead.campaignId,
          contactId: lead.contactId,
          durationMs: duration,
          wordCount: wordCount,
          transcriptLength: transcriptText.length,
          provider: 'google-speech-to-text',
        },
        createdBy: null,
      });
    } catch (logErr) {
      console.error('[Transcription] Failed to log transcription_completed:', logErr);
    }

    return true;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[Transcription] ❌ ERROR: Lead ${leadId} | Duration: ${duration}ms | Error: ${errorMessage}`);

    await db.update(leads)
      .set({ transcriptionStatus: 'failed' })
      .where(eq(leads.id, leadId))
      .catch(() => {}); // Ignore if update fails

    // Insert activity log for transcription failed
    try {
      await db.insert(activityLog).values({
        entityType: 'lead',
        entityId: leadId,
        eventType: 'transcription_failed',
        payload: {
          durationMs: duration,
          error: errorMessage,
          provider: 'google-speech-to-text',
        },
        createdBy: null,
      });
    } catch (logErr) {
      // Ignore logging errors
    }

    return false;
  }
}

/**
 * Background job to process pending transcriptions
 */
export async function processPendingTranscriptions(): Promise<void> {
  try {
    const pendingLeads = await db.select()
      .from(leads)
      .where(eq(leads.transcriptionStatus, 'pending'))
      .limit(10);

    if (pendingLeads.length > 0) {
      console.log(`[Transcription] Processing ${pendingLeads.length} pending transcriptions with Google Speech-to-Text`);
    }

    for (const lead of pendingLeads) {
      await transcribeLeadCall(lead.id);
    }
  } catch (error) {
    console.error('[Transcription] Error processing pending transcriptions:', error);
  }
}
