/**
 * Fetch & Transcribe All Telnyx Recordings — Last 3 Days
 *
 * 1. Lists ALL recordings from Telnyx API for the last 3 days (paginated).
 * 2. Cross-references with DB (leads, call_sessions, dialer_call_attempts).
 * 3. Downloads recordings missing a structured two-way transcript.
 * 4. Uploads WAV to GCS for permanent storage.
 * 5. Transcribes with Google Cloud Speech-to-Text (telephony model, speaker diarization).
 * 6. Saves full text + structured Agent/Prospect transcript to DB.
 *
 * Usage:  npx tsx scripts/fetch-and-transcribe-3day-recordings.ts
 */

import "dotenv/config";
import axios from "axios";
import fetch from "node-fetch";
import { pool } from "../server/db";
import { StructuredTranscript } from "../server/services/google-transcription";
import { uploadToS3, getPresignedDownloadUrl, BUCKET } from "../server/lib/storage";
import { SpeechClient, protos } from "@google-cloud/speech";

// ─── Config ───────────────────────────────────────────────────────────────────
const TELNYX_API_KEY = process.env.TELNYX_API_KEY!;
const BASE_URL = "https://api.telnyx.com/v2";
const DAYS_BACK = 3;
const CONCURRENCY = 2; // parallel downloads/transcriptions
const DRY_RUN = process.argv.includes("--dry-run");
const DB_ONLY = process.argv.includes("--db-only");
const LIMIT = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] || "0", 10) || Infinity;

// ─── Types ────────────────────────────────────────────────────────────────────
interface TelnyxRecording {
  id: string;
  call_control_id?: string;
  call_leg_id?: string;
  call_session_id?: string;
  channels: number;
  download_urls: { wav: string; mp3?: string };
  created_at: string;
  duration_millis: number;
  status: string;
  from?: string;
  to?: string;
}

interface LinkedRecord {
  table: string;
  id: string;
  hasStructuredTranscript: boolean;
  hasPlainTranscript: boolean;
  recordingS3Key: string | null;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  totalRecordings: 0,
  linked: 0,
  alreadyTranscribed: 0,
  downloaded: 0,
  uploaded: 0,
  transcribed: 0,
  failed: 0,
  skippedNoLink: 0,
};

// ─── Google STT client (lazy) ─────────────────────────────────────────────────
let _speechClient: SpeechClient | null = null;
function getSpeechClient(): SpeechClient {
  if (!_speechClient) _speechClient = new SpeechClient();
  return _speechClient;
}

type RecognitionConfig = protos.google.cloud.speech.v1.IRecognitionConfig;

/**
 * Transcribe audio using GCS URI (supports long recordings > 1 min).
 * Steps:
 *  1. Download audio from the given URL
 *  2. Upload to GCS under a temp key
 *  3. Call Google STT with gs:// URI (longRunningRecognize)
 *  4. Return structured 2-speaker transcript
 */
