import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkStuckCalls() {
  // Get in-progress calls with details
  const result = await db.execute(sql`
    SELECT
      cq.id,
      cq.campaign_id,
      cq.status,
      cq.updated_at,
      cq.enqueued_reason,
      EXTRACT(EPOCH FROM (NOW() - cq.updated_at)) / 60 as minutes_since_update
    FROM campaign_queue cq
    WHERE cq.status = 'in_progress'
    ORDER BY cq.updated_at ASC
    LIMIT 20
  `);

  console.log('\n=== IN-PROGRESS CALLS (potentially stuck) ===\n');

  if (result.rows.length === 0) {
    console.log('No in-progress calls found.');
  } else {
    for (const row of result.rows as any[]) {
      const mins = Number(row.minutes_since_update) || 0;
      const stuckWarning = mins > 5 ? ' ⚠️ STUCK!' : '';
      console.log(`ID: ${row.id}`);
      console.log(`  Status: ${row.status}`);
      console.log(`  Updated: ${row.updated_at}`);
      console.log(`  Minutes since update: ${mins.toFixed(1)}${stuckWarning}`);
      console.log(`  Reason: ${row.enqueued_reason?.substring(0, 100) || 'N/A'}`);
      console.log('');
    }
  }

  // Get campaign max call duration
  const campaignResult = await db.execute(sql`
    SELECT id, name, max_call_duration_seconds
    FROM campaigns
    WHERE status = 'active' AND dial_mode = 'ai_agent'
  `);

  console.log('=== CAMPAIGN MAX CALL DURATION SETTINGS ===\n');
  for (const row of campaignResult.rows as any[]) {
    console.log(`${row.name}: ${row.max_call_duration_seconds || 'NOT SET (default 240s)'}s`);
  }

  process.exit(0);
}

checkStuckCalls().catch(e => { console.error(e); process.exit(1); });