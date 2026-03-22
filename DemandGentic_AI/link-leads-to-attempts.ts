import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function linkLeadsToAttempts() {
  console.log('Linking leads to call attempts...\n');

  // Find the call attempts for Jan 15 qualified leads
  const attempts = await db.execute(sql`
    SELECT
      dca.id as attempt_id,
      dca.contact_id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.notes,
      c.first_name,
      c.last_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.disposition IN ('qualified_lead', 'not_interested')
      AND dca.call_duration_seconds > 0
  `);

  console.log('Call attempts found:');
  for (const row of attempts.rows) {
    const r = row as any;
    console.log(`  ${r.first_name} ${r.last_name} | attempt_id=${r.attempt_id} | duration=${r.call_duration_seconds}s`);
  }

  // Update leads with call_attempt_id by matching contact_id
  const updateResult = await db.execute(sql`
    UPDATE leads l
    SET
      call_attempt_id = dca.id,
      call_duration = dca.call_duration_seconds,
      transcript = dca.notes
    FROM dialer_call_attempts dca
    WHERE dca.contact_id = l.contact_id
      AND l.created_at > NOW() - INTERVAL '1 day'
      AND dca.created_at::date = '2026-01-15'
      AND dca.disposition IN ('qualified_lead', 'not_interested')
    RETURNING l.id, l.contact_name, l.call_attempt_id, l.call_duration
  `);

  console.log('\nUpdated leads:');
  for (const row of updateResult.rows) {
    const r = row as any;
    console.log(`  ${r.contact_name} | call_attempt_id=${r.call_attempt_id} | duration=${r.call_duration}s`);
  }

  // Verify the leads
  const verifyLeads = await db.execute(sql`
    SELECT
      id,
      contact_name,
      contact_email,
      call_attempt_id,
      call_duration,
      transcript
    FROM leads
    WHERE created_at > NOW() - INTERVAL '1 day'
    ORDER BY created_at DESC
  `);

  console.log('\nLeads after update:');
  for (const row of verifyLeads.rows) {
    const r = row as any;
    console.log(`  ${r.contact_name}`);
    console.log(`    call_attempt_id: ${r.call_attempt_id || 'NULL'}`);
    console.log(`    duration: ${r.call_duration || 0}s`);
    console.log(`    has_transcript: ${r.transcript ? 'YES' : 'NO'}`);
  }

  process.exit(0);
}

linkLeadsToAttempts().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});