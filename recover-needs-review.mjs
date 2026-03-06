import pg from "pg";
const pool = new pg.Pool({
  connectionString: "postgresql://neondb_owner:npg_ZUebJ2hB5FOw@ep-shy-sound-ai9ezw1k-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
  max: 10,
});
const TELNYX_API_KEY = "KEY019CB8C010B16CC2E7B6801C11E172A2_3pb7HEe2p3CWf6iApgJp2H";
const CONCURRENCY = 3; // Respect Telnyx STT rate limits
const MAX_RETRIES = 3;

let totalProcessed = 0, transcribed = 0, failed = 0, noRecording = 0, retries = 0;
const dispositions = {};
const startTime = Date.now();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function classifyDisposition(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("voicemail") || t.includes("leave a message") || t.includes("not available") || t.includes("press 1") || t.includes("after the tone") || t.includes("after the beep") || t.includes("mailbox") || t.includes("record your message") || t.includes("please leave") || t.includes("at the tone") || t.includes("greeting")) return "voicemail";
  if (t.includes("do not call") || t.includes("stop calling") || t.includes("dont call") || t.includes("don't call") || t.includes("remove my number") || t.includes("take me off")) return "do_not_call";
  if (t.includes("not interested") || t.includes("no thanks") || t.includes("no thank you") || t.includes("no, thank") || t.includes("don't need") || t.includes("dont need") || t.includes("not looking")) return "not_interested";
  if (t.includes("call back") || t.includes("callback") || t.includes("call me back") || t.includes("try again later") || t.includes("call later") || t.includes("busy right now") || t.includes("in a meeting")) return "callback_requested";
  if (t.includes("interested") || t.includes("tell me more") || t.includes("send me info") || t.includes("schedule") || t.includes("set up a meeting") || t.includes("appointment") || t.includes("sounds good") || t.includes("let's talk")) return "qualified_lead";
  if (t.includes("wrong number") || t.includes("wrong person") || t.includes("no longer") || t.includes("doesn't work here") || t.includes("retired") || t.includes("left the company")) return "invalid_data";
  if (t.length < 100) return "no_answer";
  return "needs_review";
}

function extractCallLegId(url) {
  if (!url) return null;
  const match = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+\.(wav|mp3)/);
  return match ? match[1] : null;
}

