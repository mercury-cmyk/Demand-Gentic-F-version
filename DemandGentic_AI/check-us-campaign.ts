import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function check() {
  // Check the Agentic DemandGen campaign specifically
  const campaignId = 'ff475cfd-2af3-4821-8d91-c62535cde2b1';
  
  console.log('=== US CAMPAIGN ELIGIBILITY CHECK ===');
  
  // Check sample contacts and their business hours eligibility
  const eligible = await db.execute(sql`
    SELECT c.first_name, c.last_name, c.country, c.timezone,
           c.mobile_phone_e164, c.direct_phone_e164,
           CASE 
             WHEN UPPER(c.country) IN ('US', 'USA', 'UNITED STATES', 'AMERICA')
             THEN (
               EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/New_York') BETWEEN 1 AND 5
               AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/New_York') BETWEEN 9 AND 16
             )
             ELSE false
           END as within_hours,
           EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/New_York') as day_of_week,
           EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/New_York') as current_hour
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = ${campaignId}
    AND cq.status = 'queued'
    AND (c.mobile_phone_e164 IS NOT NULL OR c.direct_phone_e164 IS NOT NULL)
    LIMIT 5
  `);
  
  for (const row of eligible.rows as any[]) {
    console.log(`  ${row.first_name} ${row.last_name}: country=${row.country}, within_hours=${row.within_hours}, day=${row.day_of_week}, hour=${row.current_hour}`);
  }
  
  // Check if contacts were called today
  const calledToday = await db.execute(sql`
    SELECT c.first_name, c.last_name, cs.created_at, cs.to_number_e164
    FROM call_sessions cs
    JOIN contacts c ON c.id = cs.contact_id
    JOIN campaign_queue cq ON cq.contact_id = cs.contact_id
    WHERE cq.campaign_id = ${campaignId}
    AND cs.created_at >= CURRENT_DATE
    AND cs.agent_type = 'ai'
    LIMIT 10
  `);
  
  console.log('\n=== CONTACTS CALLED TODAY (excluded from queue) ===');
  console.log(`Count: ${calledToday.rows.length}`);
  for (const row of calledToday.rows as any[]) {
    console.log(`  ${row.first_name} ${row.last_name} at ${row.created_at}`);
  }
  
  // Check if there are any in_progress items
  const inProgress = await db.execute(sql`
    SELECT COUNT(*) as count FROM campaign_queue 
    WHERE campaign_id = ${campaignId} AND status = 'in_progress'
  `);
  console.log(`\nIn-progress items: ${(inProgress.rows[0] as any).count}`);
  
  // Check next_attempt_at
  const nextAttempt = await db.execute(sql`
    SELECT cq.id, c.first_name, cq.next_attempt_at, cq.enqueued_reason
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = ${campaignId}
    AND cq.status = 'queued'
    AND (c.mobile_phone_e164 IS NOT NULL OR c.direct_phone_e164 IS NOT NULL)
    AND (cq.next_attempt_at IS NULL OR cq.next_attempt_at  { console.error(e); process.exit(1); });