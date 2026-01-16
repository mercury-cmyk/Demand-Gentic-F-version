import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkRecentCalls() {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) as total_calls,
      COUNT(CASE WHEN disposition = 'voicemail' THEN 1 END) as voicemail_calls,
      COUNT(CASE WHEN disposition IN ('qualified_lead', 'not_interested', 'do_not_call') THEN 1 END) as human_calls,
      AVG(CASE WHEN disposition = 'voicemail' THEN call_duration_seconds END) as avg_voicemail_duration,
      COUNT(CASE WHEN call_duration_seconds BETWEEN 58 AND 62 THEN 1 END) as calls_at_60s,
      MAX(created_at) as last_call
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);

  console.log('\n📊 Last 24 Hours Call Statistics');
  console.log('================================');
  console.log('Total Calls:', result.rows[0].total_calls);
  console.log('Voicemail Calls:', result.rows[0].voicemail_calls);
  console.log('Human Calls:', result.rows[0].human_calls);
  console.log('Avg Voicemail Duration:', result.rows[0].avg_voicemail_duration ? Math.round(result.rows[0].avg_voicemail_duration) + 's' : 'N/A');
  console.log('Calls ending at ~60s:', result.rows[0].calls_at_60s);
  console.log('Last Call:', result.rows[0].last_call || 'No recent calls');

  // Also check calls from last 7 days for more context
  const weekResult = await db.execute(sql`
    SELECT
      COUNT(*) as total_calls,
      COUNT(CASE WHEN disposition = 'voicemail' THEN 1 END) as voicemail_calls,
      AVG(CASE WHEN disposition = 'voicemail' THEN call_duration_seconds END) as avg_voicemail_duration
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '7 days'
  `);

  console.log('\n📅 Last 7 Days Call Statistics');
  console.log('================================');
  console.log('Total Calls:', weekResult.rows[0].total_calls);
  console.log('Voicemail Calls:', weekResult.rows[0].voicemail_calls);
  console.log('Avg Voicemail Duration:', weekResult.rows[0].avg_voicemail_duration ? Math.round(weekResult.rows[0].avg_voicemail_duration) + 's' : 'N/A');

  process.exit(0);
}

checkRecentCalls();
