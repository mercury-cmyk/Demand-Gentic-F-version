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
    AND cq.updated_at  0) {
    // Reset them back to 'queued'
    const result = await db.execute(sql`
      UPDATE campaign_queue
      SET status = 'queued', updated_at = NOW()
      WHERE status = 'in_progress'
      AND updated_at  {
  console.error('Error:', err);
  process.exit(1);
});