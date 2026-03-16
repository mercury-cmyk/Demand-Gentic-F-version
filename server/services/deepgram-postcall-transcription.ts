import { getPresignedDownloadUrl, isS3Configured } from "../lib/storage";

const LOG_PREFIX = "[Deepgram-PostCall]";
const DEEPGRAM_API_KEY = (process.env.DEEPGRAM_API_KEY || "").trim();
const DEEPGRAM_API_BASE = "https://api.deepgram.com/v1";
const DEEPGRAM_MODEL = process.env.DEEPGRAM_POSTCALL_MODEL || "nova-2-phonecall";
const DEEPGRAM_LANGUAGE = process.env.DEEPGRAM_POSTCALL_LANGUAGE || "en-US";
/** Timeout for Deepgram transcription requests — long calls produce large audio files that take time to process */
const DEEPGRAM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface TranscriptionAudioSourceOptions {
  telnyxCallId?: string | null;
  recordingS3Key?: string | null;
  throwOnError?: boolean;
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

interface DeepgramUtterance {
  speaker?: string | number;
  transcript?: string;
  start?: number;
  end?: number;
  channel?: number;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isPresignedGcsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("storage.googleapis.com")) return false;
    return (
      parsed.searchParams.has("X-Goog-Signature") ||
      parsed.searchParams.has("GoogleAccessId") ||
      parsed.searchParams.has("X-Goog-Credential")
    );
  } catch {
    return false;
  }
}

/**
 * CRITICAL FIX: Map speaker to "agent" or "contact" using channel information
 * 
 * Our recording system creates stereo WAV files with:
 * - Channel 0 (Left) = Inbound audio (Contact)
 * - Channel 1 (Right) = Outbound audio (Agent)
 * 
 * Deepgram's diarization sometimes fails on phone calls, so we use channel
 * information as the authoritative source for speaker attribution.
 */
function mapSpeakerLabel(speaker: string | number | undefined, channel: number | undefined): string {
  // PRIMARY: Use channel information if available (most reliable)
  if (typeof channel === "number") {
    return channel === 0 ? "contact" : "agent";
  }

  // FALLBACK: Parse speaker label if channel not provided
  if (typeof speaker === "number") {
    // Deepgram speaker ID - map to agent/contact based on speaker count
    return speaker === 0 ? "contact" : "agent";
  }

  if (typeof speaker === "string" && speaker.trim().length > 0) {
    const trimmed = speaker.trim().toLowerCase();
    
    // Handle "Speaker 0", "Speaker 1", etc. format from Deepgram
    const speakerMatch = trimmed.match(/speaker\s*(\d+)/);
    if (speakerMatch) {
      const speakerId = parseInt(speakerMatch[1], 10);
      return speakerId === 0 ? "contact" : "agent";
    }
    
    // Try direct numeric parse
    const numeric = Number(speaker);
    if (!Number.isNaN(numeric)) {
      return numeric === 0 ? "contact" : "agent";
    }
    
    // Named speaker - default to contact
    return "contact";
  }

  // Absolute fallback
  return "contact";
}

function extractStorageKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/^\/+/, "");
    if (!path) return null;

    if (host === "s3.amazonaws.com" || host === "storage.googleapis.com") {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2) return parts.slice(1).join("/");
      return null;
    }

    if (host.endsWith(".s3.amazonaws.com")) {
      return path;
    }

    return null;
  } catch {
    return null;
  }
}

async function getRefreshedUrlFromS3(recordingS3Key: string | null | undefined): Promise<string | null> {
  if (!recordingS3Key || !isS3Configured()) {
    return null;
  }

  try {
    // Use 24-hour TTL for transcription URLs (Deepgram jobs may queue for hours)
    const TTL_24_HOURS = 24 * 60 * 60;
    const presignedUrl = await getPresignedDownloadUrl(recordingS3Key, TTL_24_HOURS);
    if (presignedUrl.startsWith("gcs-internal://")) {
      console.warn(`${LOG_PREFIX} Rejecting non-presigned internal URL for Deepgram: ${recordingS3Key}`);
      return null;
    }
    if (!isPresignedGcsUrl(presignedUrl)) {
      console.warn(`${LOG_PREFIX} Rejecting non-presigned/non-GCS URL for Deepgram: ${recordingS3Key}`);
      return null;
    }
    return presignedUrl;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to refresh audio URL from S3 key ${recordingS3Key}: ${getErrorMessage(error)}`);
    return null;
  }
}

async function getRefreshedUrlFromTelnyx(telnyxCallId: string | null | undefined): Promise<string | null> {
  if (!telnyxCallId) {
    return null;
  }

  try {
    const { fetchTelnyxRecording } = await import("./telnyx-recordings");
    return await fetchTelnyxRecording(telnyxCallId);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to refresh audio URL from Telnyx call ID ${telnyxCallId}: ${getErrorMessage(error)}`);
    return null;
  }
}

async function submitToDeepgram(audioUrl: string): Promise<StructuredTranscript | null> {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY not configured");
  }

  const query = new URLSearchParams({
    model: DEEPGRAM_MODEL,
    language: DEEPGRAM_LANGUAGE,
    punctuate: "true",
    smart_format: "true",
    diarize: "true",
    utterances: "true",
    paragraphs: "true",
    filler_words: "false",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEEPGRAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${DEEPGRAM_API_BASE}/listen?${query.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Deepgram transcription timed out after ${DEEPGRAM_TIMEOUT_MS / 1000}s — audio file may be too large`);
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Deepgram API error ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const payload: any = await response.json();
  const results = payload?.results;
  const alt = results?.channels?.[0]?.alternatives?.[0];
  const transcriptText: string = (alt?.transcript || "").trim();

  const rawUtterances: DeepgramUtterance[] = Array.isArray(results?.utterances)
    ? results.utterances
    : Array.isArray(alt?.utterances)
      ? alt.utterances
      : [];

  const utterances = rawUtterances
    .filter((u) => typeof u?.transcript === "string" && u.transcript.trim().length > 0)
    .map((u) => ({
      speaker: mapSpeakerLabel(u.speaker, u.channel),
      channelTag: typeof u.channel === "number" ? u.channel : undefined,
      text: (u.transcript || "").trim(),
      start: typeof u.start === "number" ? u.start : 0,
      end: typeof u.end === "number" ? u.end : 0,
    }));

  // Deepgram may return only a flat transcript in edge cases.
  // Fallback: attribute to contact if single speaker
  if (utterances.length === 0 && transcriptText.length > 0) {
    utterances.push({
      speaker: "contact",
      channelTag: undefined,
      text: transcriptText,
      start: 0,
      end: 0,
    });
  }

  if (!transcriptText && utterances.length === 0) {
    return null;
  }

  const combinedText = transcriptText || utterances.map((u) => u.text).join(" ").trim();
  return { text: combinedText, utterances };
}

export async function submitStructuredTranscription(
  audioUrl: string,
  options?: TranscriptionAudioSourceOptions
): Promise<StructuredTranscript | null> {
  let lastError: unknown;

  const attempts: string[] = [];

  const inferredS3Key = options?.recordingS3Key || extractStorageKeyFromUrl(audioUrl);

  // Strategy 1: Try the original URL first if it's a direct HTTPS URL (Telnyx S3)
  // This is the most reliable path — fresh Telnyx URLs are publicly accessible
  if (/^https?:\/\//i.test(audioUrl) && !audioUrl.startsWith('gcs-internal://') && !audioUrl.startsWith('gs://')) {
    attempts.push(audioUrl);
  }

  // Strategy 2: Try GCS presigned URL from S3 key (for recordings already in GCS)
  if (inferredS3Key) {
    const s3RefreshedUrl = await getRefreshedUrlFromS3(inferredS3Key);
    if (s3RefreshedUrl && !attempts.includes(s3RefreshedUrl)) {
      attempts.push(s3RefreshedUrl);
    }
  }

  // Strategy 3: Try Telnyx recording URL via call ID (refresh expired URLs)
  if (options?.telnyxCallId) {
    const telnyxUrl = await getRefreshedUrlFromTelnyx(options.telnyxCallId);
    if (telnyxUrl && !attempts.includes(telnyxUrl)) {
      attempts.push(telnyxUrl);
    }
  }

  if (attempts.length === 0) {
    const message = `${LOG_PREFIX} Unable to resolve any usable audio URL (s3Key=${inferredS3Key || 'none'}, audioUrl=${audioUrl.slice(0, 80)})`;
    if (options?.throwOnError) {
      throw new Error(message);
    }
    console.error(message);
    return null;
  }

  for (const candidateUrl of attempts) {
    try {
      console.log(`${LOG_PREFIX} Submitting recording to Deepgram: ${candidateUrl.slice(0, 120)}...`);
      const result = await submitToDeepgram(candidateUrl);
      if (result) {
        console.log(
          `${LOG_PREFIX} Structured transcription complete: ${result.utterances.length} utterances, ${result.text.length} chars`
        );
      }
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`${LOG_PREFIX} Transcription attempt failed: ${getErrorMessage(error)}`);
    }
  }

  if (options?.throwOnError && lastError) {
    throw lastError;
  }

  return null;
}

export async function transcribeFromRecording(
  recordingUrl: string,
  options?: TranscriptionAudioSourceOptions
): Promise<{ transcript: string; wordCount: number } | null> {
  const structured = await submitStructuredTranscription(recordingUrl, options);
  if (!structured || !structured.text) {
    return null;
  }

  const transcript = structured.text.trim();
  if (!transcript) {
    return null;
  }

  return {
    transcript,
    wordCount: transcript.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Submit raw audio buffer directly to Deepgram for transcription.
 * Bypasses all presigned URL logic — used when GCS signBlob permission is missing
 * but the service account can still download the file directly.
 */
export async function submitToDeepgramBuffer(audioBuffer: Buffer, mimetype?: string): Promise<string | null> {
  if (!DEEPGRAM_API_KEY) {
    console.error("[Deepgram-Buffer] DEEPGRAM_API_KEY not set");
    return null;
  }
  if (!audioBuffer || audioBuffer.length < 1000) {
    console.warn("[Deepgram-Buffer] Audio buffer too small:", audioBuffer?.length);
    return null;
  }

  const contentType = mimetype || detectAudioMimeType(audioBuffer);
  console.log(`[Deepgram-Buffer] Submitting ${audioBuffer.length} bytes (${contentType}) to Deepgram...`);

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const query = new URLSearchParams({
        model: DEEPGRAM_MODEL,
        language: DEEPGRAM_LANGUAGE,
        punctuate: "true",
        smart_format: "true",
        diarize: "true",
        utterances: "true",
        paragraphs: "true",
        filler_words: "false",
      });

      const response = await fetch(`${DEEPGRAM_API_BASE}/listen?${query.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": contentType,
        },
        body: new Uint8Array(audioBuffer),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.error(`[Deepgram-Buffer] HTTP ${response.status} (attempt ${attempt}/${MAX_RETRIES}): ${errBody.slice(0, 200)}`);
        if (response.status === 429 || response.status >= 500) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        return null;
      }

      const data = (await response.json()) as any;
      const channels = data?.results?.channels;
      if (!channels || channels.length === 0) {
        console.warn("[Deepgram-Buffer] No channels in response");
        return null;
      }

      // Build transcript from utterances (diarized) if available
      const utterances = data?.results?.utterances;
      if (utterances && utterances.length > 0) {
        const formatted = utterances
          .filter((u: any) => typeof u?.transcript === "string" && u.transcript.trim().length > 0)
          .map((u: any) => {
            const speaker = mapSpeakerLabel(u.speaker, u.channel);
            return `${speaker}: ${(u.transcript || "").trim()}`;
          })
          .join("\n");
        console.log(`[Deepgram-Buffer] ✅ ${formatted.length} chars from ${utterances.length} utterances`);
        return formatted;
      }

      // Fallback to channel alternative
      const alt = channels[0]?.alternatives?.[0];
      if (alt?.transcript) {
        const transcript = alt.transcript.trim();
        console.log(`[Deepgram-Buffer] ✅ ${transcript.length} chars (channel fallback)`);
        return transcript;
      }

      console.warn("[Deepgram-Buffer] No transcript in response");
      return null;
    } catch (e: any) {
      console.error(`[Deepgram-Buffer] Attempt ${attempt}/${MAX_RETRIES} error:`, e.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }
  return null;
}

/** Detect MIME type from audio buffer header bytes */
function detectAudioMimeType(buffer: Buffer): string {
  if (buffer.length < 4) return "audio/mpeg";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "audio/wav";
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return "audio/ogg";
  if (buffer[0] === 0x66 && buffer[1] === 0x4c && buffer[2] === 0x61 && buffer[3] === 0x43) return "audio/flac";
  if ((buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  return "audio/mpeg";
}