async function transcribeViaGCS(
  audioUrl: string,
  gcsKey: string,
  opts?: { skipDownload?: boolean }
): Promise<StructuredTranscript | null> {
  const client = getSpeechClient();

  // If we haven't already uploaded, download & upload first
  if (!opts?.skipDownload) {
    const resp = await fetch(audioUrl, { redirect: "follow" } as any);
    if (!resp.ok) {
      console.error(`    Download failed: ${resp.status}`);
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    console.log(`    Downloaded ${(buf.length / 1024).toFixed(0)} KB`);

    await uploadToS3(gcsKey, buf, "audio/wav");
    console.log(`    Uploaded to GCS: ${gcsKey}`);
  }

  const gcsUri = `gs://${BUCKET}/${gcsKey}`;

  // Determine encoding from key extension
  const isWav = gcsKey.endsWith(".wav");
  const AudioEncoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

  const config: RecognitionConfig = {
    model: "telephony",
    languageCode: "en-US",
    alternativeLanguageCodes: ["en-GB"],
    encoding: isWav ? AudioEncoding.LINEAR16 : AudioEncoding.MP3,
    sampleRateHertz: isWav ? 8000 : undefined,
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

  console.log(`    Sending to Google STT (GCS URI) …`);

  const [operation] = await client.longRunningRecognize({
    config,
    audio: { uri: gcsUri },
  });
  const [response] = await operation.promise();

  const results = response.results || [];
  if (results.length === 0) {
    console.error(`    No STT results`);
    return null;
  }

  // Full text
  const fullTranscript = results
    .map((r) => r.alternatives?.[0]?.transcript || "")
    .join(" ")
    .trim();

  // Speaker-diarized utterances
  const words = results.flatMap((r) => r.alternatives?.[0]?.words || []);
  const utterances: StructuredTranscript["utterances"] = [];
  let curSpeaker = -1;
  let curWords: protos.google.cloud.speech.v1.IWordInfo[] = [];

  const toSec = (t: any): number => {
    if (!t) return 0;
    if (typeof t === "number") return t;
    return parseInt((t.seconds || 0).toString()) + parseInt((t.nanos || 0).toString()) / 1e9;
  };

  for (const w of words) {
    const spk = w.speakerTag || 1;
    if (spk !== curSpeaker && curSpeaker !== -1 && curWords.length > 0) {
      utterances.push({
        speaker: `Speaker ${curSpeaker}`,
        text: curWords.map((x) => x.word).join(" "),
        start: toSec(curWords[0].startTime),
        end: toSec(curWords[curWords.length - 1].endTime),
      });
      curWords = [];
    }
    curSpeaker = spk;
    curWords.push(w);
  }
  if (curWords.length > 0) {
    utterances.push({
      speaker: `Speaker ${curSpeaker}`,
      text: curWords.map((x) => x.word).join(" "),
      start: toSec(curWords[0].startTime),
      end: toSec(curWords[curWords.length - 1].endTime),
    });
  }

  console.log(`    STT complete: ${fullTranscript.split(/\s+/).length} words, ${utterances.length} turns`);
  return { text: fullTranscript, utterances };
}

// ─── Step 1: List all Telnyx recordings from the last 3 days ─────────────────
async function listTelnyxRecordings(): Promise<TelnyxRecording[]> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);

  console.log(`\n[1/5] Fetching Telnyx recordings since ${since.toISOString()} …`);

  const recordings: TelnyxRecording[] = [];
  let pageToken: string | null = null;
  let page = 0;

  do {
    page++;
    const params: Record<string, any> = {
      "filter[created_at][gte]": since.toISOString(),
      "page[size]": 250,
    };
    if (pageToken) params["page[after]"] = pageToken;

    const resp = await axios.get(`${BASE_URL}/recordings`, {
      headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
      params,
      timeout: 30_000,
    });

    const batch: TelnyxRecording[] = resp.data.data || [];
    recordings.push(...batch);
    console.log(`    Page ${page}: ${batch.length} recordings (total: ${recordings.length})`);

    pageToken = resp.data.meta?.pagination?.next_page_token ?? null;
  } while (pageToken);

  stats.totalRecordings = recordings.length;
  console.log(`    => ${recordings.length} recordings found\n`);
  return recordings;
}

