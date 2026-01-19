import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function resetStuckItems() {
  console.log('Resetting stuck in_progress queue items...\n');

  // Find stuck items (in_progress for more than 10 minutes)
  const stuckItems = await db.execute(sql`
    SELECT cq.id, cq.campaign_id, cq.contact_id, cq.updated_at, c.first_name, c.last_name
    FROM campaign_queue cq
    JOIN contacts c ON cq.contact_id = c.id
    WHERE cq.status = 'in_progress'
    AND cq.updated_at < NOW() - INTERVAL '10 minutes'
  `);

  console.log(`Found ${stuckItems.rows.length} stuck items:\n`);
  for (const item of stuckItems.rows as any[]) {
    console.log(`  - ${item.first_name} ${item.last_name} (updated: ${item.updated_at})`);
  }

  if (stuckItems.rows.length > 0) {
    // Reset them back to 'queued'
    const result = await db.execute(sql`
      UPDATE campaign_queue
      SET status = 'queued', updated_at = NOW()
      WHERE status = 'in_progress'
      AND updated_at < NOW() - INTERVAL '10 minutes'
    `);

    console.log(`\n✅ Reset ${stuckItems.rows.length} stuck items back to 'queued' status`);
  } else {
    console.log('\n✅ No stuck items found');
  }

  // Show current queue status
  const queueStats = await db.execute(sql`
    SELECT status, COUNT(*) as count
    FROM campaign_queue
    WHERE campaign_id IN (
      SELECT id FROM campaigns WHERE dial_mode = 'ai_agent' AND status = 'active'
    )
    GROUP BY status
    ORDER BY status
  `);

  console.log('\nCurrent queue status for active AI campaigns:');
  for (const stat of queueStats.rows as any[]) {
    console.log(`  - ${stat.status}: ${stat.count}`);
  }

  process.exit(0);
}

resetStuckItems().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
