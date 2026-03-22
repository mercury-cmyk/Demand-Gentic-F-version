import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Find remaining NULL disposition calls with recordings that need transcription
const remaining = await pool.query(`
  SELECT cs.id as session_id, cs.recording_url, cs.recording_s3_key, cs.duration_sec,
    cs.campaign_id, cs.contact_id
  FROM call_sessions cs
  WHERE cs.ai_disposition IS NULL
    AND cs.duration_sec >= 20
    AND cs.recording_url IS NOT NULL
  ORDER BY cs.created_at DESC
`);

console.log("Found", remaining.rows.length, "calls needing transcription");
console.log("This will take a while... processing in batches of 5");

let transcribed = 0;
let analyzed = 0;
let failed = 0;
let skipped = 0;

const BATCH_SIZE = 5;
const total = remaining.rows.length;

for (let i = 0; i  {
      const recordingUrl = row.recording_url;
      if (!recordingUrl) return { transcribed: false, skipped: true };

      // Download and transcribe
      try {
        const mediaResponse = await fetch(recordingUrl);
        if (!mediaResponse.ok) return { transcribed: false, skipped: true };

        const arrayBuffer = await mediaResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length = total) {
    console.log(`Progress: ${processed}/${total} | transcribed: ${transcribed} | failed: ${failed} | skipped: ${skipped}`);
  }
}

console.log("\n=== Batch transcription complete ===");
console.log(`Transcribed: ${transcribed}, Failed: ${failed}, Skipped: ${skipped}`);

// Final distribution
const finalDist = await pool.query(`
  SELECT ai_disposition, COUNT(*) as cnt
  FROM call_sessions
  GROUP BY ai_disposition
  ORDER BY cnt DESC
`);
console.log("\n=== Final disposition distribution ===");
for (const r of finalDist.rows) {
  console.log("  " + String(r.ai_disposition || "NULL").padEnd(25) + " | " + r.cnt);
}

await pool.end();