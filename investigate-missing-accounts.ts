
import { pool } from './server/db';

async function investigateMissingAccounts() {
  const LIST_ID = '439cccbf-f6fd-4afe-a8b4-11e55821f9e0'; 
  
  console.log('=== INSPECTING CONTACTS WITH MISSING ACCOUNTS ===\n');

  const listResult = await pool.query('SELECT record_ids FROM lists WHERE id = $1', [LIST_ID]);
  const allRecordIds = listResult.rows[0]?.record_ids || [];

  if (allRecordIds.length === 0) return;

  const sample = await pool.query(`
    SELECT email, email_normalized, full_name
    FROM contacts
    WHERE id = ANY($1) AND account_id IS NULL AND company_norm IS NULL
    LIMIT 20
  `, [allRecordIds]); 

  console.log('Sample emails for contacts without account_id and company_norm:');
  console.table(sample.rows);
  
  process.exit(0);
}

investigateMissingAccounts().catch(err => {
    console.error(err);
    process.exit(1);
});
