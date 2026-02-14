/**
 * Backfill missing strict two-way transcripts using Telnyx AI.
 *
 * Uses:
 * - Telnyx recordings API to recover audio URLs
 * - Telnyx OpenAI-compatible transcription endpoint for fast text extraction
 * - Telnyx diarization endpoint to ensure two-way Agent/Prospect speech
 *
 * Usage:
 *   npx tsx scripts/backfill-missing-two-way-transcripts.ts --days 3 --limit 500 --concurrency 12 --execute --verbose
 */

import "dotenv/config";
import OpenAI from "openai";
import { pool } from "../server/db";
import { BUCKET, getPresignedDownloadUrl, uploadToS3 } from "../server/lib/storage";
import { fetchTelnyxRecording } from "../server/services/telnyx-recordings";
import { submitStructuredTranscription } from "../server/services/google-transcription";

type CandidateTable = "leads" | "call_sessions";

interface Candidate {
  table: CandidateTable;
  id: string;
  createdAt: string;
  durationSec: number;
  recordingUrl: string | null;
  recordingS3Key: string | null;
  telnyxCallId: string | null;
  toNumber: string | null;
  fromNumber: string | null;
}

interface DiarizedUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface StructuredTranscript {
  text: string;
  speakerCount: number;
  strictSatisfied: boolean;
  utterances: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
}

interface ProcessResult {
  status: "updated" | "skipped" | "failed";
  reason?: string;
}

const TELNYX_API_KEY = process.env.TELNYX_API_KEY || "";
const TELNYX_AI_BASE_URL = "https://api.telnyx.com/v2/ai";
const TELNYX_DIARIZE_URL = "https://api.telnyx.com/v2/ai/transcribe";

function readArg(name: string, fallback?: string): string | undefined {
  const exact = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (exact) return exact.split("=")[1];

  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return fallback;
}

const DAYS = Math.max(1, parseInt(readArg("days", "3") || "3", 10));
const LIMIT = Math.max(1, parseInt(readArg("limit", "500") || "500", 10));
const CONCURRENCY = Math.max(1, parseInt(readArg("concurrency", "8") || "8", 10));
const MIN_DURATION_SEC = Math.max(1, parseInt(readArg("min-duration", "10") || "10", 10));
const MODEL = readArg("model", "distil-whisper/distil-large-v2") || "distil-whisper/distil-large-v2";
const VERBOSE = process.argv.includes("--verbose");
const EXECUTE = process.argv.includes("--execute") && !process.argv.includes("--dry-run");
const NON_STRICT = process.argv.includes("--non-strict");
const STRICT_MODE = !NON_STRICT;

const stats = {
  candidates: 0,
  resolvedAudio: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  noAudio: 0,
  notTwoWay: 0,
  googleFallbackUsed: 0,
  singleSpeakerCaptured: 0,
};

const telnyxAiClient = new OpenAI({
  apiKey: TELNYX_API_KEY,
  baseURL: TELNYX_AI_BASE_URL,
});

function logVerbose(message: string): void {
  if (VERBOSE) console.log(message);
}

function toIsoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function loadCandidates(): Promise<Candidate[]> {
  const sinceIso = toIsoDaysAgo(DAYS);
  const rawLimit = LIMIT * 3;

  const leadRows = await pool.query(
    `SELECT
       id,
       created_at,
       COALESCE(call_duration, 0)::int AS duration_sec,
       recording_url,
       recording_s3_key,
       telnyx_call_id
     FROM leads
     WHERE created_at >= $1
       AND COALESCE(call_duration, 0) >= $2
       AND (recording_url IS NOT NULL OR recording_s3_key IS NOT NULL OR telnyx_call_id IS NOT NULL)
       AND (
         transcript IS NULL
         OR length(transcript) < 20
         OR structured_transcript IS NULL
         OR structured_transcript::text = 'null'
         OR structured_transcript::text = '{}'
       )
     ORDER BY created_at DESC
     LIMIT $3`,
    [sinceIso, MIN_DURATION_SEC, rawLimit]
  );

  const callSessionRows = await pool.query(
    `SELECT
       id,
       started_at AS created_at,
       COALESCE(duration_sec, 0)::int AS duration_sec,
       recording_url,
       recording_s3_key,
       telnyx_call_id,
       to_number_e164,
       from_number
     FROM call_sessions
     WHERE started_at >= $1
       AND COALESCE(duration_sec, 0) >= $2
       AND (recording_url IS NOT NULL OR recording_s3_key IS NOT NULL OR telnyx_call_id IS NOT NULL)
       AND (
         ai_transcript IS NULL
         OR length(ai_transcript) < 20
         OR ai_analysis IS NULL
         OR ai_analysis::text NOT LIKE '%utterances%'
       )
     ORDER BY started_at DESC
     LIMIT $3`,
    [sinceIso, MIN_DURATION_SEC, rawLimit]
  );

  const leads: Candidate[] = leadRows.rows.map((r: any) => ({
    table: "leads",
    id: r.id,
    createdAt: r.created_at?.toISOString?.() || String(r.created_at),
    durationSec: Number(r.duration_sec || 0),
    recordingUrl: r.recording_url || null,
    recordingS3Key: r.recording_s3_key || null,
    telnyxCallId: r.telnyx_call_id || null,
    toNumber: null,
    fromNumber: null,
  }));

  const callSessions: Candidate[] = callSessionRows.rows.map((r: any) => ({
    table: "call_sessions",
    id: r.id,
    createdAt: r.created_at?.toISOString?.() || String(r.created_at),
    durationSec: Number(r.duration_sec || 0),
    recordingUrl: r.recording_url || null,
    recordingS3Key: r.recording_s3_key || null,
    telnyxCallId: r.telnyx_call_id || null,
    toNumber: r.to_number_e164 || null,
    fromNumber: r.from_number || null,
  }));

  return [...leads, ...callSessions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, LIMIT);
}

function looksLikeGcsInternalUrl(url: string): boolean {
  return url.startsWith("gcs-internal://");
}

