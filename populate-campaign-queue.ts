/**
 * Script to populate campaign queue with missing contacts from the assigned list
 */
import { pool } from './server/db';

const CAMPAIGN_ID = 'ff475cfd-2af3-4821-8d91-c62535cde2b1';
const LIST_ID = '65ef1c92-2b65-44df-ae96-9297bb525577';
const BATCH_SIZE = 1000;

async function populateQueue() {
  console.log('=== Campaign Queue Population Script ===\n');
  
  // 1. Get contacts from list that are NOT already in queue
  console.log('Finding contacts to add...');
  const missingContactsResult = await pool.query(`
    WITH list_contacts AS (
      SELECT unnest(record_ids) as contact_id
      FROM lists WHERE id = $1
    )
    SELECT lc.contact_id
    FROM list_contacts lc
    WHERE NOT EXISTS (
      SELECT 1 FROM campaign_queue cq 
      WHERE cq.contact_id = lc.contact_id 
        AND cq.campaign_id = $2
    )
  `, [LIST_ID, CAMPAIGN_ID]);
  
  const missingContactIds = missingContactsResult.rows.map(r => r.contact_id);
  console.log(`Found ${missingContactIds.length} contacts to add to queue\n`);
  
  if (missingContactIds.length === 0) {
    console.log('No contacts to add - queue is already populated!');
    process.exit(0);
  }
  
  // 2. Get contact details (need account_id for queue)
  console.log('Fetching contact details...');
  let addedCount = 0;
  let skippedNoAccount = 0;
  let skippedNoPhone = 0;
  let errors = 0;
  
  for (let i = 0; i < missingContactIds.length; i += BATCH_SIZE) {
    const batch = missingContactIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(missingContactIds.length / BATCH_SIZE);
    
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} contacts)...`);
    
    // Get contact details
    const contactsResult = await pool.query(`
      SELECT id, account_id, direct_phone_e164, mobile_phone_e164
      FROM contacts
      WHERE id = ANY($1)
    `, [batch]);
    
    const contacts = contactsResult.rows;
    
    // Filter contacts with account and phone
    const validContacts = contacts.filter(c => {
      if (!c.account_id) {
        skippedNoAccount++;
        return false;
      }
      if (!c.direct_phone_e164 && !c.mobile_phone_e164) {
        skippedNoPhone++;
        return false;
      }
      return true;
    });
    
    if (validContacts.length === 0) {
      continue;
    }
    
    // Bulk insert into campaign_queue
    const values = validContacts.map((c, idx) => {
      const baseIdx = idx * 4;
      return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, 'queued', 100, NOW(), NOW())`;
    }).join(', ');
    
    const params = validContacts.flatMap(c => [
      crypto.randomUUID(),
      CAMPAIGN_ID,
      c.id,
      c.account_id
    ]);
    
    try {
      await pool.query(`
        INSERT INTO campaign_queue (id, campaign_id, contact_id, account_id, status, priority, created_at, updated_at)
        VALUES ${values}
        ON CONFLICT (campaign_id, contact_id) DO NOTHING
      `, params);
      
      addedCount += validContacts.length;
    } catch (err: any) {
      console.error(`  Error inserting batch: ${err.message}`);
      errors++;
    }
    
    // Progress update every 10 batches
    if (batchNum % 10 === 0) {
      console.log(`  Progress: ${addedCount} added, ${skippedNoAccount} skipped (no account), ${skippedNoPhone} skipped (no phone)`);
    }
  }
  
  console.log('\n=== Results ===');
  console.log(`Added to queue: ${addedCount}`);
  console.log(`Skipped (no account): ${skippedNoAccount}`);
  console.log(`Skipped (no phone): ${skippedNoPhone}`);
  console.log(`Errors: ${errors}`);
  
  // Final queue count
  const finalCount = await pool.query(`
    SELECT count(*) as total,
           count(*) FILTER (WHERE status = 'queued') as queued
    FROM campaign_queue
    WHERE campaign_id = $1
  `, [CAMPAIGN_ID]);
  
  console.log(`\nFinal queue stats:`);
  console.log(`  Total in queue: ${finalCount.rows[0].total}`);
  console.log(`  Status 'queued': ${finalCount.rows[0].queued}`);
  
  process.exit(0);
}

populateQueue().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
