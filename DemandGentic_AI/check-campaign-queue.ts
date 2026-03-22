import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Check campaign queue for the active campaign
  const campaignId = 'ff475cfd-2af3-4821-8d91-c62535cde2b1';
  
  const queueStats = await db.execute(sql`
    SELECT 
      status,
      COUNT(*)::int as count
    FROM campaign_queue 
    WHERE campaign_id = ${campaignId}
    GROUP BY status
    ORDER BY count DESC
  `);
  
  console.log('=== CAMPAIGN QUEUE STATUS (Active AI Campaign) ===');
  console.table(queueStats.rows);
  
  // Check if queue has any 'queued' items ready for calling
  const queuedCount = await db.execute(sql`
    SELECT COUNT(*)::int as count 
    FROM campaign_queue 
    WHERE campaign_id = ${campaignId}
    AND status = 'queued'
  `);
  console.log('\nQueued items ready for calling:', (queuedCount.rows[0] as any).count);
  
  process.exit(0);
}
main();