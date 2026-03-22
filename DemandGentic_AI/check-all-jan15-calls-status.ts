import { pool } from "./server/db";

async function checkAllCallsStatus() {
  console.log("========================================");
  console.log("ALL CALLS SINCE JAN 15, 2026");
  console.log("========================================\n");

  // Check call_sessions
  const sessionsResult = await pool.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(recording_url) AS with_recording,
      COUNT(ai_transcript) AS with_transcript,
      COUNT(CASE WHEN ai_transcript IS NULL AND recording_url IS NOT NULL THEN 1 END) AS needs_transcription,
      COUNT(CASE WHEN ai_transcript IS NULL AND recording_url IS NULL THEN 1 END) AS no_source
    FROM call_sessions
    WHERE created_at >= '2026-01-15'
  `);

  console.log("CALL_SESSIONS:");
  console.log(JSON.stringify(sessionsResult.rows[0], null, 2));
  console.log("");

  // Check leads (which have call data)
  const leadsResult = await pool.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(recording_url) AS with_recording,
      COUNT(transcript) AS with_transcript,
      COUNT(CASE WHEN (transcript IS NULL OR LENGTH(transcript) = '2026-01-15'
      AND call_duration > 0
  `);

  console.log("LEADS (with call data):");
  console.log(JSON.stringify(leadsResult.rows[0], null, 2));
  console.log("");

  // Check campaign_test_calls
  const testCallsResult = await pool.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(recording_url) AS with_recording,
      COUNT(full_transcript) AS with_transcript,
      COUNT(CASE WHEN full_transcript IS NULL AND recording_url IS NOT NULL THEN 1 END) AS needs_transcription,
      COUNT(CASE WHEN full_transcript IS NULL AND recording_url IS NULL THEN 1 END) AS no_source
    FROM campaign_test_calls
    WHERE created_at >= '2026-01-15'
  `);

  console.log("CAMPAIGN_TEST_CALLS:");
  console.log(JSON.stringify(testCallsResult.rows[0], null, 2));
  console.log("");

  // Sample of calls needing transcription
  console.log("========================================");
  console.log("SAMPLE: call_sessions needing transcription");
  console.log("========================================");
  const sampleSessions = await pool.query(`
    SELECT 
      id,
      created_at,
      recording_url,
      LENGTH(ai_transcript) AS transcript_len
    FROM call_sessions
    WHERE created_at >= '2026-01-15'
      AND recording_url IS NOT NULL
      AND (ai_transcript IS NULL OR LENGTH(ai_transcript) = '2026-01-15'
      AND call_duration > 0
      AND recording_url IS NOT NULL
      AND (transcript IS NULL OR LENGTH(transcript)  {
  console.error("Error:", e);
  process.exit(1);
});