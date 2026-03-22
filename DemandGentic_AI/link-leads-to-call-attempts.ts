/**
 * Link Existing Leads to Call Attempts
 * 
 * Finds leads that have no call_attempt_id but can be matched
 * to dialer_call_attempts by contact_id + phone number
 */

import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function linkLeadsToAttempts() {
  console.log('=== Link Leads to Call Attempts ===\n');

  // Find leads that could be linked to call attempts
  const linkable = await pool.query(`
    SELECT 
      l.id as lead_id,
      l.contact_id,
      l.dialed_number,
      dca.id as matching_attempt_id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.created_at as attempt_created
    FROM leads l
    JOIN dialer_call_attempts dca ON (
      dca.contact_id = l.contact_id 
      AND (
        dca.phone_dialed = l.dialed_number 
        OR dca.phone_dialed = REPLACE(l.dialed_number, '+', '')
        OR '+' || dca.phone_dialed = l.dialed_number
      )
    )
    WHERE l.call_attempt_id IS NULL
    ORDER BY l.created_at DESC
  `);

  console.log('Leads that can be linked:', linkable.rowCount);
  
  if (linkable.rowCount === 0) {
    console.log('No leads to link.');
    await pool.end();
    return;
  }

  // Preview first 10
  console.log('\nPreview (first 10):');
  for (const r of linkable.rows.slice(0, 10)) {
    console.log(`  Lead: ${r.lead_id.substring(0, 12)}... -> Attempt: ${r.matching_attempt_id.substring(0, 12)}... | Disp: ${r.disposition} | Dur: ${r.call_duration_seconds}s`);
  }

  // Update the leads
  console.log('\nLinking leads to call attempts...');
  let linked = 0;
  let errors = 0;

  for (const r of linkable.rows) {
    try {
      await pool.query(
        'UPDATE leads SET call_attempt_id = $1, updated_at = NOW() WHERE id = $2',
        [r.matching_attempt_id, r.lead_id]
      );
      linked++;
    } catch (err: any) {
      errors++;
      console.error(`  Error linking ${r.lead_id}: ${err.message}`);
    }
  }

  console.log(`\nDone! Linked: ${linked}, Errors: ${errors}`);

  // Also update call attempts to have qualified_lead disposition if they're linked to leads
  console.log('\nUpdating call attempts to qualified_lead disposition...');
  const updateResult = await pool.query(`
    UPDATE dialer_call_attempts dca
    SET disposition = 'qualified_lead', updated_at = NOW()
    FROM leads l
    WHERE l.call_attempt_id = dca.id
      AND dca.disposition != 'qualified_lead'
    RETURNING dca.id
  `);
  
  console.log(`Updated ${updateResult.rowCount} call attempts to qualified_lead`);

  await pool.end();
}

linkLeadsToAttempts().catch(console.error);