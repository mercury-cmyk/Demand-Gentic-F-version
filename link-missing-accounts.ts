
import { pool } from './server/db';
import crypto from 'crypto';

/**
 * Script to link orphaned contacts (missing account_id) to accounts based on email domain.
 * - Matches against existing accounts first.
 * - Creates new placeholder accounts if no match found.
 * - Skips generic domains (gmail, yahoo, etc.)
 */

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 
  'me.com', 'msn.com', 'live.com', 'comcast.net', 'ymail.com'
]);

const BATCH_SIZE = 1000;

async function linkMissingAccounts() {
  console.log('=== Linking Orphaned Contacts to Accounts ===\n');

  // 1. Get contacts missing account_id with valid email
  console.log('Fetching orphaned contacts...');
  
  // We can process in chunks or stream. Given 100k, a cursor or offset loop is best.
  // Using a simple loop with LIMIT.
  
  let processed = 0;
  let linked = 0;
  let created = 0;
  let skipped = 0;

  while (true) {
    const res = await pool.query(`
      SELECT id, email, first_name, last_name 
      FROM contacts 
      WHERE account_id IS NULL 
        AND email IS NOT NULL 
        AND email LIKE '%@%'
      LIMIT $1
    `, [BATCH_SIZE]);

    if (res.rows.length === 0) break;

    const batch = res.rows;
    console.log(`Processing batch of ${batch.length} contacts (Total processed: ${processed})...`);

    // Prepare updates
    const updates: { contactId: string, accountId: string }[] = [];
    const newAccounts: { id: string, domain: string, name: string }[] = [];

    // Cache of domains we've seen in this batch to avoid duplicate account creation within same batch
    const batchDomains = new Map<string, string>(); // domain -> accountId

    for (const contact of batch) {
      const email = contact.email.toLowerCase().trim();
      const parts = email.split('@');
      if (parts.length !== 2) {
        skipped++;
        continue;
      }
      
      const domain = parts[1];
      if (GENERIC_DOMAINS.has(domain)) {
        skipped++;
        continue;
      }

      // Check if we already handled this domain in this batch
      if (batchDomains.has(domain)) {
        updates.push({ contactId: contact.id, accountId: batchDomains.get(domain)! });
        continue;
      }

      // Check DB for existing account
      // We look for strict match on website_domain or domain
      const accRes = await pool.query(`
        SELECT id FROM accounts 
        WHERE website_domain = $1 OR domain = $1 OR domain_normalized = $1
        LIMIT 1
      `, [domain]);

      if (accRes.rows.length > 0) {
        const accId = accRes.rows[0].id;
        updates.push({ contactId: contact.id, accountId: accId });
        batchDomains.set(domain, accId);
        linked++;
      } else {
        // Create new account
        const newId = crypto.randomUUID();
        const companyName = formatCompanyName(domain);
        
        newAccounts.push({
          id: newId,
          domain: domain,
          name: companyName
        });
        
        updates.push({ contactId: contact.id, accountId: newId });
        batchDomains.set(domain, newId);
        created++;
      }
    }

    // Perform DB writes
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert new accounts
      if (newAccounts.length > 0) {
         // Construct bulk insert
         // (id, name, domain, website_domain, created_at, updated_at)
         const values: any[] = [];
         const placeholders: string[] = [];
         
         newAccounts.forEach((acc, idx) => {
             const base = idx * 3;
             placeholders.push(`($${base+1}, $${base+2}, $${base+3}, $${base+3})`); // name, domain, website_domain
             values.push(acc.id, acc.name, acc.domain);
         });

         const query = `
           INSERT INTO accounts (id, name, domain, website_domain)
           VALUES ${placeholders.join(', ')}
           ON CONFLICT DO NOTHING
         `;
         // Note: ON CONFLICT might happen if another process created it, 
         // but we rely on batch processed sequentially mostly.
         // If generic ON CONFLICT (id) ignores, we are fine.
         
         await client.query(query, values);
      }

      // 2. Update contacts
      if (updates.length > 0) {
          // Bulk update via UNNEST or similar? 
          // Simple for-loop for now for safety, or a giant update CASE statement.
          // UPDATE contacts SET account_id = v.account_id FROM (VALUES ...) as v(contact_id, account_id) WHERE id = v.contact_id
          
          const updateValues: any[] = [];
          const updatePlaceholders: string[] = [];
          
          updates.forEach((u, idx) => {
              const base = idx * 2;
              updatePlaceholders.push(`($${base+1}::uuid, $${base+2}::uuid)`);
              updateValues.push(u.contactId, u.accountId);
          });
          
          const updateQuery = `
            UPDATE contacts AS c
            SET account_id = v.account_id
            FROM (VALUES ${updatePlaceholders.join(', ')}) AS v(contact_id, account_id)
            WHERE c.id = v.contact_id
          `;
          
          await client.query(updateQuery, updateValues);
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Error processing batch:', e);
      throw e;
    } finally {
      client.release();
    }
    
    processed += batch.length;
    
    // Safety break for testing (remove for full run)
    // if (processed >= 5000) break; 
  }

  console.log('\n=== Summary ===');
  console.log(`Total Processed: ${processed}`);
  console.log(`Linked to Existing: ${linked}`);
  console.log(`New Accounts Created: ${created}`);
  console.log(`Skipped (Generic/Invalid): ${skipped}`);
  
  process.exit(0);
}

function formatCompanyName(domain: string): string {
    // google.com -> Google
    // my-company.com -> My Company
    const namePart = domain.split('.')[0];
    return namePart
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

linkMissingAccounts().catch(console.error);
