import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

async function getFreshUrl(recordingId) {
  const resp = await fetch(`https://api.telnyx.com/v2/recordings/${recordingId}`, {
    headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.data?.download_urls?.mp3 || data?.data?.download_urls?.wav || null;
}

async function transcribeUrl(url) {
  const mediaResponse = await fetch(url);
  if (!mediaResponse.ok) return null;
  const buf = Buffer.from(await mediaResponse.arrayBuffer());
  if (buf.length < 1000) return null;
  const ct = mediaResponse.headers.get("content-type") || "audio/mp3";
  const ext = ct.includes("wav") ? "wav" : "mp3";
  const file = new File([buf], `rec.${ext}`, { type: ct });
  const form = new FormData();
  form.append("file", file);
  form.append("model", "distil-whisper/distil-large-v2");
  const sttResp = await fetch("https://api.telnyx.com/v2/ai/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
    body: form,
  });
  if (!sttResp.ok) return null;
  const result = await sttResp.json();
  return result.text || null;
}

function classifyDisposition(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("voicemail") || t.includes("leave a message") || t.includes("after the tone") || t.includes("after the beep")) return "voicemail";
  if (t.includes("do not call") || t.includes("stop calling")) return "do_not_call";
  if (t.includes("not interested") || t.includes("no thanks") || t.includes("no thank you")) return "not_interested";
  if (t.includes("call back") || t.includes("callback") || t.includes("call me back")) return "callback_requested";
  if (t.includes("interested") || t.includes("tell me more") || t.includes("schedule") || t.includes("appointment")) return "qualified_lead";
  if (t.includes("wrong number") || t.includes("wrong person")) return "invalid_data";
  if (t.length < 100) return "no_answer";
  return "needs_review";
}

// Phase 1: Process calls with telnyx_recording_id
console.log("=== Phase 1: Re-fetch URLs for calls with telnyx_recording_id ===");
const withId = await pool.query(`
  SELECT cs.id, cs.telnyx_recording_id
  FROM call_sessions cs
  WHERE cs.ai_disposition IS NULL AND cs.duration_sec >= 20 AND cs.telnyx_recording_id IS NOT NULL
`);
console.log("Found", withId.rows.length, "calls with telnyx_recording_id");

let transcribed = 0, failed = 0, skipped = 0;

for (let i = 0; i < withId.rows.length; i += 3) {
  const batch = withId.rows.slice(i, i + 3);
  await Promise.allSettled(batch.map(async (row) => {
    try {
      const freshUrl = await getFreshUrl(row.telnyx_recording_id);
      if (!freshUrl) { skipped++; return; }
      const text = await transcribeUrl(freshUrl);
      if (!text || text.length < 20) { skipped++; return; }
      const dispo = classifyDisposition(text);
      await pool.query(`UPDATE call_sessions SET ai_transcript = $1, ai_disposition = $2, recording_url = $3 WHERE id = $4`,
        [text, dispo, freshUrl, row.id]);
      transcribed++;
    } catch (e) {
      failed++;
    }
  }));
  if ((i + 3) % 30 === 0) console.log(`  Progress: ${i + 3}/${withId.rows.length} | transcribed: ${transcribed} | skipped: ${skipped}`);
}
console.log(`Phase 1 done: ${transcribed} transcribed, ${failed} failed, ${skipped} skipped`);

// Phase 2: Try listing recordings from Telnyx API for remaining
console.log("\n=== Phase 2: Check Telnyx API for remaining recordings ===");
const listResp = await fetch("https://api.telnyx.com/v2/recordings?page[size]=5&sort=-created_at", {
  headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
});
if (listResp.ok) {
  const data = await listResp.json();
  console.log("Total recordings on Telnyx:", data.meta?.total_results || "unknown");
} else {
  console.log("Telnyx API error:", listResp.status);
}

// Mark remaining as needs_review (recordings expired, can't be recovered)
const markRemaining = await pool.query(`
  UPDATE call_sessions SET ai_disposition = 'needs_review'
  WHERE ai_disposition IS NULL AND duration_sec >= 20
  RETURNING id
`);
console.log("\nMarked remaining", markRemaining.rowCount, "calls as needs_review (expired recordings)");

// Final distribution
const finalDist = await pool.query(`
  SELECT ai_disposition, COUNT(*) as cnt FROM call_sessions GROUP BY ai_disposition ORDER BY cnt DESC
`);
console.log("\n=== Final disposition distribution ===");
for (const r of finalDist.rows) {
  console.log("  " + String(r.ai_disposition || "NULL").padEnd(25) + " | " + r.cnt);
}

await pool.end();
