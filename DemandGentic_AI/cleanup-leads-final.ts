import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('=== APPLYING REJECTIONS & CLEANING DUPLICATES ===\n');

  // 1. Reject Garima Kalra, Don Fritz, Cathy Calver
  const rejectEmails = [
    'garimakalra@crestcura.com',
    'dfritz@multipacksolutions.com', 
    'cathy.calver@globalrelay.net'
  ];

  console.log('--- Rejecting leads based on manual review ---');
  for (const email of rejectEmails) {
    const result = await db.execute(sql`
      UPDATE leads l
      SET qa_status = 'rejected',
          ai_analysis = jsonb_set(
            COALESCE(ai_analysis, '{}'::jsonb),
            '{manualReview}',
            '"Rejected: No real engagement, call cut off or voicemail"'::jsonb
          ),
          updated_at = NOW()
      FROM contacts c
      WHERE l.contact_id = c.id
        AND c.email = ${email}
      RETURNING l.id, c.full_name
    `);
    if (result.rows.length > 0) {
      console.log(`❌ Rejected: ${(result.rows[0] as any).full_name}`);
    } else {
      console.log(`⚠️ No lead found for: ${email}`);
    }
  }

  // 2. Find and delete duplicates for Tim Skrmetti and Pal Mayuranathan
  const dupEmails = [
    'tskrmetti@americanfirstfinance.com',
    'umaipalan.mayuranathan@syneoshealth.com'
  ];

  console.log('\n--- Cleaning up duplicate leads ---');
  for (const email of dupEmails) {
    // Get all leads for this contact
    const dupes = await db.execute(sql`
      SELECT l.id, l.created_at, c.full_name
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      WHERE c.email = ${email}
      ORDER BY l.created_at ASC
    `);

    if (dupes.rows.length > 1) {
      const rows = dupes.rows as any[];
      console.log(`\nFound ${rows.length} leads for ${rows[0].full_name}`);
      // Keep the first one, delete the rest
      const keepId = rows[0].id;
      const deleteIds = rows.slice(1).map((r) => r.id);
      
      for (const delId of deleteIds) {
        await db.execute(sql`DELETE FROM leads WHERE id = ${delId}`);
        console.log(`  🗑️ Deleted duplicate lead: ${delId}`);
      }
      console.log(`  ✅ Kept lead: ${keepId}`);
    } else if (dupes.rows.length === 1) {
      console.log(`✓ No duplicates for ${(dupes.rows[0] as any).full_name}`);
    }
  }

  // 3. Summary
  const summary = await db.execute(sql`
    SELECT qa_status, COUNT(*) as count
    FROM leads
    GROUP BY qa_status
    ORDER BY count DESC
  `);
  
  console.log('\n=== LEADS SUMMARY ===');
  (summary.rows as any[]).forEach((r) => {
    console.log(`  ${r.qa_status}: ${r.count}`);
  });

  // 4. Check for recordings in GCS for Adrian Love and Julie Parrish
  console.log('\n--- Checking for GCS recordings ---');
  const needTranscript = [
    'alove@idexcorp.com',
    'julie.parrish@corelight.com'
  ];

  for (const email of needTranscript) {
    const calls = await db.execute(sql`
      SELECT 
        dca.id,
        dca.telnyx_call_id,
        dca.recording_url,
        dca.call_duration_seconds,
        dca.created_at,
        c.full_name
      FROM dialer_call_attempts dca
      JOIN contacts c ON c.id = dca.contact_id
      WHERE c.email = ${email}
        AND dca.call_duration_seconds > 30
      ORDER BY dca.call_duration_seconds DESC
      LIMIT 1
    `);

    if (calls.rows.length > 0) {
      const call = calls.rows[0] as any;
      console.log(`\n${call.full_name}:`);
      console.log(`  Call ID: ${call.id}`);
      console.log(`  Telnyx ID: ${call.telnyx_call_id}`);
      console.log(`  Duration: ${call.call_duration_seconds}s`);
      console.log(`  Recording URL: ${call.recording_url?.substring(0, 80)}...`);
      
      // Check if URL contains GCS
      if (call.recording_url?.includes('storage.googleapis.com')) {
        console.log(`  ✅ Has GCS URL`);
      } else if (call.recording_url?.includes('s3.')) {
        console.log(`  ⚠️ Has S3 URL (may be expired)`);
      }
    }
  }

  process.exit(0);
}

main().catch(console.error);