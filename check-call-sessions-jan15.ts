import { pool } from "./server/db";

async function checkCallSessionsForTestPeriod() {
  // Check if there are ANY call_sessions during this period
  const result = await pool.query(`
    SELECT 
      id,
      created_at,
      recording_url,
      ai_transcript IS NOT NULL AS has_transcript,
      LENGTH(ai_transcript) AS transcript_length
    FROM call_sessions
    WHERE created_at >= '2026-01-15'
      AND (recording_url IS NOT NULL OR ai_transcript IS NOT NULL)
    ORDER BY created_at DESC
    LIMIT 50
  `);

  console.log(`Found ${result.rows.length} call_sessions with recordings/transcripts\n`);
  console.log(JSON.stringify(result.rows, null, 2));
  
  process.exit(0);
}

checkCallSessionsForTestPeriod().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
