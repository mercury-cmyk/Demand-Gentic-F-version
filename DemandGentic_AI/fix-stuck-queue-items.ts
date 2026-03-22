import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function fixStuckQueueItems() {
  console.log('=== CHECKING STUCK QUEUE ITEMS ===');
  
  // Find items stuck in_progress for more than 5 minutes
  const stuckItems = await db.execute(sql`
    SELECT id, campaign_id, contact_id, status, created_at, updated_at,
           EXTRACT(EPOCH FROM (NOW() - updated_at))/60 as minutes_stuck
    FROM campaign_queue 
    WHERE status = 'in_progress'
      AND updated_at  0) {
    console.log('\n=== RESETTING STUCK ITEMS TO QUEUED ===');
    
    const result = await db.execute(sql`
      UPDATE campaign_queue 
      SET status = 'queued', updated_at = NOW()
      WHERE status = 'in_progress'
        AND updated_at < NOW() - INTERVAL '5 minutes'
      RETURNING id
    `);

    console.log(`✓ Reset ${result.rows.length} items back to queued status`);
    
    // Show updated queue status
    console.log('\n=== UPDATED QUEUE STATUS ===');
    const updated = await db.execute(sql`
      SELECT campaign_id, status, COUNT(*) as count 
      FROM campaign_queue 
      WHERE campaign_id = 'ad8c5155-fcc3-4b4c-bdc6-55b4b58cbb37'
      GROUP BY campaign_id, status 
      ORDER BY status
    `);
    console.table(updated.rows);
  } else {
    console.log('No stuck items found.');
  }

  process.exit(0);
}

fixStuckQueueItems().catch(console.error);