// ─── Step 2: Find linked DB record for a recording ───────────────────────────
async function findLinkedRecord(rec: TelnyxRecording): Promise<LinkedRecord | null> {
  try {
    // Strategy 1: call_sessions by telnyx_call_id
    if (rec.call_session_id) {
      const r = await pool.query(
        `SELECT id,
                recording_s3_key,
                CASE WHEN ai_analysis IS NOT NULL AND ai_analysis::text LIKE '%utterances%' THEN true ELSE false END AS has_structured,
                CASE WHEN ai_transcript IS NOT NULL AND length(ai_transcript) > 20 THEN true ELSE false END AS has_plain
         FROM call_sessions WHERE telnyx_call_id = $1 LIMIT 1`,
        [rec.call_session_id]
      );
      if (r.rows.length > 0) {
        return {
          table: "call_sessions",
          id: r.rows[0].id,
          hasStructuredTranscript: r.rows[0].has_structured,
          hasPlainTranscript: r.rows[0].has_plain,
          recordingS3Key: r.rows[0].recording_s3_key,
        };
      }
    }

    // Strategy 2: leads by telnyx_call_id
    const telnyxIds = [rec.call_session_id, rec.call_leg_id, rec.call_control_id].filter(Boolean);
    for (const tid of telnyxIds) {
      const r = await pool.query(
        `SELECT id,
                recording_s3_key,
                CASE WHEN structured_transcript IS NOT NULL AND structured_transcript::text <> 'null' AND structured_transcript::text <> '{}' THEN true ELSE false END AS has_structured,
                CASE WHEN transcript IS NOT NULL AND length(transcript) > 20 THEN true ELSE false END AS has_plain
         FROM leads WHERE telnyx_call_id = $1 LIMIT 1`,
        [tid]
      );
      if (r.rows.length > 0) {
        return {
          table: "leads",
          id: r.rows[0].id,
          hasStructuredTranscript: r.rows[0].has_structured,
          hasPlainTranscript: r.rows[0].has_plain,
          recordingS3Key: r.rows[0].recording_s3_key,
        };
      }
    }

    // Strategy 3: dialer_call_attempts
    for (const tid of telnyxIds) {
      const r = await pool.query(
        `SELECT id FROM dialer_call_attempts WHERE telnyx_call_id = $1 LIMIT 1`,
        [tid]
      );
      if (r.rows.length > 0) {
        return {
          table: "dialer_call_attempts",
          id: r.rows[0].id,
          hasStructuredTranscript: false,
          hasPlainTranscript: false,
          recordingS3Key: null,
        };
      }
    }
  } catch (err: any) {
    console.error(`  DB lookup error for rec ${rec.id}: ${err.message}`);
  }

  return null;
}

