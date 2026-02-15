import "dotenv/config";
import { pool } from "../server/db";

async function main() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 3);

    // Leads: how many have structured_transcript?
    const r1 = await pool.query(
      `SELECT count(*) as total,
              count(structured_transcript) FILTER (WHERE structured_transcript IS NOT NULL AND structured_transcript::text != 'null' AND structured_transcript::text != '{}') as with_structured,
              count(transcript) FILTER (WHERE length(transcript) > 20) as with_plain,
              count(recording_url) FILTER (WHERE recording_url IS NOT NULL) as with_recording_url,
              count(recording_s3_key) FILTER (WHERE recording_s3_key IS NOT NULL) as with_s3_key,
              count(telnyx_recording_id) FILTER (WHERE telnyx_recording_id IS NOT NULL) as with_telnyx_rec_id
       FROM leads WHERE created_at >= $1`,
      [since.toISOString()]
    );
    console.log("=== LEADS LAST 3 DAYS ===");
    console.log(JSON.stringify(r1.rows[0], null, 2));

    // Call sessions: check structured transcripts
    const r2 = await pool.query(
      `SELECT count(*) as total,
              count(ai_analysis) FILTER (WHERE ai_analysis IS NOT NULL AND ai_analysis::text LIKE '%utterances%') as with_structured,
              count(ai_transcript) FILTER (WHERE length(ai_transcript) > 20) as with_plain,
              count(recording_url) FILTER (WHERE recording_url IS NOT NULL) as with_recording_url,
              count(recording_s3_key) FILTER (WHERE recording_s3_key IS NOT NULL) as with_s3_key
       FROM call_sessions WHERE started_at >= $1`,
      [since.toISOString()]
    );
    console.log("\n=== CALL_SESSIONS LAST 3 DAYS ===");
    console.log(JSON.stringify(r2.rows[0], null, 2));

    // Call sessions missing transcript but have recording
    const r3 = await pool.query(
      `SELECT count(*) as missing
       FROM call_sessions 
       WHERE started_at >= $1
         AND (recording_url IS NOT NULL OR recording_s3_key IS NOT NULL)
         AND (ai_transcript IS NULL OR length(ai_transcript) < 20)`,
      [since.toISOString()]
    );
    console.log("\n=== CALL_SESSIONS NEEDING TRANSCRIPTION ===");
    console.log(JSON.stringify(r3.rows[0]));

    // Leads missing transcript but have recording
    const r4 = await pool.query(
      `SELECT count(*) as missing
       FROM leads 
       WHERE created_at >= $1
         AND (recording_url IS NOT NULL OR recording_s3_key IS NOT NULL)
         AND (transcript IS NULL OR length(transcript) < 20)`,
      [since.toISOString()]
    );
    console.log("\n=== LEADS NEEDING TRANSCRIPTION ===");
    console.log(JSON.stringify(r4.rows[0]));

    // Sample a few call_sessions missing transcripts to see their data
    const r5 = await pool.query(
      `SELECT id, telnyx_call_id, recording_url, recording_s3_key, duration_sec, agent_type
       FROM call_sessions 
       WHERE started_at >= $1
         AND (recording_url IS NOT NULL OR recording_s3_key IS NOT NULL)
         AND (ai_transcript IS NULL OR length(ai_transcript) < 20)
       ORDER BY started_at DESC
       LIMIT 5`,
      [since.toISOString()]
    );
    console.log("\n=== SAMPLE CALL_SESSIONS NEEDING TRANSCRIPTION ===");
    for (const row of r5.rows) {
      console.log(`  ${row.id} | type=${row.agent_type} | dur=${row.duration_sec}s | s3=${!!row.recording_s3_key} | url=${!!row.recording_url}`);
    }

  } catch (e) {
    console.error("ERROR:", e);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
