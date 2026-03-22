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
  if (buf.length = 20 AND cs.telnyx_recording_id IS NOT NULL
`);
console.log("Found", withId.rows.length, "calls with telnyx_recording_id");

let transcribed = 0, failed = 0, skipped = 0;

for (let i = 0; i  {
    try {
      const freshUrl = await getFreshUrl(row.telnyx_recording_id);
      if (!freshUrl) { skipped++; return; }
      const text = await transcribeUrl(freshUrl);
      if (!text || text.length = 20
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