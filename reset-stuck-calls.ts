import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * Reset stuck calls that have been in_progress for too long
 * This fixes the issue where calls get stuck when WebSocket connections drop
 * without proper cleanup.
 */
async function resetStuckCalls() {
  const STUCK_THRESHOLD_MINUTES = 5;

  console.log(`\n=== RESETTING STUCK CALLS (> ${STUCK_THRESHOLD_MINUTES} minutes) ===\n`);

  try {
    // Find and count stuck calls
    const stuckResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM campaign_queue
      WHERE status = 'in_progress'
        AND updated_at < NOW() - INTERVAL '${sql.raw(String(STUCK_THRESHOLD_MINUTES))} minutes'
    `);

    const stuckCount = Number((stuckResult.rows[0] as any)?.count) || 0;
    console.log(`Found ${stuckCount} stuck calls`);

    if (stuckCount === 0) {
      console.log('No stuck calls to reset.');
      process.exit(0);
    }

    // Reset stuck calls to 'queued' status
    const updateResult = await db.execute(sql`
      UPDATE campaign_queue
      SET
        status = 'queued',
        updated_at = NOW(),
        enqueued_reason = CONCAT(
          COALESCE(enqueued_reason, ''),
          '|reset_stuck:', TO_CHAR(NOW(), 'HH24:MI:SS')
        )
      WHERE status = 'in_progress'
        AND updated_at < NOW() - INTERVAL '${sql.raw(String(STUCK_THRESHOLD_MINUTES))} minutes'
      RETURNING id, campaign_id
    `);

    const resetCount = updateResult.rows.length;
    console.log(`\n✅ Reset ${resetCount} stuck calls to 'queued' status`);

    // Show details of reset calls
    if (resetCount > 0) {
      console.log('\nReset call IDs:');
      for (const row of updateResult.rows as any[]) {
        console.log(`  - ${row.id} (campaign: ${row.campaign_id})`);
      }
    }

  } catch (error) {
    console.error('❌ Error resetting stuck calls:', error);
    process.exit(1);
  }

  process.exit(0);
}

resetStuckCalls();
