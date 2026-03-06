import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

// Check calls with actual dispositions (not null), most recent first
const result = await client.query(`
  SELECT
    dca.id,
    dca.call_duration_seconds,
    dca.disposition,
    dca.disposition_processed,
    dca.call_session_id IS NOT NULL as has_session,
    CASE WHEN dca.full_transcript IS NOT NULL AND LENGTH(dca.full_transcript) > 10 THEN LENGTH(dca.full_transcript) ELSE 0 END as transcript_len,
    dca.created_at,
    dca.updated_at
  FROM dialer_call_attempts dca
  WHERE dca.disposition IS NOT NULL
  ORDER BY dca.updated_at DESC
  LIMIT 20
`);

console.log('\n=== Last 20 calls with disposition (by updated_at) ===');
for (const row of result.rows) {
  const updated = new Date(row.updated_at).toISOString();
  console.log(`${updated} | ${(row.call_duration_seconds || 0).toString().padStart(3)}s | ${row.disposition?.padEnd(18)} | processed: ${row.disposition_processed} | session: ${row.has_session} | transcript: ${row.transcript_len} chars`);
}

// Check calls that have call_started_at set recently
const result2 = await client.query(`
  SELECT
    dca.id,
    dca.call_duration_seconds,
    dca.disposition,
    dca.disposition_processed,
    dca.call_session_id IS NOT NULL as has_session,
    CASE WHEN dca.full_transcript IS NOT NULL AND LENGTH(dca.full_transcript) > 10 THEN LENGTH(dca.full_transcript) ELSE 0 END as transcript_len,
    dca.call_started_at,
    dca.call_ended_at
  FROM dialer_call_attempts dca
  WHERE dca.call_started_at IS NOT NULL
  ORDER BY dca.call_started_at DESC
  LIMIT 15
`);

console.log('\n=== Last 15 calls by call_started_at ===');
for (const row of result2.rows) {
  const started = row.call_started_at ? new Date(row.call_started_at).toISOString() : 'null';
  console.log(`${started} | ${(row.call_duration_seconds || 0).toString().padStart(3)}s | ${row.disposition?.padEnd(18) || 'null'.padEnd(18)} | processed: ${row.disposition_processed} | session: ${row.has_session} | transcript: ${row.transcript_len} chars`);
}

// Check active/recent dialer runs
const runs = await client.query(`
  SELECT id, campaign_id, status, started_at, ended_at
  FROM dialer_runs
  ORDER BY started_at DESC
  LIMIT 5
`);

console.log('\n=== Recent dialer runs ===');
for (const row of runs.rows) {
  console.log(`Run: ${row.id.substring(0,8)}... | Status: ${row.status} | Started: ${row.started_at} | Ended: ${row.ended_at || 'running'}`);
}

await client.end();
