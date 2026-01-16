import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function linkLeadsCallData() {
  console.log('========================================');
  console.log('LINK LEADS TO CALL DATA');
  console.log('========================================\n');

  // Update leads with call data directly from dialer_call_attempts
  // This bypasses the call_attempt_id foreign key issue
  const updateResult = await db.execute(sql`
    UPDATE leads l
    SET
      call_duration = dca.call_duration_seconds,
      transcript = dca.notes,
      telnyx_call_id = dca.telnyx_call_id,
      recording_url = dca.recording_url,
      dialed_number = dca.phone_dialed
    FROM dialer_call_attempts dca
    WHERE dca.contact_id = l.contact_id
      AND l.created_at > NOW() - INTERVAL '1 day'
      AND dca.created_at::date = '2026-01-15'
      AND dca.disposition IN ('qualified_lead', 'not_interested')
      AND dca.call_duration_seconds > 0
    RETURNING
      l.id,
      l.contact_name,
      l.call_duration,
      l.telnyx_call_id,
      l.recording_url IS NOT NULL as has_recording_url,
      l.transcript IS NOT NULL as has_transcript
  `);

  console.log('Updated leads with call data:');
  for (const row of updateResult.rows) {
    const r = row as any;
    console.log(`\n  ${r.contact_name}`);
    console.log(`    duration: ${r.call_duration}s`);
    console.log(`    telnyx_call_id: ${r.telnyx_call_id || 'NULL'}`);
    console.log(`    has_recording_url: ${r.has_recording_url}`);
    console.log(`    has_transcript: ${r.has_transcript}`);
  }

  console.log(`\nTotal updated: ${updateResult.rows.length}`);

  // Verify the leads now
  console.log('\n========================================');
  console.log('VERIFICATION');
  console.log('========================================\n');

  const verifyLeads = await db.execute(sql`
    SELECT
      id,
      contact_name,
      contact_email,
      call_duration,
      telnyx_call_id,
      recording_url,
      transcript
    FROM leads
    WHERE created_at > NOW() - INTERVAL '1 day'
    ORDER BY created_at DESC
  `);

  for (const row of verifyLeads.rows) {
    const r = row as any;
    console.log(`Lead: ${r.contact_name}`);
    console.log(`  Email: ${r.contact_email || 'N/A'}`);
    console.log(`  Duration: ${r.call_duration || 0}s`);
    console.log(`  Telnyx Call ID: ${r.telnyx_call_id || 'NULL'}`);
    console.log(`  Recording URL: ${r.recording_url ? 'YES' : 'NO'}`);
    console.log(`  Has Transcript: ${r.transcript ? 'YES (length=' + r.transcript.length + ')' : 'NO'}`);
    console.log('');
  }

  process.exit(0);
}

linkLeadsCallData().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