// ─── Step 3: Download audio from Telnyx ──────────────────────────────────────
async function downloadRecording(wavUrl: string, recId: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  const resp = await fetch(wavUrl, { signal: controller.signal as any });
  clearTimeout(timer);
  if (!resp.ok) throw new Error(`Download failed ${resp.status} for recording ${recId}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ─── Step 4: Format structured transcript as two-way conversation ────────────
function formatTwoWayTranscript(structured: StructuredTranscript): {
  formattedTranscript: string;
  agentLines: string[];
  prospectLines: string[];
} {
  // Speaker 1 is typically the agent (caller), Speaker 2 is the prospect
  // We label them clearly
  const agentLines: string[] = [];
  const prospectLines: string[] = [];
  const lines: string[] = [];

  for (const u of structured.utterances) {
    const speakerNum = parseInt(u.speaker.replace("Speaker ", ""), 10) || 1;
    const label = speakerNum === 1 ? "AGENT" : "PROSPECT";
    const timestamp = formatTime(u.start);
    const line = `[${timestamp}] ${label}: ${u.text}`;
    lines.push(line);

    if (label === "AGENT") agentLines.push(u.text);
    else prospectLines.push(u.text);
  }

  return {
    formattedTranscript: lines.join("\n"),
    agentLines,
    prospectLines,
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ─── Step 5: Process a single recording ──────────────────────────────────────
async function processRecording(rec: TelnyxRecording, idx: number, total: number): Promise<void> {
  const prefix = `[${idx + 1}/${total}]`;

  // Find linked DB record
  const linked = await findLinkedRecord(rec);
  if (!linked) {
    stats.skippedNoLink++;
    return; // no DB record found
  }

  stats.linked++;

  // If already has structured transcript, skip
  if (linked.hasStructuredTranscript && linked.hasPlainTranscript) {
    stats.alreadyTranscribed++;
    console.log(`${prefix} SKIP — ${linked.table}:${linked.id} already has two-way transcript`);
    return;
  }

  console.log(`${prefix} PROCESSING — ${linked.table}:${linked.id} (rec: ${rec.id}, ${Math.round(rec.duration_millis / 1000)}s)`);

  if (DRY_RUN) {
    console.log(`${prefix}   [DRY-RUN] Would download, upload & transcribe`);
    return;
  }

  try {
    // ---- Download audio ----
    const audioBuf = await downloadRecording(rec.download_urls.wav, rec.id);
    stats.downloaded++;
    console.log(`${prefix}   Downloaded ${(audioBuf.length / 1024).toFixed(0)} KB`);

    // ---- Upload to GCS ----
    const gcsKey = `recordings/${linked.table}/${linked.id}/${rec.id}.wav`;
    await uploadToS3(gcsKey, audioBuf, "audio/wav");
    stats.uploaded++;
    console.log(`${prefix}   Uploaded to GCS: ${gcsKey}`);

    // ---- Transcribe with Google STT via GCS URI (supports long audio) ----
    console.log(`${prefix}   Transcribing with Google Speech-to-Text …`);
    const structured = await transcribeViaGCS("", gcsKey, { skipDownload: true });

    if (!structured || !structured.text) {
      console.error(`${prefix}   Transcription returned empty`);
      stats.failed++;
      return;
    }

    // ---- Format two-way transcript ----
    const { formattedTranscript, agentLines, prospectLines } = formatTwoWayTranscript(structured);

    const wordCount = structured.text.split(/\s+/).length;
    console.log(`${prefix}   Transcribed: ${wordCount} words, ${structured.utterances.length} turns`);
    console.log(`${prefix}   Agent turns: ${agentLines.length}, Prospect turns: ${prospectLines.length}`);

    // ---- Save to DB ----
    const gcsInternalUrl = `gcs-internal://${BUCKET}/${gcsKey}`;
    if (linked.table === "leads") {
      await pool.query(
        `UPDATE leads SET
           transcript = $1,
           structured_transcript = $2,
           recording_s3_key = $3,
           recording_url = $4,
           telnyx_recording_id = $5,
           transcription_status = 'completed',
           recording_status = 'available'
         WHERE id = $6`,
        [
          formattedTranscript,
          JSON.stringify({
            text: structured.text,
            utterances: structured.utterances,
            formatted: formattedTranscript,
            agentLines,
            prospectLines,
            provider: "google-speech-to-text",
            transcribedAt: new Date().toISOString(),
          }),
          gcsKey,
          gcsInternalUrl,
          rec.id,
          linked.id,
        ]
      );
    } else if (linked.table === "call_sessions") {
      await pool.query(
        `UPDATE call_sessions SET
           ai_transcript = $1,
           ai_analysis = $2,
           recording_s3_key = $3,
           recording_url = $4,
           telnyx_recording_id = $5,
           recording_status = 'available'
         WHERE id = $6`,
        [
          formattedTranscript,
          JSON.stringify({
            utterances: structured.utterances,
            formatted: formattedTranscript,
            agentLines,
            prospectLines,
            provider: "google-speech-to-text",
            transcribedAt: new Date().toISOString(),
          }),
          gcsKey,
          gcsInternalUrl,
          rec.id,
          linked.id,
        ]
      );
    } else if (linked.table === "dialer_call_attempts") {
      await pool.query(
        `UPDATE dialer_call_attempts SET
           recording_url = $1,
           transcript = $2,
           telnyx_recording_id = $3
         WHERE id = $4`,
        [gcsInternalUrl, formattedTranscript, rec.id, linked.id]
      );
    }

    stats.transcribed++;
    console.log(`${prefix}   Saved to ${linked.table}:${linked.id}`);
  } catch (err: any) {
    stats.failed++;
    console.error(`${prefix}   ERROR: ${err.message}`);
  }
}

