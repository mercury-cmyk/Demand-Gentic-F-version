import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

// Call attempts by hour (last 7 days)
const latest = await client.query(`
  SELECT
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as cnt,
    COUNT(*) FILTER (WHERE disposition IS NOT NULL) as with_dispo,
    COUNT(*) FILTER (WHERE call_duration_seconds > 0) as with_duration
  FROM dialer_call_attempts
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY DATE_TRUNC('hour', created_at)
  ORDER BY hour DESC
  LIMIT 20
`);

console.log('\n=== Call attempts by hour (last 7 days) ===');
for (const row of latest.rows) {
  console.log(`${new Date(row.hour).toISOString()} | ${row.cnt} attempts | ${row.with_dispo} w/dispo | ${row.with_duration} w/duration`);
}

// Ghost sessions
const ghostSessions = await client.query(`
  SELECT cs.id, cs.status, cs.duration_sec, cs.ai_disposition, cs.from_number,
    cs.created_at,
    CASE WHEN cs.ai_transcript IS NOT NULL AND LENGTH(cs.ai_transcript) > 10 THEN LENGTH(cs.ai_transcript) ELSE 0 END as transcript_len
  FROM call_sessions cs
  LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
  WHERE cs.created_at > '2026-03-04T00:00:00Z'
    AND dca.id IS NULL
  ORDER BY cs.created_at DESC
  LIMIT 10
`);

console.log('\n=== Call sessions WITHOUT matching call attempts (after March 4) ===');
for (const row of ghostSessions.rows) {
  console.log(`${new Date(row.created_at).toISOString()} | ${row.status} | ${row.duration_sec}s | from: ${row.from_number} | disp: ${row.ai_disposition} | transcript: ${row.transcript_len}`);
}

// Activity in last 24h
const recentActivity = await client.query(`
  SELECT 'call_sessions' as source, COUNT(*) as cnt FROM call_sessions WHERE created_at > NOW() - INTERVAL '24 hours'
  UNION ALL
  SELECT 'call_attempts_created', COUNT(*) FROM dialer_call_attempts WHERE created_at > NOW() - INTERVAL '24 hours'
  UNION ALL
  SELECT 'call_attempts_updated', COUNT(*) FROM dialer_call_attempts WHERE updated_at > NOW() - INTERVAL '24 hours'
`);

console.log('\n=== Activity in last 24 hours ===');
for (const row of recentActivity.rows) {
  console.log(`  ${row.source}: ${row.cnt}`);
}

const timeResult = await client.query(`SELECT NOW() as now`);
console.log('\nDB Time:', timeResult.rows[0].now);

await client.end();