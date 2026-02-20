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
import { leads, activityLog, callSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { SpeechClient, protos } from "@google-cloud/speech";
import { getPresignedDownloadUrl, isS3Configured } from "../lib/storage";

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

export interface TranscriptionAudioSourceOptions {
  telnyxCallId?: string | null;
  recordingS3Key?: string | null;
  throwOnError?: boolean;
}

function redactUrlForLogs(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const safePath = u.pathname.length > 120 ? `${u.pathname.slice(0, 120)}…` : u.pathname;
    return `${u.protocol}//${u.host}${safePath}`;
  } catch {
    return rawUrl.length > 160 ? `${rawUrl.slice(0, 160)}…` : rawUrl;
  }
}

async function fetchAudio(url: string): Promise<Response> {
  // Keep timeouts bounded so background jobs don't hang indefinitely
  const timeoutMs = 45000;
  const signal = typeof (AbortSignal as any)?.timeout === 'function'
    ? (AbortSignal as any).timeout(timeoutMs)
    : (() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeoutMs);
        return controller.signal;
      })();

  return await fetch(url, {
    redirect: 'follow',
    signal,
    headers: {
      // Some CDNs behave differently without an Accept header
      'accept': 'audio/*,application/octet-stream;q=0.9,*/*;q=0.8',
    },
  });
}

/**
 * Download audio from URL and convert to base64
 */
