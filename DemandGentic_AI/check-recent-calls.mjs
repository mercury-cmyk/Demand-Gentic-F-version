import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

// Check last 30 calls regardless of duration
const result = await client.query(`
  SELECT
    dca.id,
    dca.call_duration_seconds,
    dca.disposition,
    dca.disposition_processed,
    dca.call_session_id IS NOT NULL as has_session,
    CASE WHEN dca.full_transcript IS NOT NULL AND LENGTH(dca.full_transcript) > 10 THEN LENGTH(dca.full_transcript) ELSE 0 END as transcript_len,
    LEFT(dca.full_transcript, 80) as transcript_preview,
    dca.created_at
  FROM dialer_call_attempts dca
  ORDER BY dca.created_at DESC
  LIMIT 30
`);

console.log('\n=== Last 30 calls (any duration) ===');
for (const row of result.rows) {
  const ts = new Date(row.created_at).toISOString();
  console.log(`${ts} | ${(row.call_duration_seconds || 0).toString().padStart(3)}s | ${row.disposition?.padEnd(18) || 'null'.padEnd(18)} | processed: ${row.disposition_processed} | session: ${row.has_session} | transcript: ${row.transcript_len} chars`);
}

// Today's calls summary
const today = await client.query(`
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE call_duration_seconds >= 20) as over_20s,
    COUNT(*) FILTER (WHERE call_duration_seconds >= 30) as over_30s,
    COUNT(*) FILTER (WHERE full_transcript IS NOT NULL AND LENGTH(full_transcript) > 10) as with_transcript,
    COUNT(*) FILTER (WHERE disposition_processed = true) as processed,
    COUNT(*) FILTER (WHERE disposition = 'voicemail') as voicemail,
    COUNT(*) FILTER (WHERE disposition = 'no_answer') as no_answer,
    COUNT(*) FILTER (WHERE disposition = 'not_interested') as not_interested,
    COUNT(*) FILTER (WHERE disposition = 'qualified_lead') as qualified_lead,
    MAX(created_at) as last_call
  FROM dialer_call_attempts
  WHERE created_at > NOW() - INTERVAL '12 hours'
`);

console.log('\n=== Last 12h summary ===');
console.log(today.rows[0]);

// Check when last campaign ran
const lastRun = await client.query(`
  SELECT id, campaign_id, status, started_at, ended_at, total_calls
  FROM dialer_runs
  ORDER BY started_at DESC
  LIMIT 5
`);

console.log('\n=== Recent dialer runs ===');
for (const row of lastRun.rows) {
  console.log(`Run: ${row.id.substring(0,8)}... | Campaign: ${row.campaign_id?.substring(0,8)}... | Status: ${row.status} | Started: ${row.started_at} | Calls: ${row.total_calls}`);
}

await client.end();