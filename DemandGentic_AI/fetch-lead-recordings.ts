import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { fetchTelnyxRecording } from './server/services/telnyx-recordings';

/**
 * Fetch fresh Telnyx recordings and transcribe for Adrian Love & Julie Parrish
 */

async function main() {
  console.log('=== FETCHING FRESH RECORDINGS FOR LEADS ===\n');

  const targetEmails = [
    'alove@idexcorp.com',
    'julie.parrish@corelight.com'
  ];

  for (const email of targetEmails) {
    // Get the best call for this contact
    const calls = await db.execute(sql`
      SELECT 
        dca.id,
        dca.telnyx_call_id,
        dca.recording_url,
        dca.call_duration_seconds,
        dca.notes,
        dca.created_at,
        c.full_name,
        c.id as contact_id
      FROM dialer_call_attempts dca
      JOIN contacts c ON c.id = dca.contact_id
      WHERE c.email = ${email}
        AND dca.call_duration_seconds > 30
      ORDER BY dca.call_duration_seconds DESC
      LIMIT 1
    `);

    if (calls.rows.length === 0) {
      console.log(`⚠️ No calls found for ${email}`);
      continue;
    }

    const call = calls.rows[0] as any;
    console.log(`\n${call.full_name} (${email})`);
    console.log(`  Call ID: ${call.id}`);
    console.log(`  Telnyx ID: ${call.telnyx_call_id}`);
    console.log(`  Duration: ${call.call_duration_seconds}s`);
    console.log(`  Current URL: ${call.recording_url?.substring(0, 60) || 'none'}...`);

    // Check if already has transcript
    if (call.notes?.includes('[Call Transcript]')) {
      console.log(`  ✅ Already has transcript`);
      continue;
    }

    // Try to fetch fresh recording URL from Telnyx
    if (call.telnyx_call_id) {
      console.log(`  Fetching fresh recording from Telnyx...`);
      try {
        const freshUrl = await fetchTelnyxRecording(call.telnyx_call_id);
        
        if (freshUrl) {
          console.log(`  ✅ Got fresh URL: ${freshUrl.substring(0, 60)}...`);
          
          // Update the recording URL in DB
          await db.execute(sql`
            UPDATE dialer_call_attempts
            SET recording_url = ${freshUrl}
            WHERE id = ${call.id}
          `);
          console.log(`  ✅ Updated recording URL in database`);
          
          // Now we could transcribe - but let's just report for now
          console.log(`  📝 Ready for transcription`);
        } else {
          console.log(`  ❌ Recording not available from Telnyx (may have expired after 30 days)`);
        }
      } catch (error: any) {
        console.log(`  ❌ Error fetching recording: ${error.message}`);
      }
    } else {
      console.log(`  ❌ No Telnyx call ID available`);
    }
  }

  // Also list the orphan leads (no calls at all) 
  console.log('\n\n=== ORPHAN LEADS (no calls) ===');
  const orphans = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      c.full_name,
      c.email,
      c.job_title,
      a.name as account_name,
      l.qa_status,
      (SELECT COUNT(*) FROM dialer_call_attempts dca WHERE dca.contact_id = c.id) as call_count
    FROM leads l
    JOIN contacts c ON c.id = l.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE l.qa_status = 'new'
    ORDER BY c.full_name
  `);

  let orphanCount = 0;
  for (const lead of orphans.rows as any[]) {
    if (lead.call_count === '0' || lead.call_count === 0) {
      orphanCount++;
      console.log(`\n${orphanCount}. ${lead.full_name}`);
      console.log(`   Email: ${lead.email}`);
      console.log(`   Title: ${lead.job_title}`);
      console.log(`   Account: ${lead.account_name}`);
      console.log(`   Calls: ${lead.call_count}`);
    }
  }

  console.log(`\n\nTotal orphan leads (no calls): ${orphanCount}`);
  console.log(`These leads should be reviewed for deletion or manual qualification.`);

  process.exit(0);
}

main().catch(console.error);