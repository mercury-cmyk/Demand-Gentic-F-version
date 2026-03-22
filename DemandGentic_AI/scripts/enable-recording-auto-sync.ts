/**
 * Enable Recording Auto-Sync for Campaigns
 * Enables automatic GCS storage for call recordings
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');

async function enableAutoSync() {
  console.log('\n========================================');
  console.log('  ENABLE RECORDING AUTO-SYNC');
  console.log(DRY_RUN ? '  (DRY RUN - no changes will be made)' : '');
  console.log('========================================\n');

  // Check current status
  const campaigns = await db.execute(sql`
    SELECT id, name, status, recording_auto_sync_enabled
    FROM campaigns
    WHERE status IN ('active', 'paused', 'draft')
    ORDER BY created_at DESC
  `);

  console.log('Current Campaign Settings:\n');
  console.log('Name'.padEnd(45) + ' | Status   | Auto-Sync');
  console.log('-'.repeat(75));

  let needsUpdate = 0;
  for (const row of campaigns.rows) {
    const r = row as any;
    const syncStatus = r.recording_auto_sync_enabled ? '✅ ENABLED' : '❌ DISABLED';
    const name = (r.name || 'Unnamed').substring(0, 42);
    console.log(name.padEnd(45) + ' | ' + (r.status || '').padEnd(8) + ' | ' + syncStatus);

    if (!r.recording_auto_sync_enabled) {
      needsUpdate++;
    }
  }

  console.log('');
  console.log(`Total campaigns: ${campaigns.rows.length}`);
  console.log(`Need auto-sync enabled: ${needsUpdate}`);
  console.log('');

  if (needsUpdate === 0) {
    console.log('✅ All campaigns already have auto-sync enabled!');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would enable auto-sync for ${needsUpdate} campaigns`);
    console.log('\nTo actually enable, run without --dry-run');
    process.exit(0);
  }

  // Enable auto-sync for all campaigns
  console.log(`Enabling auto-sync for ${needsUpdate} campaigns...`);

  const updateResult = await db.execute(sql`
    UPDATE campaigns
    SET recording_auto_sync_enabled = true,
        updated_at = NOW()
    WHERE recording_auto_sync_enabled = false
      OR recording_auto_sync_enabled IS NULL
  `);

  console.log(`\n✅ Updated ${needsUpdate} campaigns`);
  console.log('\nRecordings will now be automatically stored in GCS after calls complete.');

  process.exit(0);
}

enableAutoSync().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});