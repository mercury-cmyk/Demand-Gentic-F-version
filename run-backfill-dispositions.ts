import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function backfillDispositions() {
  console.log('========================================');
  console.log('BACKFILLING NULL DISPOSITIONS');
  console.log('========================================\n');

  // DRY RUN MODE - set to false to actually update
  const DRY_RUN = process.argv.includes('--execute') ? false : true;

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('   Run with --execute flag to apply changes\n');
  } else {
    console.log('⚠️  EXECUTE MODE - Changes WILL be applied\n');
  }

  // 1. Backfill from campaign_queue removed_reason
  console.log('Step 1: Backfill from campaign_queue removed_reason');
  console.log('----------------------------------------------------');

  // country_not_whitelisted -> invalid_data
  const whitelistCount = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM dialer_call_attempts dca
    INNER JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    WHERE dca.disposition IS NULL
      AND cq.removed_reason = 'country_not_whitelisted'
  `);
  console.log(`  country_not_whitelisted -> invalid_data: ${(whitelistCount.rows[0] as any)?.count} records`);

  if (!DRY_RUN) {
    await db.execute(sql`
      UPDATE dialer_call_attempts dca
      SET disposition = 'invalid_data',
          updated_at = NOW()
      FROM campaign_queue cq
      WHERE cq.id = dca.queue_item_id
        AND dca.disposition IS NULL
        AND cq.removed_reason = 'country_not_whitelisted'
    `);
    console.log('    ✅ Updated');
  }

  // invalid_phone_number -> invalid_data
  const phoneCount = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM dialer_call_attempts dca
    INNER JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    WHERE dca.disposition IS NULL
      AND cq.removed_reason = 'invalid_phone_number'
  `);
  console.log(`  invalid_phone_number -> invalid_data: ${(phoneCount.rows[0] as any)?.count} records`);

  if (!DRY_RUN) {
    await db.execute(sql`
      UPDATE dialer_call_attempts dca
      SET disposition = 'invalid_data',
          updated_at = NOW()
      FROM campaign_queue cq
      WHERE cq.id = dca.queue_item_id
        AND dca.disposition IS NULL
        AND cq.removed_reason = 'invalid_phone_number'
    `);
    console.log('    ✅ Updated');
  }

  // invalid_data -> invalid_data
  const invalidCount = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM dialer_call_attempts dca
    INNER JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    WHERE dca.disposition IS NULL
      AND cq.removed_reason = 'invalid_data'
  `);
  console.log(`  invalid_data -> invalid_data: ${(invalidCount.rows[0] as any)?.count} records`);

  if (!DRY_RUN) {
    await db.execute(sql`
      UPDATE dialer_call_attempts dca
      SET disposition = 'invalid_data',
          updated_at = NOW()
      FROM campaign_queue cq
      WHERE cq.id = dca.queue_item_id
        AND dca.disposition IS NULL
        AND cq.removed_reason = 'invalid_data'
    `);
    console.log('    ✅ Updated');
  }

  // telnyx_account_disabled -> invalid_data
  const telnyxCount = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM dialer_call_attempts dca
    INNER JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    WHERE dca.disposition IS NULL
      AND cq.removed_reason = 'telnyx_account_disabled'
  `);
  console.log(`  telnyx_account_disabled -> invalid_data: ${(telnyxCount.rows[0] as any)?.count} records`);

  if (!DRY_RUN) {
    await db.execute(sql`
      UPDATE dialer_call_attempts dca
      SET disposition = 'invalid_data',
          updated_at = NOW()
      FROM campaign_queue cq
      WHERE cq.id = dca.queue_item_id
        AND dca.disposition IS NULL
        AND cq.removed_reason = 'telnyx_account_disabled'
    `);
    console.log('    ✅ Updated');
  }

  // 2. Backfill based on voicemail_detected flag
  console.log('\nStep 2: Backfill from voicemail_detected flag');
  console.log('----------------------------------------------');

  const voicemailCount = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM dialer_call_attempts
    WHERE disposition IS NULL
      AND voicemail_detected = true
  `);
  console.log(`  voicemail_detected=true -> voicemail: ${(voicemailCount.rows[0] as any)?.count} records`);

  if (!DRY_RUN) {
    await db.execute(sql`
      UPDATE dialer_call_attempts
      SET disposition = 'voicemail',
          updated_at = NOW()
      WHERE disposition IS NULL
        AND voicemail_detected = true
    `);
    console.log('    ✅ Updated');
  }

  // 3. Backfill completed calls (done status) that were not connected
  console.log('\nStep 3: Backfill completed calls not connected');
  console.log('-----------------------------------------------');

  const noAnswerCount = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM dialer_call_attempts dca
    INNER JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    WHERE dca.disposition IS NULL
      AND cq.status = 'done'
      AND cq.removed_reason IS NULL
      AND dca.connected = false
      AND dca.voicemail_detected = false
  `);
  console.log(`  done + not connected + not voicemail -> no_answer: ${(noAnswerCount.rows[0] as any)?.count} records`);

  if (!DRY_RUN) {
    await db.execute(sql`
      UPDATE dialer_call_attempts dca
      SET disposition = 'no_answer',
          updated_at = NOW()
      FROM campaign_queue cq
      WHERE cq.id = dca.queue_item_id
        AND dca.disposition IS NULL
        AND cq.status = 'done'
        AND cq.removed_reason IS NULL
        AND dca.connected = false
        AND dca.voicemail_detected = false
    `);
    console.log('    ✅ Updated');
  }

  // 4. Check remaining NULL dispositions
  console.log('\nStep 4: Check remaining NULL dispositions');
  console.log('------------------------------------------');

  const remaining = await db.execute(sql`
    SELECT
      cq.status,
      cq.removed_reason,
      dca.connected,
      dca.voicemail_detected,
      COUNT(*) as count
    FROM dialer_call_attempts dca
    LEFT JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    WHERE dca.disposition IS NULL
    GROUP BY cq.status, cq.removed_reason, dca.connected, dca.voicemail_detected
    ORDER BY count DESC
  `);

  console.log('Remaining NULL dispositions by status:');
  for (const row of remaining.rows) {
    const r = row as any;
    console.log(`  status=${r.status || 'NULL'} / reason=${r.removed_reason || 'NULL'} / connected=${r.connected} / voicemail=${r.voicemail_detected}: ${r.count}`);
  }

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');

  const finalCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM dialer_call_attempts WHERE disposition IS NULL
  `);
  console.log(`Total NULL dispositions remaining: ${(finalCount.rows[0] as any)?.count}`);

  if (DRY_RUN) {
    console.log('\n💡 To apply these changes, run:');
    console.log('   npx tsx run-backfill-dispositions.ts --execute');
  }

  process.exit(0);
}

backfillDispositions().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