async function findRecordingByCallLegId(callLegId) {
  const url = `https://api.telnyx.com/v2/recordings?filter[call_leg_id]=${callLegId}&page[size]=1`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${TELNYX_API_KEY}` } });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.data || data.data.length === 0) return null;
  const rec = data.data[0];
  return { id: rec.id, mp3: rec.download_urls?.mp3, wav: rec.download_urls?.wav };
}

async function transcribeWithRetry(url) {
  // Download once
  const mediaResponse = await fetch(url);
  if (!mediaResponse.ok) throw new Error(`download ${mediaResponse.status}`);
  const buf = Buffer.from(await mediaResponse.arrayBuffer());
  if (buf.length < 1000) throw new Error(`too small ${buf.length}`);
  const ct = mediaResponse.headers.get("content-type") || "audio/wav";
  const ext = ct.includes("wav") ? "wav" : "mp3";

  // Retry STT with exponential backoff
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const blob = new Blob([buf], { type: ct });
    const form = new FormData();
    form.append("file", blob, `recording.${ext}`);
    form.append("model", "distil-whisper/distil-large-v2");

    const sttResp = await fetch("https://api.telnyx.com/v2/ai/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
      body: form,
    });

    if (sttResp.ok) {
      const result = await sttResp.json();
      return result.text || null;
    }

    if (sttResp.status === 429) {
      retries++;
      const wait = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000; // 2s, 4s, 8s + jitter
      await sleep(wait);
      continue;
    }

    throw new Error(`STT ${sttResp.status}`);
  }
  throw new Error("max retries exceeded");
}

async function processCall(row) {
  totalProcessed++;
  try {
    const callLegId = extractCallLegId(row.recording_url);
    if (!callLegId) { noRecording++; return; }

    const rec = await findRecordingByCallLegId(callLegId);
    if (!rec || (!rec.mp3 && !rec.wav)) { noRecording++; return; }

    const downloadUrl = rec.mp3 || rec.wav;
    const text = await transcribeWithRetry(downloadUrl);
    if (!text || text.length < 10) { failed++; return; }

    const dispo = classifyDisposition(text);
    dispositions[dispo] = (dispositions[dispo] || 0) + 1;

    await pool.query(
      `UPDATE call_sessions SET ai_transcript = $1, ai_disposition = $2, recording_url = $3, telnyx_recording_id = $4 WHERE id = $5`,
      [text, dispo, downloadUrl, rec.id, row.id]
    );
    transcribed++;
  } catch (e) {
    failed++;
  }
}

function logProgress(total) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const rate = elapsed > 0 ? (transcribed / (elapsed / 60)).toFixed(1) : "0";
  const eta = rate > 0 ? ((total - totalProcessed) / rate).toFixed(0) : "?";
  console.log(`[${elapsed}s] ${totalProcessed}/${total} | OK: ${transcribed} | Fail: ${failed} | NoRec: ${noRecording} | Retries: ${retries} | ${rate}/min | ETA: ${eta}min`);
}

async function processBatch(rows) {
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(processCall));
    // Small delay between batches to avoid rate limits
    await sleep(200);
    if (totalProcessed % 50 === 0 || i + CONCURRENCY >= rows.length) logProgress(rows.length);
  }
}

// ===================== MAIN =====================
console.log("=== Recovery v3 (concurrency: " + CONCURRENCY + ", retry+backoff) ===\n");

// Phase 1: Reclassify existing transcripts
console.log("--- Phase 1: Reclassify existing transcripts ---");
const withT = await pool.query(`
  SELECT id, ai_transcript FROM call_sessions
  WHERE ai_disposition = 'needs_review' AND ai_transcript IS NOT NULL AND LENGTH(ai_transcript) > 30
`);
let p1 = 0;
for (const row of withT.rows) {
  const d = classifyDisposition(row.ai_transcript);
  if (d !== "needs_review") {
    await pool.query(`UPDATE call_sessions SET ai_disposition = $1 WHERE id = $2`, [d, row.id]);
    p1++;
    dispositions[d] = (dispositions[d] || 0) + 1;
  }
}
console.log(`Reclassified ${p1} from transcripts`);

// Phase 2: Transcribe 30s+ calls
console.log("\n--- Phase 2: Transcribe 30s+ ---");
const calls30 = await pool.query(`
  SELECT id, recording_url, duration_sec
  FROM call_sessions
  WHERE ai_disposition = 'needs_review'
    AND recording_url IS NOT NULL AND recording_url LIKE '%s3.amazonaws.com%'
    AND (ai_transcript IS NULL OR LENGTH(ai_transcript) < 30)
    AND duration_sec >= 30
  ORDER BY duration_sec ASC
`);
console.log(`${calls30.rows.length} calls`);
await processBatch(calls30.rows);

// Phase 3: 20-29s calls
console.log("\n--- Phase 3: Transcribe 20-29s ---");
const calls20 = await pool.query(`
  SELECT id, recording_url, duration_sec
  FROM call_sessions
  WHERE ai_disposition = 'needs_review'
    AND recording_url IS NOT NULL AND recording_url LIKE '%s3.amazonaws.com%'
    AND (ai_transcript IS NULL OR LENGTH(ai_transcript) < 30)
    AND duration_sec >= 20 AND duration_sec < 30
  ORDER BY duration_sec ASC
`);
console.log(`${calls20.rows.length} calls`);
await processBatch(calls20.rows);

// Phase 4: Short → no_answer
console.log("\n--- Phase 4: Short → no_answer ---");
const short = await pool.query(`
  UPDATE call_sessions SET ai_disposition = 'no_answer'
  WHERE ai_disposition = 'needs_review' AND duration_sec < 20
    AND (ai_transcript IS NULL OR LENGTH(ai_transcript) < 30)
  RETURNING id
`);
console.log(`${short.rowCount} short → no_answer`);
const zero = await pool.query(`
  UPDATE call_sessions SET ai_disposition = 'no_answer'
  WHERE ai_disposition = 'needs_review' AND (duration_sec IS NULL OR duration_sec = 0)
    AND (ai_transcript IS NULL OR LENGTH(ai_transcript) < 30)
  RETURNING id
`);
console.log(`${zero.rowCount} zero-dur → no_answer`);

// Final
const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
console.log(`\n=== DONE in ${elapsed} min | OK: ${transcribed} | Fail: ${failed} | NoRec: ${noRecording} | Retries: ${retries} ===`);
console.log("Dispositions:", dispositions);

const final = await pool.query(`SELECT ai_disposition, COUNT(*) as cnt FROM call_sessions GROUP BY ai_disposition ORDER BY cnt DESC`);
console.log("\nFinal distribution:");
for (const r of final.rows) console.log("  " + String(r.ai_disposition || "NULL").padEnd(25) + " | " + r.cnt);

const nr = await pool.query(`SELECT COUNT(*) as cnt FROM call_sessions WHERE ai_disposition = 'needs_review'`);
console.log(`\nRemaining needs_review: ${nr.rows[0].cnt}`);
await pool.end();
