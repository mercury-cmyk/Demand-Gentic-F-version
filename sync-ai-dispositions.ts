import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function syncAiDispositions() {
  console.log('========================================');
  console.log('SYNC AI DISPOSITIONS');
  console.log('========================================\n');

  const DRY_RUN = process.argv.includes('--execute') ? false : true;

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('   Run with --execute flag to apply changes\n');
  } else {
    console.log('⚠️  EXECUTE MODE - Changes WILL be applied\n');
  }

  // Map AI dispositions to standard disposition codes
  const dispositionMapping: Record<string, string> = {
    'Qualified Lead': 'qualified_lead',
    'Meeting Booked': 'qualified_lead',
    'Callback Requested': 'callback',
    'Not Interested': 'not_interested',
    'DNC Request': 'dnc',
    'Wrong Number': 'wrong_number',
    'Gatekeeper Block': 'gatekeeper',
    'Voicemail': 'voicemail',
    'No Answer': 'no_answer',
    'Completed': 'no_answer', // Default for completed without specific outcome
  };

  // Check what AI dispositions exist in call_sessions
  console.log('AI Dispositions in call_sessions:');
  console.log('---------------------------------');
  const aiDisps = await db.execute(sql`
    SELECT
      ai_disposition,
      COUNT(*) as count
    FROM call_sessions
    WHERE ai_disposition IS NOT NULL
    GROUP BY ai_disposition
    ORDER BY count DESC
  `);

  for (const row of aiDisps.rows) {
    const r = row as any;
    const mapped = dispositionMapping[r.ai_disposition] || 'unknown';
    console.log(`  ${r.ai_disposition}: ${r.count} -> maps to '${mapped}'`);
  }

  // Find call_sessions that can be matched to dialer_call_attempts
  console.log('\n\nMatching call_sessions to dialer_call_attempts:');
  console.log('------------------------------------------------');

  // Try matching via queue_item_id first
  const queueMatches = await db.execute(sql`
    SELECT
      cs.ai_disposition,
      COUNT(*) as count
    FROM call_sessions cs
    INNER JOIN dialer_call_attempts dca ON dca.queue_item_id = cs.queue_item_id
    WHERE cs.ai_disposition IS NOT NULL
      AND cs.queue_item_id IS NOT NULL
    GROUP BY cs.ai_disposition
    ORDER BY count DESC
  `);

  console.log('Via queue_item_id match:');
  for (const row of queueMatches.rows) {
    const r = row as any;
    console.log(`  ${r.ai_disposition}: ${r.count}`);
  }

  // Check "Meeting Booked" and "Qualified Lead" specifically
  console.log('\n\n🎯 HIGH-VALUE DISPOSITIONS TO SYNC:');
  console.log('------------------------------------');

  const highValueToSync = await db.execute(sql`
    SELECT
      cs.id as session_id,
      cs.ai_disposition,
      cs.contact_id,
      cs.queue_item_id,
      cs.created_at,
      dca.id as attempt_id,
      dca.disposition as current_disposition
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.queue_item_id = cs.queue_item_id
    WHERE cs.ai_disposition IN ('Meeting Booked', 'Qualified Lead', 'Callback Requested', 'Not Interested')
    ORDER BY cs.ai_disposition, cs.created_at DESC
    LIMIT 50
  `);

  let meetingBooked = 0;
  let qualifiedLead = 0;
  let callback = 0;
  let notInterested = 0;

  for (const row of highValueToSync.rows) {
    const r = row as any;
    const hasMatch = r.attempt_id ? 'YES' : 'NO';
    const needsUpdate = r.attempt_id && r.current_disposition !== dispositionMapping[r.ai_disposition];
    console.log(`  ${r.ai_disposition} | match=${hasMatch} | current_disp=${r.current_disposition || 'NULL'} | needs_update=${needsUpdate}`);

    if (r.ai_disposition === 'Meeting Booked') meetingBooked++;
    if (r.ai_disposition === 'Qualified Lead') qualifiedLead++;
    if (r.ai_disposition === 'Callback Requested') callback++;
    if (r.ai_disposition === 'Not Interested') notInterested++;
  }

  console.log(`\nSummary: Meeting Booked=${meetingBooked}, Qualified Lead=${qualifiedLead}, Callback=${callback}, Not Interested=${notInterested}`);

  // Now sync the dispositions
  console.log('\n\nSYNCING DISPOSITIONS:');
  console.log('---------------------');

  for (const [aiDisp, standardDisp] of Object.entries(dispositionMapping)) {
    if (aiDisp === 'Completed' || aiDisp === 'No Answer') continue; // Skip generic ones

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM call_sessions cs
      INNER JOIN dialer_call_attempts dca ON dca.queue_item_id = cs.queue_item_id
      WHERE cs.ai_disposition = ${aiDisp}
        AND (dca.disposition IS NULL OR dca.disposition != ${standardDisp})
    `);

    const count = (countResult.rows[0] as any)?.count || 0;
    console.log(`  ${aiDisp} -> ${standardDisp}: ${count} records to update`);

    if (!DRY_RUN && count > 0) {
      await db.execute(sql`
        UPDATE dialer_call_attempts dca
        SET disposition = ${standardDisp},
            updated_at = NOW()
        FROM call_sessions cs
        WHERE cs.queue_item_id = dca.queue_item_id
          AND cs.ai_disposition = ${aiDisp}
          AND (dca.disposition IS NULL OR dca.disposition != ${standardDisp})
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
    console.log('   npx tsx sync-ai-dispositions.ts --execute');
  }

  process.exit(0);
}

syncAiDispositions().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
