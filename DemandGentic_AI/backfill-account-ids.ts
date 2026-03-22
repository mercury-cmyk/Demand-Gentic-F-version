/**
 * Backfill account_id for contacts missing them
 * Matches contacts to accounts by:
 * 1. Email domain → account.domain_normalized or account.website_domain
 * 2. company_norm → account.name_normalized
 */
import { db, pool } from './server/db';

const LIST_ID = '65ef1c92-2b65-44df-ae96-9297bb525577'; // Pivotal B2B Demand list

async function main() {
  console.log('=== Backfill Account IDs for List Contacts ===\n');

  // Step 1: Check current state
  const beforeStats = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(c.account_id) as has_account,
      COUNT(*) - COUNT(c.account_id) as missing_account
    FROM lists l
    CROSS JOIN LATERAL unnest(l.record_ids) AS rid
    JOIN contacts c ON c.id = rid
    WHERE l.id = $1
  `, [LIST_ID]);
  
  console.log('Before:', beforeStats.rows[0]);
  
  // Step 2: Check what fields we can match on
  const sampleContacts = await pool.query(`
    SELECT c.id, c.full_name, c.email, c.company_norm, 
           substring(c.email from '@(.*)$') as email_domain
    FROM lists l
    CROSS JOIN LATERAL unnest(l.record_ids) AS rid
    JOIN contacts c ON c.id = rid
    WHERE l.id = $1 AND c.account_id IS NULL
    LIMIT 10
  `, [LIST_ID]);
  
  console.log('\nSample contacts without account_id:');
  sampleContacts.rows.forEach((r: any) => {
    console.log(`  ${r.full_name} | ${r.email} | company_norm: ${r.company_norm}`);
  });

  // Step 3: Match by email domain
  console.log('\n--- Matching by email domain ---');
  const domainMatchResult = await pool.query(`
    WITH list_contacts AS (
      SELECT c.id, c.email, 
             lower(substring(c.email from '@(.*)$')) as email_domain
      FROM lists l
      CROSS JOIN LATERAL unnest(l.record_ids) AS rid
      JOIN contacts c ON c.id = rid
      WHERE l.id = $1 AND c.account_id IS NULL AND c.email IS NOT NULL
    )
    UPDATE contacts c
    SET account_id = a.id,
        updated_at = now()
    FROM list_contacts lc
    JOIN accounts a ON (
      lower(a.domain_normalized) = lc.email_domain 
      OR lower(a.website_domain) = lc.email_domain
      OR lower(a.domain) = lc.email_domain
    )
    WHERE c.id = lc.id AND c.account_id IS NULL
    RETURNING c.id
  `, [LIST_ID]);
  
  console.log(`Matched by domain: ${domainMatchResult.rowCount}`);

  // Step 4: Match by company_norm → account.name_normalized
  console.log('\n--- Matching by company name ---');
  const nameMatchResult = await pool.query(`
    WITH list_contacts AS (
      SELECT c.id, c.company_norm
      FROM lists l
      CROSS JOIN LATERAL unnest(l.record_ids) AS rid
      JOIN contacts c ON c.id = rid
      WHERE l.id = $1 AND c.account_id IS NULL AND c.company_norm IS NOT NULL
    )
    UPDATE contacts c
    SET account_id = a.id,
        updated_at = now()
    FROM list_contacts lc
    JOIN accounts a ON lower(a.name_normalized) = lower(lc.company_norm)
    WHERE c.id = lc.id AND c.account_id IS NULL
    RETURNING c.id
  `, [LIST_ID]);
  
  console.log(`Matched by name_normalized: ${nameMatchResult.rowCount}`);

  // Step 5: Match by fuzzy company name (account.name contains company_norm)
  console.log('\n--- Matching by fuzzy company name ---');
  const fuzzyMatchResult = await pool.query(`
    WITH list_contacts AS (
      SELECT c.id, c.company_norm
      FROM lists l
      CROSS JOIN LATERAL unnest(l.record_ids) AS rid
      JOIN contacts c ON c.id = rid
      WHERE l.id = $1 AND c.account_id IS NULL AND c.company_norm IS NOT NULL
        AND length(c.company_norm) > 3
    ),
    best_matches AS (
      SELECT DISTINCT ON (lc.id) 
        lc.id as contact_id,
        a.id as account_id
      FROM list_contacts lc
      JOIN accounts a ON lower(a.name) LIKE '%' || lower(lc.company_norm) || '%'
      ORDER BY lc.id, length(a.name) ASC  -- Prefer shorter/more exact matches
    )
    UPDATE contacts c
    SET account_id = bm.account_id,
        updated_at = now()
    FROM best_matches bm
    WHERE c.id = bm.contact_id AND c.account_id IS NULL
    RETURNING c.id
  `, [LIST_ID]);
  
  console.log(`Matched by fuzzy name: ${fuzzyMatchResult.rowCount}`);

  // Step 6: Final stats
  const afterStats = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(c.account_id) as has_account,
      COUNT(*) - COUNT(c.account_id) as missing_account
    FROM lists l
    CROSS JOIN LATERAL unnest(l.record_ids) AS rid
    JOIN contacts c ON c.id = rid
    WHERE l.id = $1
  `, [LIST_ID]);
  
  console.log('\n=== Results ===');
  console.log('Before:', beforeStats.rows[0]);
  console.log('After:', afterStats.rows[0]);
  
  const totalMatched = 
    (domainMatchResult.rowCount || 0) + 
    (nameMatchResult.rowCount || 0) + 
    (fuzzyMatchResult.rowCount || 0);
  console.log(`\nTotal contacts matched: ${totalMatched}`);
  
  // Check remaining unmatched
  const remainingUnmatched = await pool.query(`
    SELECT c.company_norm, COUNT(*) as cnt
    FROM lists l
    CROSS JOIN LATERAL unnest(l.record_ids) AS rid
    JOIN contacts c ON c.id = rid
    WHERE l.id = $1 AND c.account_id IS NULL
    GROUP BY c.company_norm
    ORDER BY cnt DESC
    LIMIT 20
  `, [LIST_ID]);
  
  if (remainingUnmatched.rows.length > 0) {
    console.log('\nTop 20 unmatched company names (need accounts created):');
    remainingUnmatched.rows.forEach((r: any) => {
      console.log(`  ${r.cnt}x "${r.company_norm}"`);
    });
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});