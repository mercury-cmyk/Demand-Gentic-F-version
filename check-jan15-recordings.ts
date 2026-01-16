import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkRecordings() {
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(recording_url) as with_url,
      COUNT(CASE WHEN notes LIKE '%[Call Transcript]%' THEN 1 END) as transcribed
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
      AND call_duration_seconds >= 60
  `);

  console.log('Jan 15 Calls (>60s):');
  console.log(JSON.stringify(stats.rows[0], null, 2));

  const sample = await db.execute(sql`
    SELECT id, recording_url
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
      AND call_duration_seconds >= 60
      AND recording_url IS NOT NULL
    LIMIT 3
  `);

  console.log('\nSample recordings:');
  sample.rows.forEach((row: any) => {
    console.log(`- ${row.id.substring(0, 8)}... : ${row.recording_url}`);
  });

  process.exit(0);
}

checkRecordings();