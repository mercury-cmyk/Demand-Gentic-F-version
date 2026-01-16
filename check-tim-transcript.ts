import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkTimSkrmetti() {
  const result = await db.execute(sql`
    SELECT
      dca.notes,
      c.first_name,
      c.last_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE c.email = 'tskrmetti@americanfirstfinance.com'
      AND dca.created_at::date = '2026-01-15'
    LIMIT 1
  `);

  console.log('Rows found:', result.rows.length);

  if (result.rows.length > 0) {
    const row = result.rows[0] as any;
    console.log('Name:', row.first_name, row.last_name);
    const notes = row.notes as string;
    if (notes) {
      const transcriptStart = notes.indexOf('[Call Transcript]');
      if (transcriptStart >= 0) {
        const transcript = notes.substring(transcriptStart + '[Call Transcript]'.length).trim();
        console.log('\nTRANSCRIPT:');
        console.log('='.repeat(60));
        console.log(transcript);
        console.log('='.repeat(60));

        // Check if this is actually a human conversation
        console.log('\n\nANALYSIS:');
        if (transcript.includes('Google')) {
          console.log('⚠️  This was Google Call Assist (automated screening), NOT a human conversation');
        }
        if (transcript.includes('cannot take your call')) {
          console.log('⚠️  Call was rejected/screened');
        }
      } else {
        console.log('No transcript found in notes');
      }
    } else {
      console.log('Notes is null');
    }
  }
  process.exit(0);
}

checkTimSkrmetti().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
