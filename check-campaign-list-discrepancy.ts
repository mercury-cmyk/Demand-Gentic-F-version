import { db, pool } from './server/db';

async function main() {
  // Get campaign details
  const campaignResult = await pool.query(`
    SELECT id, name, audience_refs,
           (SELECT COUNT(*) FROM campaign_queue WHERE campaign_id = campaigns.id) as queue_count
    FROM campaigns 
    WHERE name LIKE '%Waterfall%'
    LIMIT 1
  `);
  const campaign = campaignResult.rows[0];
  console.log('Campaign:', campaign?.name);
  console.log('Queue count:', campaign?.queue_count);
  console.log('Audience refs:', JSON.stringify(campaign?.audience_refs, null, 2));
  
  const audienceRefs = campaign?.audience_refs;
  const listIds = audienceRefs?.lists || audienceRefs?.listIds || [];
  
  if (listIds.length > 0) {
    for (const listId of listIds) {
      // Get list details - lists use record_ids array
      const listResult = await pool.query(`
        SELECT id, name, entity_type, 
               array_length(record_ids, 1) as record_count,
               source_type
        FROM lists
        WHERE id = $1
      `, [listId]);
      console.log('\nList:', listResult.rows[0]);
      
      const recordCount = listResult.rows[0]?.record_count;
      
      if (recordCount > 0) {
        // Check phone stats for contacts in the list
        const phoneResult = await pool.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(c.mobile_phone_e164) as has_mobile,
            COUNT(c.direct_phone_e164) as has_direct,
            COUNT(CASE WHEN c.mobile_phone_e164 IS NOT NULL OR c.direct_phone_e164 IS NOT NULL THEN 1 END) as has_any_phone
          FROM lists l
          CROSS JOIN LATERAL unnest(l.record_ids) AS rid
          JOIN contacts c ON c.id = rid
          WHERE l.id = $1
        `, [listId]);
        console.log('Phone stats from list:', phoneResult.rows[0]);
        
        // Count with accountId
        const accountResult = await pool.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(c.account_id) as has_account
          FROM lists l
          CROSS JOIN LATERAL unnest(l.record_ids) AS rid
          JOIN contacts c ON c.id = rid
          WHERE l.id = $1
        `, [listId]);
        console.log('Account ID stats:', accountResult.rows[0]);
        
        // Count with BOTH phone AND accountId
        const bothResult = await pool.query(`
          SELECT 
            COUNT(CASE WHEN c.account_id IS NOT NULL AND (c.mobile_phone_e164 IS NOT NULL OR c.direct_phone_e164 IS NOT NULL) THEN 1 END) as has_both
          FROM lists l
          CROSS JOIN LATERAL unnest(l.record_ids) AS rid
          JOIN contacts c ON c.id = rid
          WHERE l.id = $1
        `, [listId]);
        console.log('Has BOTH phone + account:', bothResult.rows[0]);
      }
    }
  } else {
    console.log('No lists found in audience_refs');
  }
    
  // Check queue breakdown
  const queueResult = await pool.query(`
    SELECT status, COUNT(*) as count
    FROM campaign_queue
    WHERE campaign_id = $1
    GROUP BY status
    ORDER BY count DESC
  `, [campaign.id]);
  console.log('\nQueue breakdown:');
  queueResult.rows.forEach((r: any) => console.log(`  ${r.status}: ${r.count}`));
  
  process.exit(0);;
  
  // Check campaign status
  const campaignDetails = await pool.query(`
    SELECT id, name, status, dial_mode, mode,
           created_at, updated_at
    FROM campaigns
    WHERE id = $1
  `, [campaign.id]);
  console.log('\nCampaign details:');
  const details = campaignDetails.rows[0];
  console.log('  Status:', details?.status);
  console.log('  Dial Mode:', details?.dial_mode);
  console.log('  Mode:', details?.mode);
  console.log('  Created:', details?.created_at);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
