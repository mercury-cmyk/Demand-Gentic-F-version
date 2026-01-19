
import { pool } from './server/db';

async function checkCampaign() {
  const campaignNamePattern = '%Pivotal B2B%';
  
  console.log(`Searching for campaign matching: ${campaignNamePattern}`);
  
  const campaignRes = await pool.query(`
    SELECT id, name, audience_refs 
    FROM campaigns 
    WHERE name ILIKE $1
  `, [campaignNamePattern]);

  if (campaignRes.rows.length === 0) {
    console.log("No campaign found.");
    process.exit(1);
  }

  const campaign = campaignRes.rows[0];
  console.log(`Found Campaign: ${campaign.name} (ID: ${campaign.id})`);
  console.log(`Audience Refs: ${JSON.stringify(campaign.audience_refs)}`);

  const audience = campaign.audience_refs || {};
  let listIds: string[] = [];

  // Check known structures
  if (audience.lists && Array.isArray(audience.lists)) {
      listIds = audience.lists;
  } else if (audience.included && Array.isArray(audience.included)) {
       // specific structure check
       listIds = audience.included;
  }
  
  if (listIds.length === 0) {
     // Just try to grab any array that looks like UUIDs if structure is unknown
     // But let's look at `populate-campaign-queue.ts` again, it had a hardcoded LIST_ID. 
     // Maybe the campaign is supposed to have it.
     
     // Let's assume the user wants the list that IS present in audience_refs.
  }

  if (listIds.length === 0) {
      console.log("Could not determine list IDs from audienceRefs.");
      process.exit(0);
  }
  
  console.log(`Found List IDs: ${listIds.join(', ')}`);

  // Check list details (taking the first one for now)
  const listId = listIds[0];
  const listRes = await pool.query(`SELECT id, name, record_ids FROM lists WHERE id = $1`, [listId]);
  if (listRes.rows.length === 0) {
      console.log("List not found in database.");
      process.exit(0);
  }
  const list = listRes.rows[0];
  const contactIds: string[] = list.record_ids || [];
  console.log(`List '${list.name}' has ${contactIds.length} contacts.`);

  if (contactIds.length === 0) return;

  // Check if missing account contacts can be matched by email domain
  console.log(`\nChecking if missing account contacts can be matched by domain...`);
  
  // Sample 100 contacts without account
  const sampleMissing = await pool.query(`
    SELECT email 
    FROM contacts 
    WHERE id = ANY($1) AND account_id IS NULL AND email IS NOT NULL
    LIMIT 100
  `, [contactIds]);
  
  if (sampleMissing.rows.length > 0) {
      let matchable = 0;
      for (const row of sampleMissing.rows) {
          const email = row.email;
          const domain = email.split('@')[1];
          if (!domain) continue;

          // Check if account exists with this website/domain
          // Usually Accounts table has 'website' or 'domain'
          // Let's assume 'website' first, checking simple substring or exact match on clean domain
          
          const accRes = await pool.query(`
             SELECT id FROM accounts 
             WHERE website ILIKE $1 OR website ILIKE $2
             LIMIT 1
          `, [`%${domain}%`, `www.${domain}`]);
          
          if (accRes.rows.length > 0) {
              matchable++;
          }
      }
      console.log(`Out of sample ${sampleMissing.rows.length}, potentially mapable to existing accounts: ${matchable}`);
  }
  
  process.exit(0);

  process.exit(0);
}

checkCampaign().catch(console.error);
