import { storage } from './server/storage';

async function check() {
  const { pool } = await import('./server/db');
  
  // Check next_attempt_at distribution for UK contacts
  console.log('=== UK Contacts next_attempt_at Distribution ===');
  const nextAttemptResult = await pool.query(`
    SELECT 
      cq.next_attempt_at,
      count(*) as cnt
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = 'ff475cfd-2af3-4821-8d91-c62535cde2b1'
      AND cq.status = 'queued'
      AND (c.mobile_phone_e164 LIKE '+44%' AND LENGTH(c.mobile_phone_e164) BETWEEN 12 AND 14)
    GROUP BY cq.next_attempt_at
    ORDER BY cq.next_attempt_at NULLS FIRST
    LIMIT 10
  `);
  for (const r of nextAttemptResult.rows as any[]) {
    console.log(`  ${r.next_attempt_at || 'NULL'}: ${r.cnt} contacts`);
  }
  
  console.log('\nCurrent time (UTC):', new Date().toISOString());
  
  // Check what time those retries are scheduled for (in London time)
  console.log('\n=== Retry Times in London Timezone ===');
  const retryTimesResult = await pool.query(`
    SELECT 
      cq.next_attempt_at AT TIME ZONE 'Europe/London' as london_time,
      count(*) as cnt
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = 'ff475cfd-2af3-4821-8d91-c62535cde2b1'
      AND cq.status = 'queued'
      AND cq.next_attempt_at IS NOT NULL
      AND (c.mobile_phone_e164 LIKE '+44%' AND LENGTH(c.mobile_phone_e164) BETWEEN 12 AND 14)
    GROUP BY cq.next_attempt_at
    ORDER BY cq.next_attempt_at
    LIMIT 5
  `);
  for (const r of retryTimesResult.rows as any[]) {
    console.log(`  ${r.london_time}: ${r.cnt} contacts`);
  }
  
  process.exit(0);
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});