// ─── Step 6: Also find DB records with recordings but no transcription ───────
async function findDbRecordsMissingTranscripts(): Promise<Array<{ table: string; id: string; audioUrl: string; s3Key: string | null; telnyxCallId: string | null }>> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);
  const sinceStr = since.toISOString();

  console.log(`\n[Bonus] Scanning DB for leads/call_sessions from last ${DAYS_BACK} days missing transcription …`);

  // Leads with recording but no structured transcript (duration > 10s only)
  const leadRows = await pool.query(
    `SELECT id, recording_url, recording_s3_key, telnyx_call_id
     FROM leads
     WHERE created_at >= $1
       AND (recording_url IS NOT NULL OR recording_s3_key IS NOT NULL)
       AND (structured_transcript IS NULL OR structured_transcript::text = 'null' OR structured_transcript::text = '{}')
       AND (transcript IS NULL OR length(transcript) < 20 OR transcription_status != 'completed')
       AND COALESCE(call_duration, 0) > 10
     ORDER BY created_at DESC`,
    [sinceStr]
  );

  // Call sessions with recording but no structured transcript (duration > 10s only)
  const csRows = await pool.query(
    `SELECT id, recording_url, recording_s3_key, telnyx_call_id
     FROM call_sessions
     WHERE started_at >= $1
       AND (recording_url IS NOT NULL OR recording_s3_key IS NOT NULL)
       AND (ai_transcript IS NULL OR length(ai_transcript) < 20)
       AND COALESCE(duration_sec, 0) > 10
     ORDER BY started_at DESC`,
    [sinceStr]
  );

  const results: Array<{ table: string; id: string; audioUrl: string; s3Key: string | null; telnyxCallId: string | null }> = [];

  for (const r of leadRows.rows) {
    const url = r.recording_url || (r.recording_s3_key ? `gcs-internal://bucket/${r.recording_s3_key}` : null);
    if (url) results.push({ table: "leads", id: r.id, audioUrl: url, s3Key: r.recording_s3_key, telnyxCallId: r.telnyx_call_id });
  }

  for (const r of csRows.rows) {
    const url = r.recording_url || (r.recording_s3_key ? `gcs-internal://bucket/${r.recording_s3_key}` : null);
    if (url) results.push({ table: "call_sessions", id: r.id, audioUrl: url, s3Key: r.recording_s3_key, telnyxCallId: r.telnyx_call_id });
  }

  console.log(`    Found ${leadRows.rows.length} leads + ${csRows.rows.length} call_sessions missing transcripts`);

  // Sort: records with GCS keys first (faster, no download needed)
  results.sort((a, b) => (b.s3Key ? 1 : 0) - (a.s3Key ? 1 : 0));
  const withGcs = results.filter(r => r.s3Key).length;
  console.log(`    ${withGcs} already in GCS, ${results.length - withGcs} need download`);

  return results;
}

