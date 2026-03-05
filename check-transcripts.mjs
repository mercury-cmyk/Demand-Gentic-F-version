import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

// Check last 20 calls with duration >= 20s
const result = await client.query(`
  SELECT
    dca.id,
    dca.call_duration_seconds,
    dca.disposition,
    dca.disposition_processed,
    dca.call_session_id,
    CASE WHEN dca.full_transcript IS NOT NULL AND LENGTH(dca.full_transcript) > 10 THEN LENGTH(dca.full_transcript) ELSE 0 END as transcript_len,
    LEFT(dca.full_transcript, 100) as transcript_preview,
    dca.created_at,
    cs.recording_url IS NOT NULL as has_recording_url,
    cs.recording_s3_key IS NOT NULL as has_recording_s3,
    CASE WHEN cs.ai_transcript IS NOT NULL AND LENGTH(cs.ai_transcript) > 10 THEN LENGTH(cs.ai_transcript) ELSE 0 END as session_transcript_len
  FROM dialer_call_attempts dca
  LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
  WHERE dca.call_duration_seconds >= 20
  ORDER BY dca.created_at DESC
  LIMIT 20
`);

console.log('\n=== Recent calls >= 20s ===');
for (const row of result.rows) {
  console.log(`\n  ID: ${row.id}`);
  console.log(`  Duration: ${row.call_duration_seconds}s | Disposition: ${row.disposition} | Processed: ${row.disposition_processed}`);
  console.log(`  Transcript: ${row.transcript_len} chars | Session transcript: ${row.session_transcript_len} chars`);
  console.log(`  Session: ${row.call_session_id || 'NONE'} | Recording URL: ${row.has_recording_url} | S3: ${row.has_recording_s3}`);
  console.log(`  Preview: ${row.transcript_preview || '(empty)'}`);
  console.log(`  Created: ${row.created_at}`);
}

// Summary stats
const stats = await client.query(`
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE full_transcript IS NOT NULL AND LENGTH(full_transcript) > 10) as with_transcript,
    COUNT(*) FILTER (WHERE call_session_id IS NOT NULL) as with_session,
    COUNT(*) FILTER (WHERE disposition_processed = true) as processed
  FROM dialer_call_attempts
  WHERE call_duration_seconds >= 20
    AND created_at > NOW() - INTERVAL '24 hours'
`);

console.log('\n=== Last 24h summary (calls >= 20s) ===');
console.log(stats.rows[0]);

await client.end();
