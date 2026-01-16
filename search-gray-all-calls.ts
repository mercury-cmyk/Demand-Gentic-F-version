import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function searchGrayAllCalls() {
  console.log('========================================');
  console.log('SEARCH ALL CALLS BY PHONE NUMBER');
  console.log('========================================\n');

  // Search by phone number (Gray's number is 2054840419)
  const phoneNumber = '2054840419';

  console.log(`Searching for all calls to phone containing: ${phoneNumber}\n`);

  // Search dialer_call_attempts by phone
  const attempts = await db.execute(sql`
    SELECT
      dca.id,
      dca.phone_dialed,
      dca.call_duration_seconds,
      dca.disposition,
      dca.connected,
      dca.voicemail_detected,
      dca.notes,
      dca.call_session_id,
      dca.telnyx_call_id,
      dca.created_at,
      c.first_name,
      c.last_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.phone_dialed LIKE ${'%' + phoneNumber + '%'}
    ORDER BY dca.call_duration_seconds DESC NULLS LAST
  `);

  console.log(`Found ${attempts.rows.length} dialer call attempts:\n`);

  for (const row of attempts.rows) {
    const a = row as any;
    console.log(`========================================`);
    console.log(`${a.first_name} ${a.last_name} - ${a.call_duration_seconds || 0}s - ${a.disposition || 'NULL'}`);
    console.log(`========================================`);
    console.log(`Created: ${a.created_at}`);
    console.log(`Phone: ${a.phone_dialed}`);
    console.log(`Duration: ${a.call_duration_seconds || 0}s`);
    console.log(`Disposition: ${a.disposition || 'NULL'}`);

    if (a.notes) {
      console.log(`\n--- FULL NOTES ---`);
      console.log(a.notes);
      console.log(`--- END ---\n`);
    }
  }

  // Also check call_sessions for any with this contact
  console.log('\n\n========================================');
  console.log('CHECK CALL SESSIONS BY CONTACT');
  console.log('========================================\n');

  const sessions = await db.execute(sql`
    SELECT
      cs.*,
      c.first_name,
      c.last_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    WHERE c.direct_phone LIKE ${'%' + phoneNumber + '%'}
       OR c.mobile_phone LIKE ${'%' + phoneNumber + '%'}
       OR (c.first_name = 'Gray' AND c.last_name = 'Bekurs')
    ORDER BY cs.created_at DESC
  `);

  console.log(`Found ${sessions.rows.length} call sessions:\n`);

  for (const row of sessions.rows) {
    const s = row as any;
    console.log(`Session: ${s.id}`);
    console.log(`Duration: ${s.call_duration_seconds || s.duration_seconds || 0}s`);
    console.log(`AI Disposition: ${s.ai_disposition}`);

    if (s.transcript) {
      console.log(`\n--- TRANSCRIPT ---`);
      console.log(s.transcript);
      console.log(`--- END ---\n`);
    }

    if (s.call_summary) {
      console.log(`\n--- CALL SUMMARY ---`);
      console.log(JSON.stringify(s.call_summary, null, 2));
      console.log(`--- END ---\n`);
    }
  }

  // Check all Jan 15 calls sorted by duration to find the 3 minute call
  console.log('\n\n========================================');
  console.log('ALL JAN 15 CALLS OVER 60 SECONDS');
  console.log('========================================\n');

  const longCalls = await db.execute(sql`
    SELECT
      dca.id,
      dca.phone_dialed,
      dca.call_duration_seconds,
      dca.disposition,
      dca.notes,
      dca.created_at,
      c.first_name,
      c.last_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.call_duration_seconds > 60
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 20
  `);

  console.log(`Found ${longCalls.rows.length} calls over 60 seconds on Jan 15:\n`);

  for (const row of longCalls.rows) {
    const a = row as any;
    const minutes = Math.floor((a.call_duration_seconds || 0) / 60);
    const seconds = (a.call_duration_seconds || 0) % 60;
    console.log(`${a.first_name} ${a.last_name}: ${minutes}m ${seconds}s (${a.call_duration_seconds}s) - ${a.disposition || 'NULL'}`);
    console.log(`  Phone: ${a.phone_dialed}`);
    console.log(`  Created: ${a.created_at}`);

    if (a.notes) {
      console.log(`  Has Notes: YES (${a.notes.length} chars)`);
    }
    console.log('');
  }

  process.exit(0);
}

searchGrayAllCalls().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
