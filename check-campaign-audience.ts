import { pool } from './server/db';

const CAMPAIGN_ID = '6028f34d-1864-4cff-a910-7e059cb268b9';

async function check() {
  console.log('=== RingCentral FULFILLMENT - Audience Check ===\n');

  // Check campaign audience refs
  const campaign = await pool.query(
    'SELECT name, audience_refs FROM campaigns WHERE id = $1',
    [CAMPAIGN_ID]
  );
  console.log('Campaign:', campaign.rows[0]?.name);
  console.log('Audience refs:', JSON.stringify(campaign.rows[0]?.audience_refs, null, 2));

  // Check if there's an audience snapshot
  const snapshot = await pool.query(
    'SELECT id, array_length(contact_ids, 1) as contact_count, created_at FROM campaign_audience_snapshots WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 1',
    [CAMPAIGN_ID]
  );
  if (snapshot.rows[0]) {
    console.log('\nAudience snapshot:');
    console.log('  Contact count:', snapshot.rows[0].contact_count);
    console.log('  Created:', snapshot.rows[0].created_at);
  } else {
    console.log('\nAudience snapshot: None');
  }

  // Check lists referenced
  const audienceRefs = campaign.rows[0]?.audience_refs;
  const listIds = audienceRefs?.lists || audienceRefs?.selectedLists || [];

  if (listIds.length > 0) {
    console.log('\nLists referenced:');
    for (const listId of listIds) {
      const list = await pool.query(
        'SELECT name, array_length(record_ids, 1) as contact_count FROM lists WHERE id = $1',
        [listId]
      );
      if (list.rows[0]) {
        console.log(`  - ${list.rows[0].name}: ${list.rows[0].contact_count || 0} contacts`);
      }
    }
  } else {
    console.log('\nNo lists directly referenced in audience_refs');

    // Check all lists to find the 15k one
    const allLists = await pool.query(`
      SELECT id, name, array_length(record_ids, 1) as contact_count
      FROM lists
      WHERE array_length(record_ids, 1) > 10000
      ORDER BY contact_count DESC
      LIMIT 10
    `);

    if (allLists.rows.length > 0) {
      console.log('\nLarge lists in system (>10k contacts):');
      for (const list of allLists.rows) {
        console.log(`  - ${list.name}: ${list.contact_count} contacts (ID: ${list.id})`);
      }
    }
  }

  // Current queue count
  const queue = await pool.query(
    'SELECT COUNT(*)::int as total FROM campaign_queue WHERE campaign_id = $1',
    [CAMPAIGN_ID]
  );
  console.log('\n=== Current Queue ===');
  console.log('Contacts in queue:', queue.rows[0]?.total);

  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
