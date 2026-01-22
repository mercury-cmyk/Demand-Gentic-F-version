/**
 * Check recording URLs for recently created leads
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function check() {
  const result = await db.execute(sql`
    SELECT
      id,
      contact_name,
      recording_url,
      recording_s3_key,
      call_duration,
      call_attempt_id,
      created_at
    FROM leads
    WHERE created_at > NOW() - INTERVAL '2 hours'
    ORDER BY created_at DESC
  `);

  console.log('Recently created leads:\n');
  for (const row of result.rows) {
    const r = row as any;
    console.log(`Lead: ${r.id}`);
    console.log(`  Contact: ${r.contact_name}`);
    console.log(`  Duration: ${r.call_duration}s`);
    console.log(`  Call Attempt ID: ${r.call_attempt_id}`);
    console.log(`  Recording URL: ${r.recording_url ? 'SET' : 'NULL'}`);
    console.log(`  S3 Key: ${r.recording_s3_key || 'NULL'}`);
    if (r.recording_url) {
      console.log(`  URL Preview: ${r.recording_url.substring(0, 100)}...`);
    }
    console.log('');
  }

  // Also check the source call attempts
  console.log('\n--- Source Call Attempts (with Telnyx IDs) ---\n');
  const attempts = await db.execute(sql`
    SELECT
      dca.id,
      dca.recording_url,
      dca.telnyx_call_id,
      c.full_name
    FROM dialer_call_attempts dca
    JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.disposition = 'qualified_lead'
    ORDER BY dca.created_at DESC
    LIMIT 9
  `);

  for (const row of attempts.rows) {
    const r = row as any;
    console.log(`Attempt: ${r.id}`);
    console.log(`  Contact: ${r.full_name}`);
    console.log(`  Telnyx Call ID: ${r.telnyx_call_id || 'NULL'}`);
    console.log(`  Recording: ${r.recording_url ? 'SET' : 'NULL'}`);
    if (r.recording_url) {
      console.log(`  URL: ${r.recording_url.substring(0, 100)}...`);
    }
    console.log('');
  }

  process.exit(0);
}

check().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
