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
  if (t.length  0 ? (transcribed / (elapsed / 60)).toFixed(1) : "0";
  const eta = rate > 0 ? ((total - totalProcessed) / rate).toFixed(0) : "?";
  console.log(`[${elapsed}s] ${totalProcessed}/${total} | OK: ${transcribed} | Fail: ${failed} | NoRec: ${noRecording} | Retries: ${retries} | ${rate}/min | ETA: ${eta}min`);
}

async function processBatch(rows) {
  for (let i = 0; i = rows.length) logProgress(rows.length);
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
    AND (ai_transcript IS NULL OR LENGTH(ai_transcript) = 30
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
    AND (ai_transcript IS NULL OR LENGTH(ai_transcript) = 20 AND duration_sec < 30
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