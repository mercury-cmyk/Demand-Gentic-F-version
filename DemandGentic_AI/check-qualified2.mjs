import pg from 'pg';
const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();

// Check leads for qualified attempts
const ids = [
  'f350e83a-dd61-44e6-9044-e08f2d2e71d1',
  'ed46c034-a490-4225-bb66-799351e00bd8',
  '74c4a009-257a-40e5-b12a-e78e5af1cc63',
  '853d1a17-6cfa-483c-8580-83e842f72cfe',
  '894260d5-056a-47db-a307-2786c33a2f24'
];

const leads = await client.query(`
  SELECT id, call_attempt_id, qa_status, created_at
  FROM leads
  WHERE call_attempt_id = ANY($1)
`, [ids]);
console.log('Leads for qualified attempts:', leads.rows.length);
leads.rows.forEach(r => console.log(`  lead=${r.id} attempt=${r.call_attempt_id} qa=${r.qa_status}`));

// Check what the ORIGINAL disposition was before reanalysis
const events = await client.query(`
  SELECT call_attempt_id, event_type, value_text, created_at
  FROM call_session_events
  WHERE call_attempt_id = ANY($1)
  AND event_type LIKE '%disposition%'
  ORDER BY created_at
`, [ids]);
console.log('\nDisposition events:');
events.rows.forEach(r => console.log(`  ${r.call_attempt_id} ${r.event_type}: ${r.value_text} at ${r.created_at}`));

// Check the post-call analyzer override log
const overrides = await client.query(`
  SELECT call_attempt_id, event_type, value_text, metadata, created_at
  FROM call_session_events
  WHERE call_attempt_id = ANY($1)
  ORDER BY created_at DESC
  LIMIT 30
`, [ids]);
console.log('\nAll events for these attempts:');
overrides.rows.forEach(r => console.log(`  ${r.call_attempt_id.substring(0,8)} ${r.event_type}: ${(r.value_text||'').substring(0,60)} at ${r.created_at}`));

await client.end();