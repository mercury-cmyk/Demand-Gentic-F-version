import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function getGrayTranscripts() {
  console.log('========================================');
  console.log('ALL CALLS TO GRAY BEKURS');
  console.log('========================================\n');

  // Find contact ID for Gray Bekurs
  const contactResult = await db.execute(sql`
    SELECT id, first_name, last_name, email, direct_phone, mobile_phone
    FROM contacts
    WHERE LOWER(first_name) LIKE '%gray%' OR LOWER(last_name) LIKE '%bekur%'
    LIMIT 5
  `);

  console.log('Contact(s) found:');
  for (const row of contactResult.rows) {
    const c = row as any;
    console.log(`  ${c.first_name} ${c.last_name} (${c.id})`);
    console.log(`    Email: ${c.email}`);
    console.log(`    Phone: ${c.direct_phone || c.mobile_phone}`);
  }

  if (contactResult.rows.length === 0) {
    console.log('No contact found');
    process.exit(0);
  }

  const contactId = (contactResult.rows[0] as any).id;

  // Get all dialer_call_attempts for this contact
  console.log('\n========================================');
  console.log('DIALER CALL ATTEMPTS');
  console.log('========================================\n');

  const attempts = await db.execute(sql`
    SELECT
      id,
      phone_dialed,
      call_duration_seconds,
      disposition,
      connected,
      voicemail_detected,
      notes,
      call_session_id,
      telnyx_call_id,
      created_at,
      call_started_at,
      call_ended_at
    FROM dialer_call_attempts
    WHERE contact_id = ${contactId}
    ORDER BY created_at DESC
  `);

  console.log(`Found ${attempts.rows.length} call attempts:\n`);

  for (const row of attempts.rows) {
    const a = row as any;
    console.log(`----------------------------------------`);
    console.log(`Attempt ID: ${a.id}`);
    console.log(`Created: ${a.created_at}`);
    console.log(`Phone: ${a.phone_dialed}`);
    console.log(`Duration: ${a.call_duration_seconds || 0}s`);
    console.log(`Connected: ${a.connected}`);
    console.log(`Voicemail: ${a.voicemail_detected}`);
    console.log(`Disposition: ${a.disposition || 'NULL'}`);
    console.log(`Call Session ID: ${a.call_session_id || 'NULL'}`);
    console.log(`Telnyx Call ID: ${a.telnyx_call_id || 'NULL'}`);

    if (a.notes) {
      console.log(`\nNOTES/TRANSCRIPT:`);
      console.log(`${a.notes}`);
    }
    console.log('');
  }

  // Get call_sessions for this contact
  console.log('\n========================================');
  console.log('CALL SESSIONS (AI Conversations)');
  console.log('========================================\n');

  const sessions = await db.execute(sql`
    SELECT
      id,
      phone_number,
      call_duration_seconds,
      ai_disposition,
      call_summary,
      transcript,
      created_at
    FROM call_sessions
    WHERE contact_id = ${contactId}
    ORDER BY created_at DESC
  `);

  console.log(`Found ${sessions.rows.length} call sessions:\n`);

  for (const row of sessions.rows) {
    const s = row as any;
    console.log(`----------------------------------------`);
    console.log(`Session ID: ${s.id}`);
    console.log(`Created: ${s.created_at}`);
    console.log(`Phone: ${s.phone_number}`);
    console.log(`Duration: ${s.call_duration_seconds || 0}s`);
    console.log(`AI Disposition: ${s.ai_disposition || 'NULL'}`);

    if (s.call_summary) {
      console.log(`\nCALL SUMMARY:`);
      try {
        const summary = typeof s.call_summary === 'string' ? JSON.parse(s.call_summary) : s.call_summary;
        console.log(JSON.stringify(summary, null, 2));
      } catch {
        console.log(s.call_summary);
      }
    }

    if (s.transcript) {
      console.log(`\nFULL TRANSCRIPT:`);
      console.log(s.transcript);
    }
    console.log('');
  }

  // Check the lead for any transcript
  console.log('\n========================================');
  console.log('LEAD RECORD');
  console.log('========================================\n');

  const leadResult = await db.execute(sql`
    SELECT
      id,
      contact_name,
      call_duration,
      transcript,
      telnyx_call_id,
      recording_url,
      created_at
    FROM leads
    WHERE contact_id = ${contactId}
    ORDER BY created_at DESC
  `);

  for (const row of leadResult.rows) {
    const l = row as any;
    console.log(`Lead ID: ${l.id}`);
    console.log(`Contact: ${l.contact_name}`);
    console.log(`Duration: ${l.call_duration}s`);
    console.log(`Telnyx ID: ${l.telnyx_call_id}`);
    console.log(`Has Recording URL: ${l.recording_url ? 'YES' : 'NO'}`);

    if (l.transcript) {
      console.log(`\nTRANSCRIPT FROM LEAD:`);
      console.log(l.transcript);
    }
  }

  process.exit(0);
}

getGrayTranscripts().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
