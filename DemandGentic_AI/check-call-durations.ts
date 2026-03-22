import { db } from './server/db';
import { sql } from 'drizzle-orm';

const result = await db.execute(sql`
  SELECT 
    COUNT(*) FILTER (WHERE call_duration_seconds > 0) as with_duration,
    COUNT(*) FILTER (WHERE call_duration_seconds = 0 OR call_duration_seconds IS NULL) as zero_duration,
    MIN(call_duration_seconds) as min_duration,
    MAX(call_duration_seconds) as max_duration,
    AVG(call_duration_seconds) as avg_duration
  FROM dialer_call_attempts
  WHERE disposition = 'qualified_lead'
    AND disposition_processed = false
`);

console.log(JSON.stringify(result.rows[0], null, 2));
process.exit(0);