async function transcribeMissingDbRecords(records: Array<{ table: string; id: string; audioUrl: string; s3Key: string | null; telnyxCallId: string | null }>) {
  let count = 0;
  for (const rec of records) {
    count++;
    const prefix = `[DB ${count}/${records.length}]`;
    console.log(`${prefix} Transcribing ${rec.table}:${rec.id} …`);

    if (DRY_RUN) {
      console.log(`${prefix}   [DRY-RUN] Would transcribe`);
      continue;
    }

    try {
      // If already in GCS, transcribe directly via gs:// URI
      // Otherwise, download → upload to GCS → transcribe via gs:// URI
      let gcsKey = rec.s3Key;
      let needsDownloadAndUpload = !gcsKey;

      if (needsDownloadAndUpload) {
        // Generate a GCS key and let transcribeViaGCS handle the download+upload
        gcsKey = `recordings/${rec.table}/${rec.id}/audio.wav`;
      }

      // Resolve audio source URL for download if needed
      let sourceUrl = rec.audioUrl;
      if (needsDownloadAndUpload) {
        // Try refreshing if it's a GCS internal URL
        if (rec.audioUrl.startsWith("gcs-internal://")) {
          const extractedKey = rec.audioUrl.replace(/^gcs-internal:\/\/[^/]+\//, "");
          try {
            sourceUrl = await getPresignedDownloadUrl(extractedKey, 3600);
            gcsKey = extractedKey; // already in GCS!
            needsDownloadAndUpload = false;
          } catch { /* fall through */ }
        }

        // If source URL looks like an expired Telnyx URL, try fetching fresh from Telnyx API
        if (needsDownloadAndUpload && rec.telnyxCallId) {
          try {
            const { fetchTelnyxRecording } = await import("../server/services/telnyx-recordings");
            const freshUrl = await fetchTelnyxRecording(rec.telnyxCallId);
            if (freshUrl) {
              sourceUrl = freshUrl;
              console.log(`${prefix}   Refreshed recording URL via Telnyx API`);
            }
          } catch { /* fall through to existing URL */ }
        }
      }

      const structured = await transcribeViaGCS(
        needsDownloadAndUpload ? sourceUrl : "",
        gcsKey!,
        { skipDownload: !needsDownloadAndUpload }
      );

      if (!structured || !structured.text) {
        console.error(`${prefix}   Empty transcription`);
        stats.failed++;
        continue;
      }

      const { formattedTranscript, agentLines, prospectLines } = formatTwoWayTranscript(structured);
      const wordCount = structured.text.split(/\s+/).length;
      console.log(`${prefix}   Transcribed: ${wordCount} words, ${structured.utterances.length} turns`);

      if (rec.table === "leads") {
        await pool.query(
          `UPDATE leads SET
             transcript = $1,
             structured_transcript = $2,
             recording_s3_key = COALESCE(recording_s3_key, $4),
             transcription_status = 'completed'
           WHERE id = $3`,
          [
            formattedTranscript,
            JSON.stringify({
              text: structured.text,
              utterances: structured.utterances,
              formatted: formattedTranscript,
              agentLines,
              prospectLines,
              provider: "google-speech-to-text",
              transcribedAt: new Date().toISOString(),
            }),
            rec.id,
            gcsKey,
          ]
        );
      } else if (rec.table === "call_sessions") {
        await pool.query(
          `UPDATE call_sessions SET
             ai_transcript = $1,
             ai_analysis = $2,
             recording_s3_key = COALESCE(recording_s3_key, $4)
           WHERE id = $3`,
          [
            formattedTranscript,
            JSON.stringify({
              utterances: structured.utterances,
              formatted: formattedTranscript,
              agentLines,
              prospectLines,
              provider: "google-speech-to-text",
              transcribedAt: new Date().toISOString(),
            }),
            rec.id,
            gcsKey,
          ]
        );
      }

      stats.transcribed++;
      console.log(`${prefix}   Saved ${rec.table}:${rec.id}`);
    } catch (err: any) {
      stats.failed++;
      console.error(`${prefix}   ERROR: ${err.message}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(80));
  console.log("  Telnyx 3-Day Recording Fetch + Google STT Two-Way Transcription");
  console.log("=".repeat(80));
  console.log(`  Date range : ${new Date(Date.now() - DAYS_BACK * 86400000).toISOString()} → now`);
  console.log(`  Dry run    : ${DRY_RUN}`);
  console.log(`  DB only    : ${DB_ONLY}`);
  console.log(`  Limit      : ${LIMIT === Infinity ? "none" : LIMIT}`);
  console.log(`  Min dur    : >10s`);
  console.log(`  Provider   : Google Cloud Speech-to-Text (telephony model)`);
  console.log(`  Diarization: 2-speaker (Agent / Prospect)`);
  console.log("=".repeat(80));

  // ── Phase 1: Telnyx API recordings (skip with --db-only) ──
  if (!DB_ONLY) {
    const recordings = await listTelnyxRecordings();

    if (recordings.length > 0) {
      const toProcess = recordings.slice(0, LIMIT);
      console.log(`\n[2/5] Linking ${toProcess.length} recordings to DB & checking transcription status …\n`);
      for (let i = 0; i < toProcess.length; i++) {
        await processRecording(toProcess[i], i, toProcess.length);
      }
    }
  } else {
    console.log("\n[1/5] Skipping Telnyx API (--db-only)\n");
  }

  // ── Phase 2: DB records that have recordings but are missing transcripts ──
  const missing = await findDbRecordsMissingTranscripts();
  if (missing.length > 0) {
    const toTranscribe = missing.slice(0, Math.max(0, LIMIT === Infinity ? missing.length : LIMIT - stats.transcribed));
    console.log(`\n[3/5] Transcribing ${toTranscribe.length} of ${missing.length} DB records missing structured transcripts …\n`);
    await transcribeMissingDbRecords(toTranscribe);
  }

  // ── Summary ──
  console.log("\n" + "=".repeat(80));
  console.log("  SUMMARY");
  console.log("=".repeat(80));
  console.log(`  Telnyx recordings found    : ${stats.totalRecordings}`);
  console.log(`  Linked to DB records       : ${stats.linked}`);
  console.log(`  Already transcribed (skip) : ${stats.alreadyTranscribed}`);
  console.log(`  No DB link (skip)          : ${stats.skippedNoLink}`);
  console.log(`  Downloaded & uploaded      : ${stats.downloaded}`);
  console.log(`  Successfully transcribed   : ${stats.transcribed}`);
  console.log(`  Failed                     : ${stats.failed}`);
  console.log("=".repeat(80));
}

main()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
