import pg from "pg";
const pool = new pg.Pool({ connectionString: "postgresql://neondb_owner:npg_ZUebJ2hB5FOw@ep-shy-sound-ai9ezw1k-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require" });

// Get actual columns first
const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'call_sessions' ORDER BY ordinal_position`);
console.log("=== call_sessions columns ===");
console.log(cols.rows.map(r => r.column_name).join(", "));

// needs_review calls - what data do they have?
const nr = await pool.query(`
  SELECT COUNT(*) as total,
    COUNT(telnyx_recording_id) as has_rec_id,
    COUNT(recording_url) as has_rec_url,
    COUNT(ai_transcript) as has_transcript,
    COUNT(from_number) as has_from
  FROM call_sessions
  WHERE ai_disposition = 'needs_review'
`);
console.log("\n=== needs_review calls data availability ===");
console.log(nr.rows[0]);

// Break down by duration
const byDur = await pool.query(`
  SELECT
    CASE
      WHEN duration_sec >= 30 THEN '30s+'
      WHEN duration_sec >= 20 THEN '20-29s'
      WHEN duration_sec > 0 THEN '1-19s'
      ELSE '0s'
    END as duration_bucket,
    COUNT(*) as cnt,
    COUNT(telnyx_recording_id) as with_rec_id,
    COUNT(recording_url) as with_rec_url,
    COUNT(ai_transcript) as with_transcript
  FROM call_sessions
  WHERE ai_disposition = 'needs_review'
  GROUP BY 1 ORDER BY 1
`);
console.log("\n=== needs_review by duration ===");
for (const r of byDur.rows) console.log(JSON.stringify(r));

// Date range
const dateRange = await pool.query(`
  SELECT MIN(created_at) as earliest, MAX(created_at) as latest
  FROM call_sessions WHERE ai_disposition = 'needs_review'
`);
console.log("\n=== Date range ===");
console.log(dateRange.rows[0]);

// Sample 30s+ calls
const sample = await pool.query(`
  SELECT id, telnyx_recording_id, recording_url,
    from_number, duration_sec, created_at,
    LEFT(ai_transcript, 100) as transcript_preview
  FROM call_sessions
  WHERE ai_disposition = 'needs_review' AND duration_sec >= 30
  ORDER BY created_at DESC
  LIMIT 5
`);
console.log("\n=== Sample 30s+ needs_review calls ===");
for (const r of sample.rows) console.log(JSON.stringify(r, null, 2));

// Check calls that DO have transcripts but are needs_review
const withTranscript = await pool.query(`
  SELECT COUNT(*) as cnt FROM call_sessions
  WHERE ai_disposition = 'needs_review' AND ai_transcript IS NOT NULL AND LENGTH(ai_transcript) > 50
`);
console.log("\n=== needs_review WITH existing transcripts (>50 chars) ===");
console.log(withTranscript.rows[0]);

await pool.end();
