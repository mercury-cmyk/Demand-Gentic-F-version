import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function syncAiDispositions() {
  console.log('========================================');
  console.log('SYNC AI DISPOSITIONS V2');
  console.log('========================================\n');

  const DRY_RUN = process.argv.includes('--execute') ? false : true;

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('   Run with --execute flag to apply changes\n');
  } else {
    console.log('⚠️  EXECUTE MODE - Changes WILL be applied\n');
  }

  // Check valid disposition enum values
  console.log('Valid disposition enum values:');
  console.log('------------------------------');
  const enumValues = await db.execute(sql`
    SELECT enumlabel
    FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'canonical_disposition')
    ORDER BY enumsortorder
  `);

  const validDispositions = enumValues.rows.map((r: any) => r.enumlabel);
  console.log(`  ${validDispositions.join(', ')}`);

  // Map AI dispositions to valid enum values
  const dispositionMapping: Record = {
    'Qualified Lead': 'qualified_lead',
    'Meeting Booked': 'qualified_lead',
    'Not Interested': 'not_interested',
    'DNC Request': 'dnc',
    'Wrong Number': 'wrong_number',
    'Voicemail': 'voicemail',
    'No Answer': 'no_answer',
    'Gatekeeper Block': 'gatekeeper',
    // These don't have direct mappings - need to check enum
    'Callback Requested': 'callback_scheduled', // or similar if exists
  };

  // Check if callback_scheduled exists
  if (validDispositions.includes('callback_scheduled')) {
    dispositionMapping['Callback Requested'] = 'callback_scheduled';
  } else if (validDispositions.includes('callback')) {
    dispositionMapping['Callback Requested'] = 'callback';
  } else {
    console.log('  ⚠️  No callback disposition found - will skip Callback Requested');
    delete dispositionMapping['Callback Requested'];
  }

  console.log('\n\nDisposition Mapping:');
  console.log('--------------------');
  for (const [ai, standard] of Object.entries(dispositionMapping)) {
    const valid = validDispositions.includes(standard) ? '✓' : '✗';
    console.log(`  ${ai} -> ${standard} ${valid}`);
  }

  // Try to match via contact_id + time window
  console.log('\n\nMatching via contact_id + time window:');
  console.log('---------------------------------------');

  const contactMatches = await db.execute(sql`
    SELECT
      cs.ai_disposition,
      COUNT(*) as count
    FROM call_sessions cs
    INNER JOIN dialer_call_attempts dca ON dca.contact_id = cs.contact_id
      AND dca.created_at BETWEEN cs.created_at - INTERVAL '5 minutes' AND cs.created_at + INTERVAL '30 minutes'
    WHERE cs.ai_disposition IS NOT NULL
    GROUP BY cs.ai_disposition
    ORDER BY count DESC
  `);

  for (const row of contactMatches.rows) {
    const r = row as any;
    console.log(`  ${r.ai_disposition}: ${r.count}`);
  }

  // Check high-value dispositions specifically
  console.log('\n\n🎯 HIGH-VALUE DISPOSITIONS:');
  console.log('---------------------------');

  const highValue = await db.execute(sql`
    SELECT
      cs.id as session_id,
      cs.ai_disposition,
      cs.contact_id,
      cs.created_at as session_time,
      cs.ai_transcript,
      dca.id as attempt_id,
      dca.disposition as current_disposition,
      dca.created_at as attempt_time,
      c.first_name,
      c.last_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN dialer_call_attempts dca ON dca.contact_id = cs.contact_id
      AND dca.created_at BETWEEN cs.created_at - INTERVAL '5 minutes' AND cs.created_at + INTERVAL '30 minutes'
    WHERE cs.ai_disposition IN ('Meeting Booked', 'Qualified Lead')
    ORDER BY cs.created_at DESC
  `);

  console.log(`Found ${highValue.rows.length} Meeting Booked / Qualified Lead sessions:`);
  for (const row of highValue.rows) {
    const r = row as any;
    const hasMatch = r.attempt_id ? 'YES' : 'NO';
    const name = `${r.first_name || 'Unknown'} ${r.last_name || ''}`.trim();
    const transcriptPreview = r.ai_transcript ? r.ai_transcript.substring(0, 80) + '...' : 'NO TRANSCRIPT';
    console.log(`\n  📞 ${r.ai_disposition} - ${name}`);
    console.log(`     Session: ${r.session_time}`);
    console.log(`     Match to attempt: ${hasMatch} (current_disp=${r.current_disposition || 'NULL'})`);
    console.log(`     Transcript: ${transcriptPreview}`);
  }

  // Sync what we can
  console.log('\n\nSYNCING DISPOSITIONS:');
  console.log('---------------------');

  for (const [aiDisp, standardDisp] of Object.entries(dispositionMapping)) {
    if (!validDispositions.includes(standardDisp)) {
      console.log(`  ${aiDisp} -> ${standardDisp}: SKIPPED (invalid enum)`);
      continue;
    }

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM dialer_call_attempts dca
      INNER JOIN call_sessions cs ON cs.contact_id = dca.contact_id
        AND dca.created_at BETWEEN cs.created_at - INTERVAL '5 minutes' AND cs.created_at + INTERVAL '30 minutes'
      WHERE cs.ai_disposition = ${aiDisp}
        AND (dca.disposition IS NULL OR dca.disposition = 'no_answer')
    `);

    const count = (countResult.rows[0] as any)?.count || 0;
    console.log(`  ${aiDisp} -> ${standardDisp}: ${count} records to update`);

    if (!DRY_RUN && count > 0) {
      await db.execute(sql`
        UPDATE dialer_call_attempts dca
        SET disposition = ${standardDisp}::canonical_disposition,
            updated_at = NOW()
        FROM call_sessions cs
        WHERE cs.contact_id = dca.contact_id
          AND dca.created_at BETWEEN cs.created_at - INTERVAL '5 minutes' AND cs.created_at + INTERVAL '30 minutes'
          AND cs.ai_disposition = ${aiDisp}
          AND (dca.disposition IS NULL OR dca.disposition = 'no_answer')
      `);
      console.log(`    ✅ Updated`);
    }
  }

  // Final count
  console.log('\n\n========================================');
  console.log('FINAL DISPOSITION COUNTS');
  console.log('========================================');

  const finalCounts = await db.execute(sql`
    SELECT
      disposition,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE disposition IS NOT NULL
    GROUP BY disposition
    ORDER BY count DESC
  `);

  for (const row of finalCounts.rows) {
    const r = row as any;
    console.log(`  ${r.disposition}: ${r.count}`);
  }

  if (DRY_RUN) {
    console.log('\n💡 To apply these changes, run:');
    console.log('   npx tsx sync-ai-dispositions-v2.ts --execute');
  }

  process.exit(0);
}

syncAiDispositions().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});