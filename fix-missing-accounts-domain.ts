
import { pool } from './server/db';
import * as crypto from 'crypto';

const CAMPAIGN_ID = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
const LIST_ID = '439cccbf-f6fd-4afe-a8b4-11e55821f9e0';

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
  'icloud.com', 'aol.com', 'live.com', 'msn.com',
  'virgin.net', 'btinternet.com', 'sky.com', 'talktalk.net'
]);

async function fixMissingAccountsByDomain() {
  console.log('=== FIXING MISSING ACCOUNTS BY DOMAIN ===\n');

  // 1. Get contacts with missing account_id from the list
  const listResult = await pool.query('SELECT record_ids FROM lists WHERE id = $1', [LIST_ID]);
  const allRecordIds = listResult.rows[0]?.record_ids || [];

  if (allRecordIds.length === 0) return;

  const contactsResult = await pool.query(`
    SELECT id, email_normalized, first_name, last_name 
    FROM contacts
    WHERE id = ANY($1) AND account_id IS NULL AND email_normalized IS NOT NULL
  `, [allRecordIds]);

  const contactsToFix = contactsResult.rows;
  console.log(`Found ${contactsToFix.length} contacts with missing account_id and valid email.`);

  let linkedCount = 0;
  let createdAccountCount = 0;
  let skippedGeneric = 0;
  let errorCount = 0;

  // Process in chunks or one by one? 12k is a lot for one by one if we query DB each time.
  // Let's group by domain first.
  const domainsMap = new Map<string, any[]>();

  for (const contact of contactsToFix) {
    const email = contact.email_normalized;
    const parts = email.split('@');
    if (parts.length !== 2) continue;
    
    const domain = parts[1].toLowerCase();
    if (GENERIC_DOMAINS.has(domain)) {
        skippedGeneric++;
        continue;
    }

    if (!domainsMap.has(domain)) {
        domainsMap.set(domain, []);
    }
    domainsMap.get(domain)?.push(contact);
  }

  console.log(`Processing ${domainsMap.size} unique domains...`);
  const domains = Array.from(domainsMap.keys());
  
  // 2. Process domains in batches
  const DOMAIN_BATCH_SIZE = 50;
  for (let i = 0; i < domains.length; i += DOMAIN_BATCH_SIZE) {
      const batchDomains = domains.slice(i, i + DOMAIN_BATCH_SIZE);
      console.log(`Processing domains batch ${i + 1} to ${Math.min(i + DOMAIN_BATCH_SIZE, domains.length)}...`);

      for (const domain of batchDomains) {
          try {
              // Check if account exists with this website
              // Searching vaguely for website like domain
              const existingAccountFn = await pool.query(`
                  SELECT id FROM accounts 
                  WHERE website ILIKE $1 OR name ILIKE $1
                  LIMIT 1
              `, [`%${domain}%`]);

              let accountId = existingAccountFn.rows[0]?.id;

              if (!accountId) {
                  // Create new account
                  const companyName = domain.split('.')[0].toUpperCase(); // Simple heuristic
                  const newAccount = await pool.query(`
                      INSERT INTO accounts (id, name, website, created_at, updated_at)
                      VALUES ($1, $2, $3, NOW(), NOW())
                      RETURNING id
                  `, [crypto.randomUUID(), companyName, domain]);
                  accountId = newAccount.rows[0].id;
                  createdAccountCount++;
              }

              // Update all contacts for this domain
              const contacts = domainsMap.get(domain) || [];
              const contactIds = contacts.map(c => c.id);
              
              await pool.query(`
                  UPDATE contacts
                  SET account_id = $1
                  WHERE id = ANY($2)
              `, [accountId, contactIds]);
              
              linkedCount += contacts.length;

              // Add to queue immediately?
              // Let's do a bulk insert into queue for these contacts
              const values = contactIds.map((cid, idx) => {
                  const baseIdx = idx * 4;
                  return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, 'queued', 100, NOW(), NOW())`;
              }).join(', ');

              const params = contactIds.flatMap(cid => [
                  crypto.randomUUID(),
                  CAMPAIGN_ID,
                  cid,
                  accountId
              ]);

              await pool.query(`
                  INSERT INTO campaign_queue (id, campaign_id, contact_id, account_id, status, priority, created_at, updated_at)
                  VALUES ${values}
                  ON CONFLICT (campaign_id, contact_id) DO NOTHING
              `, params);

          } catch (err) {
              console.error(`Error processing domain ${domain}:`, err);
              errorCount++;
          }
      }
  }

  console.log('\n=== Summary ===');
  console.log(`Total Contacts Processed: ${linkedCount}`);
  console.log(`New Accounts Created: ${createdAccountCount}`);
  console.log(`Skipped Generic Domains: ${skippedGeneric}`);
  console.log(`Errors: ${errorCount}`);

  process.exit(0);
}

fixMissingAccountsByDomain().catch(err => {
    console.error(err);
    process.exit(1);
});
