import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

// Find calls that were updated around VM activity time (March 5 17:00-17:30 UTC)
const vmCalls = await client.query(`
  SELECT
    dca.id,
    dca.call_duration_seconds,
    dca.disposition,
    dca.disposition_processed,
    dca.call_session_id,
    CASE WHEN dca.full_transcript IS NOT NULL AND LENGTH(dca.full_transcript) > 10 THEN LENGTH(dca.full_transcript) ELSE 0 END as transcript_len,
    LEFT(dca.full_transcript, 120) as transcript_preview,
    dca.call_started_at,
    dca.created_at,
    dca.updated_at,
    dca.disposition_processed_at
  FROM dialer_call_attempts dca
  WHERE dca.updated_at BETWEEN '2026-03-05T16:50:00Z' AND '2026-03-05T17:40:00Z'
    AND dca.disposition IS NOT NULL
  ORDER BY dca.updated_at DESC
  LIMIT 20
`);

console.log('\n=== Calls updated around VM activity time (March 5 16:50-17:40 UTC) ===');
for (const row of vmCalls.rows) {
  console.log(`\n  ID: ${row.id}`);
  console.log(`  Duration: ${row.call_duration_seconds}s | Disposition: ${row.disposition} | Processed: ${row.disposition_processed}`);
  console.log(`  Session: ${row.call_session_id || 'NONE'}`);
  console.log(`  Transcript: ${row.transcript_len} chars | Preview: ${row.transcript_preview || '(empty)'}`);
  console.log(`  Created: ${row.created_at} | Updated: ${row.updated_at}`);
  console.log(`  Started: ${row.call_started_at} | Dispo processed at: ${row.disposition_processed_at}`);
}

// Count ALL calls with disposition in different transcript states
const stats = await client.query(`
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE full_transcript LIKE '[SYSTEM:%') as system_placeholder,
    COUNT(*) FILTER (WHERE full_transcript IS NOT NULL AND LENGTH(full_transcript) > 70) as real_transcript,
    COUNT(*) FILTER (WHERE full_transcript IS NULL OR LENGTH(full_transcript) <= 10) as no_transcript,
    COUNT(*) FILTER (WHERE call_duration_seconds >= 20 AND (full_transcript IS NULL OR full_transcript LIKE '[SYSTEM:%')) as long_calls_no_real_transcript,
    COUNT(*) FILTER (WHERE call_duration_seconds >= 60 AND (full_transcript IS NULL OR full_transcript LIKE '[SYSTEM:%')) as very_long_calls_no_real_transcript
  FROM dialer_call_attempts
  WHERE disposition IS NOT NULL
`);

console.log('\n=== Overall transcript stats (all calls with disposition) ===');
console.log(stats.rows[0]);

// Check if there are any calls that match the VM callIds
const vmCallIds = [
  '48b67485-43bc-4294-b274-de42f3b438ce',
  'e925a037-f290-444c-a189-d78cf2e300c3',
  '2ed21f13-6d9e-486a-a433-595efd0d4c05',
  'f29812c9-20a4-4074-99ab-fe7e66db7b85',
];
const vmMatch = await client.query(`
  SELECT id, call_duration_seconds, disposition, full_transcript IS NOT NULL as has_transcript
  FROM dialer_call_attempts
  WHERE id = ANY($1)
`, [vmCallIds]);

console.log('\n=== Do VM call IDs exist in dialer_call_attempts? ===');
console.log(`Found ${vmMatch.rows.length} of ${vmCallIds.length}`);
for (const row of vmMatch.rows) {
  console.log(`  ${row.id} | ${row.call_duration_seconds}s | ${row.disposition} | transcript: ${row.has_transcript}`);
}

// The VM uses callId from Drachtio, not callAttemptId - check callSessions
const vmSessionMatch = await client.query(`
  SELECT id, telnyx_call_id, duration_sec, status, ai_transcript IS NOT NULL as has_transcript
  FROM call_sessions
  WHERE telnyx_call_id = ANY($1)
`, [vmCallIds]);

console.log('\n=== Do VM call IDs exist in call_sessions (as telnyx_call_id)? ===');
console.log(`Found ${vmSessionMatch.rows.length} of ${vmCallIds.length}`);

await client.end();