async function downloadAudio(
  audioUrl: string,
  options?: TranscriptionAudioSourceOptions
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // Handle gcs-internal:// URLs by reading directly from GCS
    if (audioUrl.startsWith('gcs-internal://')) {
      const gcsKey = audioUrl.replace(/^gcs-internal:\/\/[^/]+\//, '');
      console.log(`[Transcription] Reading audio directly from GCS | key=${gcsKey}`);
      try {
        const { readFromGCS } = await import('../lib/storage');
        const { stream, contentType } = await readFromGCS(gcsKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const mimeType = contentType.includes('wav') ? 'audio/wav'
          : contentType.includes('ogg') ? 'audio/ogg'
          : contentType.includes('flac') ? 'audio/flac'
          : 'audio/mpeg';
        console.log(`[Transcription] GCS direct read complete | size=${buffer.length} bytes | type=${mimeType}`);
        return { base64, mimeType };
      } catch (gcsErr: any) {
        console.error(`[Transcription] Failed to read from GCS: ${gcsErr.message}`);
        if (options?.throwOnError) throw gcsErr;
        return null;
      }
    }

    let response = await fetchAudio(audioUrl);

    // If this is an expired/signed URL, try to refresh via storage (preferred) or Telnyx call id.
    if ((response.status === 401 || response.status === 403) && (options?.recordingS3Key || options?.telnyxCallId)) {
      const safeUrl = redactUrlForLogs(audioUrl);
      console.warn(`[Transcription] Audio download unauthorized (${response.status} ${response.statusText}) | url=${safeUrl}`);

      // 1) Prefer the permanent copy if we have it.
      if (options?.recordingS3Key && isS3Configured()) {
        try {
          // Use 24-hour TTL for transcription URLs (jobs may queue/retry for hours)
          const TTL_24_HOURS = 24 * 60 * 60;
          const presigned = await getPresignedDownloadUrl(options.recordingS3Key, TTL_24_HOURS);
          // If signBlob is unavailable, presigned will be gcs-internal:// — read directly from GCS
          if (presigned.startsWith('gcs-internal://')) {
            const gcsResult = await downloadAudio(presigned, { throwOnError: true });
            if (gcsResult) return gcsResult;
          } else {
            response = await fetchAudio(presigned);
            if (response.ok) {
              console.log(`[Transcription] Using refreshed GCS URL | key=${options.recordingS3Key}`);
            }
          }
        } catch (e) {
          console.warn('[Transcription] Failed to refresh audio via GCS presigned URL:', e);
        }
      }

      // 2) If still not OK, try to fetch a fresh Telnyx download URL.
      if (!response.ok && options?.telnyxCallId) {
        try {
          const { fetchTelnyxRecording } = await import('./telnyx-recordings');
          const refreshedUrl = await fetchTelnyxRecording(options.telnyxCallId);
          if (refreshedUrl) {
            response = await fetchAudio(refreshedUrl);
            if (response.ok) {
              console.log(`[Transcription] Using refreshed Telnyx recording URL | callId=${options.telnyxCallId}`);
            }
          }
        } catch (e) {
          console.warn('[Transcription] Failed to refresh audio via Telnyx API:', e);
        }
      }
    }

    if (!response.ok) {
      const safeUrl = redactUrlForLogs(audioUrl);
      const errorBody = await response.text().then(t => t.slice(0, 300)).catch(() => '');
      const errorMessage = `[Transcription] Failed to download audio: ${response.status} ${response.statusText} | url=${safeUrl}${errorBody ? ` | body=${JSON.stringify(errorBody)}` : ''}`;
      
      console.error(errorMessage);
      
      if (options?.throwOnError) {
        throw new Error(errorMessage);
      }
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
    if (options?.throwOnError) {
      throw error;
    }
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

function getWavChannelCount(base64: string): number | null {
  try {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length < 44) {
      return null;
    }

    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
      return null;
    }

    const channels = buffer.readUInt16LE(22);
    return channels > 0 ? channels : null;
  } catch {
    return null;
  }
}

/**
 * Submit audio to Google Speech-to-Text for transcription
 */
export async function submitTranscription(
  audioUrl: string,
  options?: TranscriptionAudioSourceOptions
): Promise<string | null> {
  try {
    const client = getSpeechClient();

    // Download audio file
    const audioData = await downloadAudio(audioUrl, options);
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

    if (audioData.mimeType === 'audio/wav') {
      const wavChannels = getWavChannelCount(audioData.base64);
      if (wavChannels) {
        config.audioChannelCount = wavChannels;
        config.enableSeparateRecognitionPerChannel = wavChannels > 1;
      }
    }

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
    if (options?.throwOnError) {
      throw error;
    }
    console.error('[Transcription] Error with Google Speech-to-Text:', error);
    return null;
  }
}

/**
 * Transcribe a recording URL and return a structured result
 * Used by transcription-reliability fallback.
 */
export async function transcribeFromRecording(
  recordingUrl: string,
  options?: TranscriptionAudioSourceOptions
): Promise<{ transcript: string; wordCount: number } | null> {
  // If we have a direct GCS URI, use long-running recognition with URI to bypass inline limits.
  if (recordingUrl.startsWith('gs://')) {
    try {
      const client = getSpeechClient();
      const config: RecognitionConfig = {
        model: 'telephony',
        languageCode: 'en-US',
        alternativeLanguageCodes: ['en-GB'],
        enableAutomaticPunctuation: true,
        enableWordConfidence: true,
        diarizationConfig: {
          enableSpeakerDiarization: true,
          minSpeakerCount: 2,
          maxSpeakerCount: 2,
        },
        useEnhanced: true,
      };
      const audio: RecognitionAudio = { uri: recordingUrl };
      const [operation] = await client.longRunningRecognize({ config, audio });
      const [response] = await operation.promise();
      if (!response.results || response.results.length === 0) return null;
      const transcriptText = response.results
        .map(result => result.alternatives?.[0]?.transcript || '')
        .join(' ')
        .trim();
      return {
        transcript: transcriptText,
        wordCount: transcriptText.split(/\s+/).length,
      };
    } catch (error) {
      if (options?.throwOnError) throw error;
      console.error('[Transcription] Error with GCS URI transcription:', error);
      return null;
    }
  }

  // Use throwOnError to ensure reliability service can detect permanent errors (like 403)
  const transcript = await submitTranscription(recordingUrl, { ...options, throwOnError: true });
  if (!transcript) return null;
  return {
    transcript,
    wordCount: transcript.split(/\s+/).length,
  };
}

async function submitTranscriptionWithOptions(
  audioUrl: string,
  options?: TranscriptionAudioSourceOptions
): Promise<string | null> {
  try {
    const client = getSpeechClient();

    const audioData = await downloadAudio(audioUrl, options);
    if (!audioData) {
      return null;
    }

    console.log(`[Transcription] 🎤 Using Google Speech-to-Text (telephony model) | Audio type: ${audioData.mimeType}`);

    const config: RecognitionConfig = {
      model: 'telephony',
      languageCode: 'en-US',
      alternativeLanguageCodes: ['en-GB'],
      encoding: getEncodingFromMimeType(audioData.mimeType),
      sampleRateHertz: audioData.mimeType === 'audio/wav' ? 8000 : undefined,
      enableAutomaticPunctuation: true,
      enableWordConfidence: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 2,
      },
      useEnhanced: true,
      profanityFilter: false,
    };

    if (audioData.mimeType === 'audio/wav') {
      const wavChannels = getWavChannelCount(audioData.base64);
      if (wavChannels) {
        config.audioChannelCount = wavChannels;
        config.enableSeparateRecognitionPerChannel = wavChannels > 1;
      }
    }

    const audio: RecognitionAudio = { content: audioData.base64 };

    const audioSizeBytes = Buffer.from(audioData.base64, 'base64').length;
    const estimatedDurationSeconds = audioSizeBytes / (8000 * 2);

    let transcriptText: string;
    let confidence: number = 0;

    if (estimatedDurationSeconds > 60) {
      console.log(`[Transcription] Using long-running recognition (estimated ${Math.round(estimatedDurationSeconds)}s)`);
      const [operation] = await client.longRunningRecognize({ config, audio });
      const [response] = await operation.promise();

      if (!response.results || response.results.length === 0) {
        console.error('[Transcription] No results from Google Speech-to-Text');
        return null;
      }

      transcriptText = response.results
        .map(result => result.alternatives?.[0]?.transcript || '')
        .join(' ')
        .trim();

      const confidences = response.results
        .map(result => result.alternatives?.[0]?.confidence || 0)
        .filter(c => c > 0);
      confidence = confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;
    } else {
      console.log(`[Transcription] Using synchronous recognition (estimated ${Math.round(estimatedDurationSeconds)}s)`);
      const [response] = await client.recognize({ config, audio });

      if (!response.results || response.results.length === 0) {
        console.error('[Transcription] No results from Google Speech-to-Text');
        return null;
      }

      transcriptText = response.results
        .map(result => result.alternatives?.[0]?.transcript || '')
        .join(' ')
        .trim();

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

    if (!lead || (!lead.recordingUrl && !lead.recordingS3Key)) {
      console.log('[Transcription] ⚠️ No recording URL for lead:', leadId);
      return false;
    }

    const audioUrl = lead.recordingUrl || (lead.recordingS3Key ? await getPresignedDownloadUrl(lead.recordingS3Key, 24 * 60 * 60) : null);
    if (!audioUrl) {
      console.log('[Transcription] No usable audio URL for lead:', leadId);
      return false;
    }

    // Log transcription started
    console.log(`[Transcription] 🎙️ STARTED: Lead ${leadId} | Recording: ${audioUrl.substring(0, 50)}...`);

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
    const transcriptText = await submitTranscription(audioUrl, {
      telnyxCallId: lead.telnyxCallId,
      recordingS3Key: lead.recordingS3Key,
    });
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

export interface StructuredTranscript {
  text: string;
  utterances: Array<{
    speaker: string;
    channelTag?: number;
    text: string;
    start: number;
    end: number;
  }>;
}

/**
 * Submit audio to Google Speech-to-Text and return structured transcript with speaker diarization
 */
export async function submitStructuredTranscription(
  audioUrl: string,
  options?: TranscriptionAudioSourceOptions
): Promise<StructuredTranscript | null> {
  try {
    const client = getSpeechClient();

    // If we have a direct GCS URI, avoid downloading and use long-running with URI to bypass inline size limits
    const isGcsUri = audioUrl.startsWith('gs://');

    let audioData: { base64: string; mimeType: string } | null = null;
    let wavChannels: number | null = null;
    let config: RecognitionConfig | null = null;
    let audio: RecognitionAudio;

    if (isGcsUri) {
      console.log(`[Transcription] 🎤 Using GCS URI for structured transcription: ${audioUrl}`);
      config = {
        model: 'telephony',
        languageCode: 'en-US',
        alternativeLanguageCodes: ['en-GB'],
        enableAutomaticPunctuation: true,
        enableWordConfidence: true,
        diarizationConfig: {
          enableSpeakerDiarization: true,
          minSpeakerCount: 2,
          maxSpeakerCount: 2,
        },
        useEnhanced: true,
      };
      audio = { uri: audioUrl };
    } else {
      // Download audio file
      audioData = await downloadAudio(audioUrl, options);
      if (!audioData) {
        return null;
      }

      console.log(`[Transcription] 🎤 Starting structured transcription | Audio type: ${audioData.mimeType}`);

      const useChannelSeparation = audioData.mimeType === 'audio/wav';
      wavChannels = useChannelSeparation ? getWavChannelCount(audioData.base64) : null;

      config = {
        model: 'telephony',
        languageCode: 'en-US',
        alternativeLanguageCodes: ['en-GB'],
        encoding: getEncodingFromMimeType(audioData.mimeType),
        sampleRateHertz: audioData.mimeType === 'audio/wav' ? 8000 : undefined,
        enableAutomaticPunctuation: true,
        enableWordConfidence: true,
        // For true stereo WAV, prefer channel separation (deterministic left/right).
        // For non-stereo or unknown channel count, fall back to diarization.
        diarizationConfig: wavChannels && wavChannels > 1 ? undefined : {
          enableSpeakerDiarization: true,
          minSpeakerCount: 2,
          maxSpeakerCount: 2,
        },
        useEnhanced: true,
      };

      if (wavChannels) {
        config.audioChannelCount = wavChannels;
        config.enableSeparateRecognitionPerChannel = wavChannels > 1;
      }

      audio = { content: audioData.base64 };
    }

    let results: protos.google.cloud.speech.v1.ISpeechRecognitionResult[] = [];

    // Decide path: use long-running if GCS URI or estimated >60s
    const useLongRunning =
      isGcsUri ||
      (() => {
        if (!audioData) return true; // GCS path already handled
        const audioSizeBytes = Buffer.from(audioData.base64, 'base64').length;
        const estimatedDurationSeconds = audioSizeBytes / (8000 * 2);
        return estimatedDurationSeconds > 60;
      })();

    if (useLongRunning) {
      console.log(`[Transcription] Using long-running recognition${isGcsUri ? ' (GCS URI)' : ''}`);
      const [operation] = await client.longRunningRecognize({ config: config!, audio });
      const [response] = await operation.promise();
      results = response.results || [];
    } else {
      const audioSizeBytes = Buffer.from(audioData!.base64, 'base64').length;
      const estimatedDurationSeconds = audioSizeBytes / (8000 * 2);
      console.log(`[Transcription] Using synchronous recognition (estimated ${Math.round(estimatedDurationSeconds)}s)`);
      const [response] = await client.recognize({ config: config!, audio });
      results = response.results || [];
    }

    if (results.length === 0) {
      console.error('[Transcription] No results from Google Speech-to-Text');
      return null;
    }

    const getSeconds = (time: any): number => {
      if (!time) return 0;
      if (typeof time === 'number') return time;
      const s = parseInt((time.seconds || 0).toString());
      const n = parseInt((time.nanos || 0).toString());
      return s + n / 1e9;
    };
    const hasChannelResults = results.some(r => typeof r.channelTag === 'number' && Number(r.channelTag) > 0);

    if (hasChannelResults) {
      const channelUtterances = results
        .map((result, idx) => {
          const alt = result.alternatives?.[0];
          const text = (alt?.transcript || '').trim();
          if (!text) return null;

          const words = alt?.words || [];
          const start = words.length > 0 ? getSeconds(words[0].startTime) : idx;
          const end = words.length > 0 ? getSeconds(words[words.length - 1].endTime) : start;
          const channelTag = typeof result.channelTag === 'number' ? Number(result.channelTag) : undefined;

          return {
            speaker: channelTag ? `Channel ${channelTag}` : 'Speaker 1',
            channelTag,
            text,
            start,
            end,
          };
        })
        .filter((u): u is NonNullable<typeof u> => !!u)
        .sort((a, b) => a.start - b.start);

      const fullTranscript = channelUtterances.map(u => u.text).join(' ').trim();
      console.log(`[Transcription] ✅ Structured transcription completed (channel mode) | ${channelUtterances.length} utterances`);
      return {
        text: fullTranscript,
        utterances: channelUtterances,
      };
    }

    // Fallback: speaker diarization mode
    const fullTranscript = results
      .map(result => result.alternatives?.[0]?.transcript || '')
      .join(' ')
      .trim();

    const words = results.flatMap(result => result.alternatives?.[0]?.words || []);
    const utterances: StructuredTranscript['utterances'] = [];
    let currentSpeakerMs = -1;
    let currentUtteranceWords: protos.google.cloud.speech.v1.IWordInfo[] = [];

    for (const word of words) {
      const spk = word.speakerTag || 1;

      if (spk !== currentSpeakerMs && currentSpeakerMs !== -1) {
        if (currentUtteranceWords.length > 0) {
          utterances.push({
            speaker: `Speaker ${currentSpeakerMs}`,
            text: currentUtteranceWords.map(w => w.word).join(' '),
            start: getSeconds(currentUtteranceWords[0].startTime),
            end: getSeconds(currentUtteranceWords[currentUtteranceWords.length - 1].endTime)
          });
        }
        currentUtteranceWords = [];
      }
      currentSpeakerMs = spk;
      currentUtteranceWords.push(word);
    }

    if (currentUtteranceWords.length > 0) {
      utterances.push({
        speaker: `Speaker ${currentSpeakerMs}`,
        text: currentUtteranceWords.map(w => w.word).join(' '),
        start: getSeconds(currentUtteranceWords[0].startTime),
        end: getSeconds(currentUtteranceWords[currentUtteranceWords.length - 1].endTime)
      });
    }

    console.log(`[Transcription] ✅ Structured transcription completed (diarization mode) | ${utterances.length} utterances`);
    return { text: fullTranscript, utterances };

  } catch (error) {
    console.error('[Transcription] Error with structured transcription:', error);
    return null;
  }
}

/**
 * Transcribe call session using Google Speech-to-Text
 */
export async function transcribeCallSession(callSessionId: string): Promise<boolean> {
  const startTime = Date.now();

  try {
    // Get call data
    const [call] = await db.select().from(callSessions).where(eq(callSessions.id, callSessionId)).limit(1);

    if (!call || (!call.recordingUrl && !call.recordingS3Key)) {
      console.log('[Transcription] ⚠️ No recording URL for call session:', callSessionId);
      return false;
    }

    const audioUrl = call.recordingUrl || (call.recordingS3Key ? await getPresignedDownloadUrl(call.recordingS3Key, 24 * 60 * 60) : null);
    if (!audioUrl) {
      console.log('[Transcription] No usable audio URL for call session:', callSessionId);
      return false;
    }

    // Log transcription started
    console.log(`[Transcription] 🎙️ STARTED: Call ${callSessionId} | Recording: ${audioUrl.substring(0, 50)}...`);

    // Submit for structured transcription using Google Speech-to-Text
    const structuredResult = await submitStructuredTranscription(audioUrl, {
      telnyxCallId: call.telnyxCallId,
      recordingS3Key: call.recordingS3Key,
    });
    const duration = Date.now() - startTime;

    if (!structuredResult) {
      console.error(`[Transcription] ❌ FAILED: Call ${callSessionId} | Duration: ${duration}ms | No transcript returned`);
      return false;
    }

    // Save transcript to call_sessions table
    // Columns: aiTranscript (text), aiAnalysis (jsonb)
    await db.update(callSessions)
      .set({
        aiTranscript: structuredResult.text,
        aiAnalysis: {
          utterances: structuredResult.utterances,
          provider: 'google-vertex-stt',
          transcribedAt: new Date().toISOString(),
          durationMs: duration
        }
      })
      .where(eq(callSessions.id, callSessionId));

    const wordCount = structuredResult.text.split(/\s+/).length;
    console.log(`[Transcription] ✅ COMPLETED: Call ${callSessionId} | Duration: ${duration}ms | Words: ${wordCount}`);

    return true;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[Transcription] ❌ ERROR: Call ${callSessionId} | Duration: ${duration}ms | Error: ${errorMessage}`);
    return false;
  }
}

async function submitStructuredTranscriptionWithOptions(
  audioUrl: string,
  options?: TranscriptionAudioSourceOptions
): Promise<StructuredTranscript | null> {
  try {
    const client = getSpeechClient();

    const audioData = await downloadAudio(audioUrl, options);
    if (!audioData) {
      return null;
    }

    console.log(`[Transcription] 🎤 Starting structured transcription | Audio type: ${audioData.mimeType}`);

    const config: RecognitionConfig = {
      model: 'telephony',
      languageCode: 'en-US',
      alternativeLanguageCodes: ['en-GB'],
      encoding: getEncodingFromMimeType(audioData.mimeType),
      sampleRateHertz: audioData.mimeType === 'audio/wav' ? 8000 : undefined,
      enableAutomaticPunctuation: true,
      enableWordConfidence: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 2,
      },
      useEnhanced: true,
    };

    if (audioData.mimeType === 'audio/wav') {
      const wavChannels = getWavChannelCount(audioData.base64);
      if (wavChannels) {
        config.audioChannelCount = wavChannels;
        config.enableSeparateRecognitionPerChannel = wavChannels > 1;
      }
    }

    const audio: RecognitionAudio = { content: audioData.base64 };

    const audioSizeBytes = Buffer.from(audioData.base64, 'base64').length;
    const estimatedDurationSeconds = audioSizeBytes / (8000 * 2);

    let results: protos.google.cloud.speech.v1.ISpeechRecognitionResult[] = [];

    if (estimatedDurationSeconds > 60) {
      console.log(`[Transcription] Using long-running recognition (estimated ${Math.round(estimatedDurationSeconds)}s)`);
      const [operation] = await client.longRunningRecognize({ config, audio });
      const [response] = await operation.promise();
      results = response.results || [];
    } else {
      console.log(`[Transcription] Using synchronous recognition (estimated ${Math.round(estimatedDurationSeconds)}s)`);
      const [response] = await client.recognize({ config, audio });
      results = response.results || [];
    }

    if (results.length === 0) {
      console.error('[Transcription] No results from Google Speech-to-Text');
      return null;
    }

    const fullTranscript = results
      .map(result => result.alternatives?.[0]?.transcript || '')
      .join(' ')
      .trim();

    const words = results.flatMap(result => result.alternatives?.[0]?.words || []);

    const utterances: StructuredTranscript['utterances'] = [];
    let currentSpeakerMs = -1;
    let currentUtteranceWords: protos.google.cloud.speech.v1.IWordInfo[] = [];

    const getSeconds = (time: any): number => {
      if (!time) return 0;
      if (typeof time === 'number') return time;
      const s = parseInt((time.seconds || 0).toString());
      const n = parseInt((time.nanos || 0).toString());
      return s + n / 1e9;
    };

    for (const word of words) {
      const spk = word.speakerTag || 1;

      if (spk !== currentSpeakerMs && currentSpeakerMs !== -1) {
        if (currentUtteranceWords.length > 0) {
          utterances.push({
            speaker: `Speaker ${currentSpeakerMs}`,
            text: currentUtteranceWords.map(w => w.word).join(' '),
            start: getSeconds(currentUtteranceWords[0].startTime),
            end: getSeconds(currentUtteranceWords[currentUtteranceWords.length - 1].endTime)
          });
        }
        currentUtteranceWords = [];
      }
      currentSpeakerMs = spk;
      currentUtteranceWords.push(word);
    }

    if (currentUtteranceWords.length > 0) {
      utterances.push({
        speaker: `Speaker ${currentSpeakerMs}`,
        text: currentUtteranceWords.map(w => w.word).join(' '),
        start: getSeconds(currentUtteranceWords[0].startTime),
        end: getSeconds(currentUtteranceWords[currentUtteranceWords.length - 1].endTime)
      });
    }

    console.log(`[Transcription] ✅ Structured transcription completed | ${utterances.length} utterances`);
    return { text: fullTranscript, utterances };
  } catch (error) {
    console.error('[Transcription] Error with structured transcription:', error);
    return null;
  }
}
