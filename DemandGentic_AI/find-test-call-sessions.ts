import { pool } from "./server/db";

async function linkTestCallsToSessions() {
  // Find call_sessions that might correspond to these test calls
  // Look for sessions created around the same time as test calls
  const result = await pool.query(`
    WITH test_calls_needing_link AS (
      SELECT 
        id,
        created_at,
        status,
        duration_seconds
      FROM campaign_test_calls
      WHERE created_at >= '2026-01-15'
        AND call_session_id IS NULL
        AND recording_url IS NULL
    )
    SELECT 
      tc.id AS test_call_id,
      tc.created_at AS test_call_time,
      tc.status AS test_call_status,
      tc.duration_seconds,
      cs.id AS session_id,
      cs.created_at AS session_time,
      cs.recording_url,
      cs.ai_transcript IS NOT NULL AS has_transcript,
      EXTRACT(EPOCH FROM (cs.created_at - tc.created_at)) AS time_diff_seconds
    FROM test_calls_needing_link tc
    JOIN call_sessions cs 
      ON cs.created_at BETWEEN tc.created_at - INTERVAL '5 minutes' 
                           AND tc.created_at + INTERVAL '5 minutes'
    WHERE cs.recording_url IS NOT NULL 
       OR cs.ai_transcript IS NOT NULL
    ORDER BY tc.created_at DESC, ABS(EXTRACT(EPOCH FROM (cs.created_at - tc.created_at)))
  `);

  console.log(`Found ${result.rows.length} potential matches\n`);
  console.log(JSON.stringify(result.rows, null, 2));
  
  process.exit(0);
}

linkTestCallsToSessions().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});