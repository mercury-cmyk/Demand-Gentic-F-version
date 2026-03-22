import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Check all Tim Skrmetti call attempts
  const calls = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.notes,
      dca.disposition,
      dca.created_at
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE c.email = 'tskrmetti@americanfirstfinance.com'
    ORDER BY dca.created_at DESC
  `);

  console.log('Tim Skrmetti call attempts:', calls.rows.length);
  calls.rows.forEach((row: any, i) => {
    console.log(`\n${i+1}. ID: ${row.id}`);
    console.log(`   Duration: ${row.call_duration_seconds}s`);
    console.log(`   Disposition: ${row.disposition}`);
    console.log(`   Has notes: ${row.notes ? 'Yes (' + row.notes.length + ' chars)' : 'No'}`);
    if (row.notes && row.notes.includes('[Call Transcript]')) {
      const transcript = row.notes.split('[Call Transcript]')[1].trim().substring(0, 300);
      console.log(`   Transcript preview: ${transcript}...`);
    }
  });

  // Also check if lead was created
  const leads = await db.execute(sql`
    SELECT id, qa_status, created_at, transcript
    FROM leads
    WHERE contact_email = 'tskrmetti@americanfirstfinance.com'
  `);
  console.log(`\nLeads for Tim: ${leads.rows.length}`);
  leads.rows.forEach((l: any) => {
    console.log(`  - Lead ID ${l.id}, status: ${l.qa_status}`);
    if (l.transcript) {
      console.log(`    Transcript: ${l.transcript.substring(0, 300)}...`);
    }
  });

  process.exit(0);
}
main().catch(e => { console.error('Error:', e); process.exit(1); });