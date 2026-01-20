import { db } from './server/db';
import { sql } from 'drizzle-orm';

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

async function main() {
  console.log('========================================');
  console.log('  MANUAL REVIEW: LEADS TRANSCRIPTS');
  console.log('========================================\n');

  // Get specific contacts for manual review
  const contactNames = ['Garima Kalra', 'Don Fritz', 'Cathy Calver'];
  
  for (const name of contactNames) {
    console.log('═'.repeat(80));
    console.log(`\n📞 ${name.toUpperCase()}\n`);
    console.log('═'.repeat(80));

    // Find the contact
    const contactResult = await db.execute(sql`
      SELECT 
        c.id as contact_id,
        c.full_name,
        c.email,
        c.job_title,
        a.name as account_name
      FROM contacts c
      LEFT JOIN accounts a ON a.id = c.account_id
      WHERE c.full_name ILIKE ${`%${name}%`}
      LIMIT 1
    `);

    if (contactResult.rows.length === 0) {
      console.log('  Contact not found!\n');
      continue;
    }

    const contact = contactResult.rows[0] as any;
    console.log(`Account: ${contact.account_name}`);
    console.log(`Email: ${contact.email}`);
    console.log(`Title: ${contact.job_title}`);
    console.log('');

    // Get their call with transcript
    const callResult = await db.execute(sql`
      SELECT 
        dca.notes,
        dca.call_duration_seconds,
        dca.disposition,
        dca.created_at,
        dca.recording_url
      FROM dialer_call_attempts dca
      WHERE dca.contact_id = ${contact.contact_id}
        AND dca.notes LIKE '%[Call Transcript]%'
      ORDER BY dca.call_duration_seconds DESC
      LIMIT 1
    `);

    if (callResult.rows.length === 0) {
      console.log('  ⚠️ No transcript available for this contact\n');
      continue;
    }

    const call = callResult.rows[0] as any;
    const transcript = extractTranscript(call.notes);

    console.log(`Duration: ${call.call_duration_seconds}s`);
    console.log(`Disposition: ${call.disposition}`);
    console.log(`Date: ${call.created_at}`);
    console.log(`Recording: ${call.recording_url || 'N/A'}`);
    console.log('\n--- FULL TRANSCRIPT ---\n');
    console.log(transcript || 'No transcript extracted');
    console.log('\n--- END TRANSCRIPT ---\n');
  }

  // Now show leads without transcripts
  console.log('\n');
  console.log('═'.repeat(80));
  console.log('  LEADS WITHOUT TRANSCRIPTS');
  console.log('═'.repeat(80));
  console.log('');

  const leadsWithoutTranscripts = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      l.contact_id,
      l.qa_status,
      c.full_name,
      c.email,
      a.name as account_name,
      (
        SELECT COUNT(*) 
        FROM dialer_call_attempts dca 
        WHERE dca.contact_id = l.contact_id
      ) as total_calls,
      (
        SELECT MAX(dca.call_duration_seconds)
        FROM dialer_call_attempts dca 
        WHERE dca.contact_id = l.contact_id
      ) as longest_call,
      (
        SELECT COUNT(*) 
        FROM dialer_call_attempts dca 
        WHERE dca.contact_id = l.contact_id
          AND dca.notes LIKE '%[Call Transcript]%'
      ) as calls_with_transcript
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE l.qa_status = 'new'
    ORDER BY c.full_name
  `);

  const noTranscript = (leadsWithoutTranscripts.rows as any[]).filter(r => r.calls_with_transcript === '0' || r.calls_with_transcript === 0);

  console.log(`Found ${noTranscript.length} leads without transcripts:\n`);

  for (const lead of noTranscript) {
    console.log(`• ${lead.full_name} @ ${lead.account_name || 'N/A'}`);
    console.log(`  Email: ${lead.email}`);
    console.log(`  Total calls: ${lead.total_calls} | Longest: ${lead.longest_call || 0}s | With transcript: ${lead.calls_with_transcript}`);
    console.log('');
  }

  process.exit(0);
}

main().catch(console.error);
