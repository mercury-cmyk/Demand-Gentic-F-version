import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

// Absolute most recent call attempts by created_at
const latest = await client.query(`
  SELECT id, campaign_id, contact_id, phone_dialed,
    call_duration_seconds, disposition, disposition_processed,
    call_session_id IS NOT NULL as has_session,
    created_at, updated_at, call_started_at
  FROM dialer_call_attempts
  ORDER BY created_at DESC
  LIMIT 5
`);

console.log('\n=== Absolute latest call attempts ===');
for (const row of latest.rows) {
  console.log(`  Created: ${new Date(row.created_at).toISOString()} | Updated: ${new Date(row.updated_at).toISOString()}`);
  console.log(`  ID: ${row.id} | Duration: ${row.call_duration_seconds}s | Disp: ${row.disposition} | Processed: ${row.disposition_processed} | Session: ${row.has_session}`);
  console.log(`  Phone: ${row.phone_dialed} | Started: ${row.call_started_at ? new Date(row.call_started_at).toISOString() : 'null'}`);
  console.log('');
}

// Check campaign_queue for pending items
const queue = await client.query(`
  SELECT status, COUNT(*) as cnt
  FROM campaign_queue
  GROUP BY status
  ORDER BY cnt DESC
`);

console.log('\n=== Campaign queue status ===');
for (const row of queue.rows) {
  console.log(`  ${row.status}: ${row.cnt}`);
}

// Check if there are any active calls right now
const activeCalls = await client.query(`
  SELECT COUNT(*) as cnt
  FROM campaign_queue
  WHERE status = 'calling'
`);
console.log(`\n  Currently calling: ${activeCalls.rows[0].cnt}`);

// Check if the callback endpoint is logging anything - look at recent call_sessions with from_number='sip'
const sipSessions = await client.query(`
  SELECT id, status, duration_sec, ai_disposition,
    CASE WHEN ai_transcript IS NOT NULL AND LENGTH(ai_transcript) > 10 THEN LENGTH(ai_transcript) ELSE 0 END as transcript_len,
    created_at, from_number
  FROM call_sessions
  WHERE from_number = 'sip'
  ORDER BY created_at DESC
  LIMIT 5
`);

console.log('\n=== Recent SIP-origin call sessions ===');
for (const row of sipSessions.rows) {
  console.log(`  ${new Date(row.created_at).toISOString()} | ${row.status} | ${row.duration_sec}s | disp: ${row.ai_disposition} | transcript: ${row.transcript_len} chars`);
}

await client.end();
