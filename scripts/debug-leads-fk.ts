/**
 * Debug script to understand the FK constraint and leads issue
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function debug() {
  console.log('\n========================================');
  console.log('  DEBUG: LEADS FK CONSTRAINT');
  console.log('========================================\n');

  // 1. Check if FK constraint exists on leads.call_attempt_id
  console.log('1. Checking FK constraints on leads table...\n');
  const fkConstraints = await db.execute(sql`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name='leads'
      AND kcu.column_name = 'call_attempt_id'
  `);

  if (fkConstraints.rows.length > 0) {
    console.log('FK constraint found:');
    console.log(JSON.stringify(fkConstraints.rows, null, 2));
  } else {
    console.log('✅ No FK constraint on leads.call_attempt_id - inserts should work');
  }

  // 2. Check what tables have call attempts
  console.log('\n2. Checking call attempt IDs from qualified calls...\n');
  const qualifiedCalls = await db.execute(sql`
    SELECT id, contact_id, disposition, disposition_processed
    FROM dialer_call_attempts
    WHERE disposition = 'qualified_lead'
    LIMIT 5
  `);
  console.log('Qualified dialer_call_attempts:');
  console.log(JSON.stringify(qualifiedCalls.rows, null, 2));

  // 3. Check if these IDs exist in call_attempts table
  console.log('\n3. Checking if dialer_call_attempts IDs exist in call_attempts...\n');
  if (qualifiedCalls.rows.length > 0) {
    const firstId = (qualifiedCalls.rows[0] as any).id;
    const existsInCallAttempts = await db.execute(sql`
      SELECT id FROM call_attempts WHERE id = ${firstId}
    `);
    console.log(`ID ${firstId} exists in call_attempts: ${existsInCallAttempts.rows.length > 0}`);
  }

  // 4. Check leads with callAttemptId set
  console.log('\n4. Checking leads with callAttemptId...\n');
  const leadsWithAttempt = await db.execute(sql`
    SELECT id, call_attempt_id, contact_name
    FROM leads
    WHERE call_attempt_id IS NOT NULL
    LIMIT 5
  `);
  console.log('Leads with call_attempt_id:');
  console.log(JSON.stringify(leadsWithAttempt.rows, null, 2));

  // 5. Try to understand the ID format
  console.log('\n5. Comparing ID formats...\n');
  const dialerCallSample = await db.execute(sql`
    SELECT id FROM dialer_call_attempts LIMIT 1
  `);
  const callAttemptsSample = await db.execute(sql`
    SELECT id FROM call_attempts LIMIT 1
  `);

  if (dialerCallSample.rows.length > 0) {
    console.log('Sample dialer_call_attempts.id:', (dialerCallSample.rows[0] as any).id);
  }
  if (callAttemptsSample.rows.length > 0) {
    console.log('Sample call_attempts.id:', (callAttemptsSample.rows[0] as any).id);
  }

  // 6. Directly check if qualified_lead calls have matching leads
  console.log('\n6. Direct check: qualified_lead calls vs leads...\n');
  const mismatchCheck = await db.execute(sql`
    SELECT
      dca.id as call_attempt_id,
      dca.disposition,
      dca.disposition_processed,
      (SELECT COUNT(*) FROM leads l WHERE l.call_attempt_id = dca.id::text) as lead_count
    FROM dialer_call_attempts dca
    WHERE dca.disposition = 'qualified_lead'
    LIMIT 10
  `);
  console.log('Qualified calls with lead count:');
  console.log(JSON.stringify(mismatchCheck.rows, null, 2));

  console.log('\n========================================');
  console.log('  DEBUG COMPLETE');
  console.log('========================================\n');

  process.exit(0);
}

debug().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
