import { getPresignedDownloadUrl, isS3Configured } from "../lib/storage";

const LOG_PREFIX = "[Deepgram-PostCall]";
const DEEPGRAM_API_KEY = (process.env.DEEPGRAM_API_KEY || "").trim();
const DEEPGRAM_API_BASE = "https://api.deepgram.com/v1";
const DEEPGRAM_MODEL = process.env.DEEPGRAM_POSTCALL_MODEL || "nova-2-phonecall";
const DEEPGRAM_LANGUAGE = process.env.DEEPGRAM_POSTCALL_LANGUAGE || "en-US";

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

function mapSpeakerLabel(speaker: string | number | undefined): string {
  if (typeof speaker === "number") {
    return `Speaker ${speaker + 1}`;
  }

  if (typeof speaker === "string" && speaker.trim().length > 0) {
    const numeric = Number(speaker);
    if (!Number.isNaN(numeric)) {
      return `Speaker ${numeric + 1}`;
    }
    return speaker;
  }

  return "Speaker 1";
}

async function getRefreshedUrlFromS3(recordingS3Key: string | null | undefined): Promise<string | null> {
  if (!recordingS3Key || !isS3Configured()) {
    return null;
  }

  try {
    return await getPresignedDownloadUrl(recordingS3Key, 3600);
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

  const response = await fetch(`${DEEPGRAM_API_BASE}/listen?${query.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: audioUrl }),
  });

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
      speaker: mapSpeakerLabel(u.speaker),
      channelTag: typeof u.channel === "number" ? u.channel : undefined,
      text: (u.transcript || "").trim(),
      start: typeof u.start === "number" ? u.start : 0,
      end: typeof u.end === "number" ? u.end : 0,
    }));

  // Deepgram may return only a flat transcript in edge cases.
  if (utterances.length === 0 && transcriptText.length > 0) {
    utterances.push({
      speaker: "Speaker 1",
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
  if (audioUrl) attempts.push(audioUrl);

  const s3RefreshedUrl = await getRefreshedUrlFromS3(options?.recordingS3Key);
  if (s3RefreshedUrl && !attempts.includes(s3RefreshedUrl)) {
    attempts.push(s3RefreshedUrl);
  }

  const telnyxRefreshedUrl = await getRefreshedUrlFromTelnyx(options?.telnyxCallId);
  if (telnyxRefreshedUrl && !attempts.includes(telnyxRefreshedUrl)) {
    attempts.push(telnyxRefreshedUrl);
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
