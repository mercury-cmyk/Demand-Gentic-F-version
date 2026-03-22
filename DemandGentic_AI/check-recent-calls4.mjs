import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

// Check the 0s/null disposition attempts from March 4
const orphans = await client.query(`
  SELECT
    id, campaign_id, contact_id, phone_dialed,
    call_duration_seconds, disposition, disposition_processed,
    call_session_id, full_transcript IS NOT NULL as has_transcript,
    call_started_at, created_at, updated_at
  FROM dialer_call_attempts
  WHERE created_at > '2026-03-04T05:00:00Z'
    AND created_at  10 THEN LENGTH(full_transcript) ELSE 0 END as transcript_len,
    LEFT(full_transcript, 80) as preview,
    disposition_processed_at, created_at
  FROM dialer_call_attempts
  WHERE disposition_processed_at BETWEEN '2026-03-05T16:00:00Z' AND '2026-03-05T18:00:00Z'
  ORDER BY disposition_processed_at DESC
  LIMIT 20
`);

console.log('\n=== Calls with disposition_processed_at on March 5 16:00-18:00 UTC ===');
for (const row of march5.rows) {
  const dpa = row.disposition_processed_at ? new Date(row.disposition_processed_at).toISOString() : 'null';
  console.log(`${dpa} | ${(row.call_duration_seconds||0).toString().padStart(3)}s | ${row.disposition?.padEnd(18)||'null'.padEnd(18)} | session: ${row.has_session} | transcript: ${row.transcript_len} chars | ${row.preview || '(none)'}`);
}

// Check call_sessions created recently
const recentSessions = await client.query(`
  SELECT
    id, status, agent_type, from_number, duration_sec,
    ai_disposition,
    CASE WHEN ai_transcript IS NOT NULL AND LENGTH(ai_transcript) > 10 THEN LENGTH(ai_transcript) ELSE 0 END as transcript_len,
    LEFT(ai_transcript, 80) as preview,
    created_at
  FROM call_sessions
  ORDER BY created_at DESC
  LIMIT 10
`);

console.log('\n=== Most recent call_sessions ===');
for (const row of recentSessions.rows) {
  console.log(`${new Date(row.created_at).toISOString()} | ${row.status} | ${row.agent_type} | from: ${row.from_number} | ${row.duration_sec}s | disp: ${row.ai_disposition} | transcript: ${row.transcript_len} chars`);
}

await client.end();