function extractGcsKey(internalUrl: string): string {
  return internalUrl.replace(/^gcs-internal:\/\/[^/]+\//, "");
}

async function resolveAudioUrl(
  candidate: Candidate,
  options?: { refreshOnly?: boolean }
): Promise<string | null> {
  const refreshOnly = options?.refreshOnly === true;

  if (!refreshOnly && candidate.recordingS3Key) {
    try {
      return await getPresignedDownloadUrl(candidate.recordingS3Key, 3600);
    } catch (err: any) {
      logVerbose(`  [resolve] presigned from key failed (${candidate.recordingS3Key}): ${err.message}`);
    }
  }

  if (!refreshOnly && candidate.recordingUrl) {
    if (looksLikeGcsInternalUrl(candidate.recordingUrl)) {
      try {
        return await getPresignedDownloadUrl(extractGcsKey(candidate.recordingUrl), 3600);
      } catch (err: any) {
        logVerbose(`  [resolve] presigned from gcs-internal failed: ${err.message}`);
      }
    } else {
      return candidate.recordingUrl;
    }
  }

  if (candidate.telnyxCallId) {
    try {
      return await fetchTelnyxRecording(candidate.telnyxCallId);
    } catch (err: any) {
      logVerbose(`  [resolve] telnyx fetch failed (${candidate.telnyxCallId}): ${err.message}`);
    }
  }

  if (candidate.toNumber || candidate.fromNumber) {
    try {
      const targetMs = new Date(candidate.createdAt).getTime();
      const start = new Date(targetMs - 8 * 60 * 60 * 1000);
      const end = new Date(targetMs + 8 * 60 * 60 * 1000);
      const all: any[] = [];

      async function searchBy(field: "to" | "from", value: string): Promise<void> {
        const u = new URL("https://api.telnyx.com/v2/recordings");
        u.searchParams.set(`filter[${field}]`, value);
        u.searchParams.set("filter[created_at][gte]", start.toISOString());
        u.searchParams.set("filter[created_at][lte]", end.toISOString());
        u.searchParams.set("page[size]", "50");

        const res = await fetch(u.toString(), {
          headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
        });
        if (!res.ok) return;

        const payload = await res.json().catch(() => ({}));
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        all.push(...rows);
      }

      if (candidate.toNumber) await searchBy("to", candidate.toNumber);
      if (candidate.fromNumber) await searchBy("from", candidate.fromNumber);

      const unique = new Map<string, any>();
      for (const item of all) {
        if (item?.id) unique.set(item.id, item);
      }
      const recordings = Array.from(unique.values());
      if (recordings.length === 0) return null;

      recordings.sort((a, b) => {
        const durationDiffA = Math.abs(Number(a?.duration_millis || 0) / 1000 - candidate.durationSec);
        const durationDiffB = Math.abs(Number(b?.duration_millis || 0) / 1000 - candidate.durationSec);
        const timeDiffA = Math.abs(new Date(a?.created_at || 0).getTime() - targetMs) / 60000;
        const timeDiffB = Math.abs(new Date(b?.created_at || 0).getTime() - targetMs) / 60000;

        const penaltyA = durationDiffA * 3 + timeDiffA;
        const penaltyB = durationDiffB * 3 + timeDiffB;
        return penaltyA - penaltyB;
      });

      const completed = recordings.find((r) => r?.status === "completed");
      const best = completed || recordings[0];
      const freshUrl = best?.download_urls?.mp3 || best?.download_urls?.wav || null;
      if (freshUrl) return freshUrl;
    } catch (err: any) {
      logVerbose(
        `  [resolve] telnyx phone-window search failed (${candidate.toNumber || candidate.fromNumber}): ${err.message}`
      );
    }
  }

  return null;
}

async function downloadAudio(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`audio download failed: ${response.status} ${response.statusText}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const mimeType = contentType.includes("wav")
    ? "audio/wav"
    : contentType.includes("ogg")
      ? "audio/ogg"
      : "audio/mpeg";

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType,
  };
}

function mapSpeaker(raw: unknown, dynamicMap: Map<string, string>): string {
  const value = String(raw ?? "").toLowerCase();
  if (!value || value === "undefined" || value === "null") return "Speaker 1";

  if (value === "0" || value === "speaker_0" || value === "agent" || value === "a") return "Speaker 1";
  if (value === "1" || value === "speaker_1" || value === "prospect" || value === "b") return "Speaker 2";

  if (!dynamicMap.has(value)) {
    dynamicMap.set(value, `Speaker ${dynamicMap.size + 1}`);
  }
  return dynamicMap.get(value) as string;
}

async function diarizeFromUrl(audioUrl: string): Promise<DiarizedUtterance[]> {
  const response = await fetch(TELNYX_DIARIZE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language: "en",
      diarize: true,
      timestamps: "word",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`diarization failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const data = payload?.data ?? payload ?? {};
  const dynamicMap = new Map<string, string>();
  const utterances: DiarizedUtterance[] = [];

  if (Array.isArray(data?.utterances) && data.utterances.length > 0) {
    for (const item of data.utterances) {
      const text = String(item?.text ?? "").trim();
      if (!text) continue;

      const start = Number(item?.start ?? 0);
      const end = Number(item?.end ?? start);
      utterances.push({
        speaker: mapSpeaker(item?.speaker ?? item?.speaker_id, dynamicMap),
        text,
        start: Number.isFinite(start) ? start : 0,
        end: Number.isFinite(end) ? end : 0,
      });
    }
    return utterances;
  }

  if (Array.isArray(data?.words) && data.words.length > 0) {
    let current: DiarizedUtterance | null = null;

    for (const word of data.words) {
      const text = String(word?.word ?? word?.text ?? "").trim();
      if (!text) continue;

      const speaker = mapSpeaker(word?.speaker ?? word?.speaker_id, dynamicMap);
      const start = Number(word?.start ?? 0);
      const end = Number(word?.end ?? start);

      if (!current || current.speaker !== speaker) {
        if (current) utterances.push(current);
        current = {
          speaker,
          text,
          start: Number.isFinite(start) ? start : 0,
          end: Number.isFinite(end) ? end : 0,
        };
      } else {
        current.text += ` ${text}`;
        current.end = Number.isFinite(end) ? end : current.end;
      }
    }

    if (current) utterances.push(current);
  }

  return utterances;
}

function toClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function formatTwoWayTranscript(structured: StructuredTranscript): {
  fullText: string;
  agentLines: string[];
  prospectLines: string[];
} {
  const agentLines: string[] = [];
  const prospectLines: string[] = [];
  const lines: string[] = [];

  for (const utterance of structured.utterances) {
    const role = utterance.speaker === "Speaker 1" ? "AGENT" : "PROSPECT";
    if (role === "AGENT") agentLines.push(utterance.text);
    else prospectLines.push(utterance.text);

    lines.push(`[${toClock(utterance.start)}] ${role}: ${utterance.text}`);
  }

  return {
    fullText: lines.join("\n"),
    agentLines,
    prospectLines,
  };
}

async function transcribeStrictTwoWay(
  audioUrl: string,
  candidate: Candidate
): Promise<StructuredTranscript> {
  const audio = await downloadAudio(audioUrl);
  const extension = audio.mimeType.includes("wav")
    ? "wav"
    : audio.mimeType.includes("ogg")
      ? "ogg"
      : "mp3";
  const file = new File([audio.buffer], `recording.${extension}`, { type: audio.mimeType });

  const fastResult: any = await telnyxAiClient.audio.transcriptions.create({
    model: MODEL,
    file,
  });
  const text = String(fastResult?.text ?? "").trim();
  if (!text) {
    throw new Error("transcription returned empty text");
  }

  let diarized: DiarizedUtterance[] = [];
  try {
    diarized = await diarizeFromUrl(audioUrl);
  } catch (err: any) {
    logVerbose(`  [diarize] Telnyx diarization unavailable, falling back to Google STT: ${err.message}`);
    let fallbackSource = audioUrl;

    // Google STT rejects larger inline payloads; upload and use gs:// URI when audio is large.
    if (audio.buffer.length > 900_000) {
      const tempKey = `recordings/tmp-two-way/${candidate.table}/${candidate.id}-${Date.now()}.${extension}`;
      await uploadToS3(tempKey, audio.buffer, audio.mimeType);
      fallbackSource = `gs://${BUCKET}/${tempKey}`;
      logVerbose(`  [diarize] Uploaded fallback audio to ${fallbackSource}`);
    }

    const fallback = await submitStructuredTranscription(fallbackSource, {
      telnyxCallId: candidate.telnyxCallId,
      recordingS3Key: candidate.recordingS3Key,
      throwOnError: true,
    });
    if (!fallback) {
      if (STRICT_MODE) throw new Error("strict two-way check failed: no diarized utterances from fallback");
      diarized = [
        {
          speaker: "Speaker 1",
          text,
          start: 0,
          end: Math.max(0, Number(candidate.durationSec || 0)),
        },
      ];
    } else {
      stats.googleFallbackUsed++;
      diarized = fallback.utterances.map((u) => ({
        speaker: u.speaker || "Speaker 1",
        text: u.text,
        start: Number(u.start || 0),
        end: Number(u.end || 0),
      }));
    }
  }

  if (diarized.length === 0) {
    if (STRICT_MODE) throw new Error("strict two-way check failed: no diarized utterances");
    diarized = [
      {
        speaker: "Speaker 1",
        text,
        start: 0,
        end: Math.max(0, Number(candidate.durationSec || 0)),
      },
    ];
  }

  const speakers = new Set(diarized.map((u) => u.speaker));
  const strictSatisfied = speakers.size >= 2;
  if (!strictSatisfied && STRICT_MODE) throw new Error("strict two-way check failed: <2 speakers detected");
  if (!strictSatisfied && !STRICT_MODE) stats.singleSpeakerCaptured++;

  return {
    text,
    speakerCount: speakers.size,
    strictSatisfied,
    utterances: diarized,
  };
}

async function updateLead(candidate: Candidate, structured: StructuredTranscript): Promise<void> {
  const formatted = formatTwoWayTranscript(structured);
  await pool.query(
    `UPDATE leads
     SET transcript = $1,
         structured_transcript = $2::jsonb,
         transcription_status = 'completed',
         updated_at = NOW()
     WHERE id = $3`,
    [
      formatted.fullText,
      JSON.stringify({
        text: structured.text,
        utterances: structured.utterances,
        formatted: formatted.fullText,
        agentLines: formatted.agentLines,
        prospectLines: formatted.prospectLines,
        provider: "telnyx-ai",
        mode: STRICT_MODE ? "strict" : "non-strict",
        strictTwoWay: structured.strictSatisfied,
        speakerCount: structured.speakerCount,
        model: MODEL,
        transcribedAt: new Date().toISOString(),
      }),
      candidate.id,
    ]
  );
}

async function updateCallSession(candidate: Candidate, structured: StructuredTranscript): Promise<void> {
  const formatted = formatTwoWayTranscript(structured);
  await pool.query(
    `UPDATE call_sessions
     SET ai_transcript = $1,
         ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) || $2::jsonb
     WHERE id = $3`,
    [
      formatted.fullText,
      JSON.stringify({
        utterances: structured.utterances,
        formatted: formatted.fullText,
        agentLines: formatted.agentLines,
        prospectLines: formatted.prospectLines,
        provider: "telnyx-ai",
        mode: STRICT_MODE ? "strict" : "non-strict",
        strictTwoWay: structured.strictSatisfied,
        speakerCount: structured.speakerCount,
        model: MODEL,
        transcribedAt: new Date().toISOString(),
      }),
      candidate.id,
    ]
  );
}

async function processOne(candidate: Candidate, index: number, total: number): Promise<ProcessResult> {
  const prefix = `[${index + 1}/${total}] ${candidate.table}:${candidate.id}`;
  const audioUrl = await resolveAudioUrl(candidate);
  if (!audioUrl) {
    stats.noAudio++;
    console.log(`${prefix} skip: no recording URL resolved`);
    return { status: "skipped", reason: "no-audio" };
  }
  stats.resolvedAudio++;

  if (!EXECUTE) {
    console.log(`${prefix} dry-run: would transcribe (${candidate.durationSec}s)`);
    return { status: "skipped", reason: "dry-run" };
  }

  try {
    let structured: StructuredTranscript;
    try {
      structured = await transcribeStrictTwoWay(audioUrl, candidate);
    } catch (firstErr: any) {
      const firstMessage = String(firstErr?.message || "");
      const isAuthDownloadError =
        firstMessage.includes("audio download failed: 401") || firstMessage.includes("audio download failed: 403");

      if (!isAuthDownloadError) {
        throw firstErr;
      }

      logVerbose(`${prefix} refresh: retrying with fresh provider URL`);
      const freshUrl = await resolveAudioUrl(candidate, { refreshOnly: true });
      if (!freshUrl) throw firstErr;

      structured = await transcribeStrictTwoWay(freshUrl, candidate);
    }

    if (candidate.table === "leads") await updateLead(candidate, structured);
    else await updateCallSession(candidate, structured);

    console.log(
      `${prefix} updated: ${structured.text.split(/\s+/).filter(Boolean).length} words, ${structured.utterances.length} turns`
    );
    return { status: "updated" };
  } catch (err: any) {
    const message = String(err?.message || "unknown error");
    if (message.includes("strict two-way")) {
      stats.notTwoWay++;
      console.log(`${prefix} skip: ${message}`);
      return { status: "skipped", reason: "not-two-way" };
    }
    console.error(`${prefix} failed: ${message}`);
    return { status: "failed", reason: message };
  }
}

async function main(): Promise<void> {
  if (!TELNYX_API_KEY) {
    throw new Error("TELNYX_API_KEY is required");
  }

  console.log("=".repeat(88));
  console.log("Backfill Missing Strict Two-Way Transcripts (Telnyx AI)");
  console.log("=".repeat(88));
  console.log(`Days         : ${DAYS}`);
  console.log(`Limit        : ${LIMIT}`);
  console.log(`Concurrency  : ${CONCURRENCY}`);
  console.log(`Min duration : ${MIN_DURATION_SEC}s`);
  console.log(`Model        : ${MODEL}`);
  console.log(`Policy       : ${STRICT_MODE ? "STRICT (2 speakers required)" : "NON-STRICT (single speaker allowed)"}`);
  console.log(`Mode         : ${EXECUTE ? "EXECUTE" : "DRY-RUN"}`);
  console.log("=".repeat(88));

  const candidates = await loadCandidates();
  stats.candidates = candidates.length;
  console.log(`Candidates loaded: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("No missing transcript candidates found.");
    return;
  }

  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIndex++;
      if (idx >= candidates.length) return;
      const result = await processOne(candidates[idx], idx, candidates.length);
      if (result.status === "updated") stats.updated++;
      if (result.status === "skipped") stats.skipped++;
      if (result.status === "failed") stats.failed++;
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()));

  console.log("\n" + "=".repeat(88));
  console.log("Summary");
  console.log("=".repeat(88));
  console.log(`Candidates      : ${stats.candidates}`);
  console.log(`Resolved audio  : ${stats.resolvedAudio}`);
  console.log(`Updated         : ${stats.updated}`);
  console.log(`Skipped         : ${stats.skipped}`);
  console.log(`  - No audio    : ${stats.noAudio}`);
  console.log(`  - Not two-way : ${stats.notTwoWay}`);
  console.log(`Failed          : ${stats.failed}`);
  console.log(`Google fallback : ${stats.googleFallbackUsed}`);
  console.log(`Single speaker  : ${stats.singleSpeakerCaptured}`);
  console.log("=".repeat(88));
}

main()
  .catch((err) => {
    console.error("FATAL:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
