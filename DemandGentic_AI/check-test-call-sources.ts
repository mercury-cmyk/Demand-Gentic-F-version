import { pool } from "./server/db";

async function checkTestCallSources() {
  const result = await pool.query(`
    SELECT 
      ctc.id,
      ctc.call_session_id,
      ctc.recording_url,
      ctc.status,
      ctc.duration_seconds,
      ctc.full_transcript IS NOT NULL AS has_transcript,
      cs.ai_transcript IS NOT NULL AS session_has_transcript,
      cs.recording_url AS session_recording_url
    FROM campaign_test_calls ctc
    LEFT JOIN call_sessions cs ON cs.id = ctc.call_session_id
    WHERE ctc.created_at >= '2026-01-15'
      AND (ctc.full_transcript IS NULL OR length(ctc.full_transcript)  {
  console.error("Error:", e);
  process.exit(1);
});