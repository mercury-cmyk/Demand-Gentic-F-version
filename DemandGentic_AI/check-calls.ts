import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkConcurrentCalls() {
  // Get in-progress calls by campaign
  const result = await db.execute(sql`
    SELECT
      c.id as campaign_id,
      c.name as campaign_name,
      c.status as campaign_status,
      c.dial_mode,
      COUNT(cq.id) FILTER (WHERE cq.status = 'in_progress') as in_progress_count,
      COUNT(cq.id) FILTER (WHERE cq.status = 'queued') as queued_count
    FROM campaigns c
    LEFT JOIN campaign_queue cq ON cq.campaign_id = c.id
    WHERE c.status = 'active' AND c.dial_mode = 'ai_agent'
    GROUP BY c.id, c.name, c.status, c.dial_mode
    ORDER BY in_progress_count DESC
  `);

  console.log('\n=== ACTIVE AI AGENT CAMPAIGNS ===\n');

  let totalInProgress = 0;
  let totalQueued = 0;

  if (result.rows.length === 0) {
    console.log('No active AI agent campaigns found.');
  } else {
    for (const row of result.rows as any[]) {
      const inProgress = Number(row.in_progress_count) || 0;
      const queued = Number(row.queued_count) || 0;
      totalInProgress += inProgress;
      totalQueued += queued;
      console.log(`Campaign: ${row.campaign_name}`);
      console.log(`  - In Progress: ${inProgress}`);
      console.log(`  - Queued: ${queued}`);
      console.log('');
    }
  }

  console.log('=== TOTALS ===');
  console.log(`Total Concurrent Calls: ${totalInProgress}`);
  console.log(`Total Queued: ${totalQueued}`);

  process.exit(0);
}

checkConcurrentCalls().catch(e => { console.error(e); process.exit(1); });