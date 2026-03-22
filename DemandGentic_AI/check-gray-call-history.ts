import { pool } from "./server/db";

async function checkGrayCallHistory() {
  console.log("========================================");
  console.log("GRAY BEKURS CALL HISTORY");
  console.log("========================================\n");

  // Check all calls to this number
  const result = await pool.query(`
    SELECT 
      id,
      contact_name,
      dialed_number,
      call_duration,
      created_at,
      updated_at,
      recording_url,
      LENGTH(transcript) as transcript_length,
      telnyx_call_id,
      call_attempt_id
    FROM leads
    WHERE dialed_number = '+12054840419'
      OR contact_name ILIKE '%gray%bekurs%'
    ORDER BY updated_at DESC
  `);

  console.log(`Found ${result.rows.length} calls:\n`);
  result.rows.forEach((row, idx) => {
    console.log(`CALL ${idx + 1}:`);
    console.log(`  ID: ${row.id}`);
    console.log(`  Name: ${row.contact_name}`);
    console.log(`  Phone: ${row.dialed_number}`);
    console.log(`  Duration: ${row.call_duration}s`);
    console.log(`  Created: ${row.created_at}`);
    console.log(`  Updated: ${row.updated_at}`);
    console.log(`  Telnyx ID: ${row.telnyx_call_id || 'NULL'}`);
    console.log(`  Transcript Length: ${row.transcript_length || 0} chars`);
    console.log(`  Recording URL: ${row.recording_url ? 'Present' : 'NULL'}`);
    console.log('');
  });

  // Get the full transcript for the 40s call
  console.log("========================================");
  console.log("FULL TRANSCRIPT (40s call)");
  console.log("========================================\n");
  
  const transcriptResult = await pool.query(`
    SELECT transcript
    FROM leads
    WHERE id = '2a244f3a-d5f2-49d5-b0de-e4bfa96936bd'
  `);

  if (transcriptResult.rows[0]) {
    console.log(transcriptResult.rows[0].transcript);
  }

  // Check call_sessions for this number
  console.log("\n========================================");
  console.log("CALL_SESSIONS FOR THIS NUMBER");
  console.log("========================================\n");

  const sessionsResult = await pool.query(`
    SELECT 
      id,
      created_at,
      duration_seconds,
      status,
      ai_transcript,
      LENGTH(ai_transcript) as transcript_length
    FROM call_sessions
    WHERE created_at >= '2026-01-15'
    ORDER BY created_at DESC
    LIMIT 20
  `);

  console.log(`Recent call_sessions: ${sessionsResult.rows.length}`);
  sessionsResult.rows.forEach((row, idx) => {
    console.log(`\nSession ${idx + 1}:`);
    console.log(`  ID: ${row.id}`);
    console.log(`  Created: ${row.created_at}`);
    console.log(`  Duration: ${row.duration_seconds}s`);
    console.log(`  Status: ${row.status}`);
    console.log(`  Transcript: ${row.transcript_length || 0} chars`);
  });

  process.exit(0);
}

checkGrayCallHistory().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});