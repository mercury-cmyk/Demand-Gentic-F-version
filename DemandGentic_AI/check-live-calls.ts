import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkLiveCalls() {
  console.log('=== CAMPAIGN QUEUE STATUS ===');
  const queued = await db.execute(sql`
    SELECT campaign_id, status, COUNT(*) as count 
    FROM campaign_queue 
    GROUP BY campaign_id, status 
    ORDER BY campaign_id, status
  `);
  console.table(queued.rows);

  console.log('\n=== CALL SESSIONS TABLE COLUMNS ===');
  const sessionCols = await db.execute(sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'call_sessions' 
    ORDER BY ordinal_position
  `);
  console.log('Columns:', sessionCols.rows.map((r: any) => r.column_name).join(', '));

  console.log('\n=== RECENT CALL SESSIONS (last 10) ===');
  const sessions = await db.execute(sql`
    SELECT id, telnyx_call_id, status, agent_type, campaign_id, started_at, ended_at, created_at
    FROM call_sessions 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  console.table(sessions.rows);

  console.log('\n=== IN-PROGRESS QUEUE ITEMS ===');
  const inProgress = await db.execute(sql`
    SELECT cq.id, cq.campaign_id, c.name as campaign_name, cq.status, cq.updated_at, 
           EXTRACT(EPOCH FROM (NOW() - cq.updated_at))/60 as minutes_since_update
    FROM campaign_queue cq
    LEFT JOIN campaigns c ON cq.campaign_id = c.id
    WHERE cq.status = 'in_progress'
    ORDER BY cq.updated_at DESC
    LIMIT 20
  `);
  console.table(inProgress.rows);

  console.log('\n=== RECENT CALL ATTEMPTS (last 10) ===');
  const attempts = await db.execute(sql`
    SELECT id, campaign_id, connected, call_started_at, call_ended_at, disposition, created_at 
    FROM dialer_call_attempts 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  console.table(attempts.rows);

  console.log('\n=== QUEUED ITEMS BY CAMPAIGN ===');
  const queuedByCampaign = await db.execute(sql`
    SELECT c.name as campaign_name, c.status as campaign_status, c.dial_mode,
           COUNT(cq.id) as queued_count
    FROM campaigns c
    LEFT JOIN campaign_queue cq ON c.id = cq.campaign_id AND cq.status = 'queued'
    WHERE c.status = 'active'
    GROUP BY c.id, c.name, c.status, c.dial_mode
    ORDER BY queued_count DESC
  `);
  console.table(queuedByCampaign.rows);

  process.exit(0);
}

checkLiveCalls().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});