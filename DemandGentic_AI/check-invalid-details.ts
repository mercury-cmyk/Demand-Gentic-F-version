import { pool } from './server/db';

async function check() {
  // Check invalid_data calls - what are they really?
  const result = await pool.query(`
    SELECT
      call_duration_seconds,
      connected,
      voicemail_detected,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE disposition = 'invalid_data'
    GROUP BY call_duration_seconds, connected, voicemail_detected
    ORDER BY count DESC
    LIMIT 20
  `);

  console.log('Invalid Data Call Characteristics:');
  console.log('Duration | Connected | Voicemail | Count');
  console.log('-'.repeat(50));
  for (const row of result.rows) {
    console.log(`${String(row.call_duration_seconds || 0).padEnd(9)}| ${String(row.connected).padEnd(10)}| ${String(row.voicemail_detected).padEnd(10)}| ${row.count}`);
  }

  // Check if invalid_data calls have recording URLs (indicating they actually connected)
  const recordings = await pool.query(`
    SELECT COUNT(*) as total, COUNT(recording_url) as with_recording
    FROM dialer_call_attempts
    WHERE disposition = 'invalid_data'
  `);
  console.log(`\nInvalid data with recordings: ${recordings.rows[0].with_recording}/${recordings.rows[0].total}`);

  // Check test call table for the actual test call disposition
  const testCalls = await pool.query(`
    SELECT disposition, status, duration_seconds, call_summary, test_result, created_at
    FROM campaign_test_calls
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log('\n\nRecent Test Calls (campaign_test_calls table):');
  for (const row of testCalls.rows) {
    console.log(`Date: ${row.created_at}`);
    console.log(`Disposition: ${row.disposition}, Status: ${row.status}, Duration: ${row.duration_seconds}s, Result: ${row.test_result}`);
    if (row.call_summary) console.log(`Summary: ${row.call_summary.substring(0, 200)}...`);
    console.log('---');
  }

  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });