import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function check() {
  // Check what notes/reasons are recorded for invalid_data
  const invalid = await db.execute(sql`
    SELECT notes, COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'invalid_data'
    GROUP BY notes
    ORDER BY cnt DESC
    LIMIT 20
  `);
  
  console.log('=== INVALID_DATA REASONS ===');
  for (const r of invalid.rows) {
    console.log(`[${r.cnt}] ${r.notes || 'No notes'}`);
  }
  
  // Check when these started appearing
  const timeline = await db.execute(sql`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'invalid_data'
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 10
  `);
  
  console.log('\n=== INVALID_DATA BY DATE ===');
  for (const r of timeline.rows) {
    console.log(`${r.date}: ${r.cnt} calls`);
  }
  
  // Check if these were blocked before call or after
  const durations = await db.execute(sql`
    SELECT 
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN 'No call made (blocked)'
        WHEN call_duration_seconds < 5 THEN 'Under 5s'
        WHEN call_duration_seconds < 15 THEN '5-15s'
        ELSE 'Over 15s'
      END as duration_bucket,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'invalid_data'
    GROUP BY duration_bucket
    ORDER BY cnt DESC
  `);
  
  console.log('\n=== INVALID_DATA BY CALL DURATION ===');
  for (const r of durations.rows) {
    console.log(`${r.duration_bucket}: ${r.cnt}`);
  }
  
  process.exit(0);
}

check();
