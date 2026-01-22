import { pool } from './server/db';

const CAMPAIGN_ID = '6028f34d-1864-4cff-a910-7e059cb268b9';

async function activateCampaign() {
  console.log('Activating RingCentral FULFILLMENT campaign...\n');

  // Activate the campaign
  const result = await pool.query(
    `UPDATE campaigns SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING id, name, status`,
    [CAMPAIGN_ID]
  );

  if (result.rows.length > 0) {
    console.log('Campaign activated:');
    console.log(`  Name: ${result.rows[0].name}`);
    console.log(`  Status: ${result.rows[0].status}`);

    // Check queue status
    const queueResult = await pool.query(
      `SELECT status, COUNT(*)::int as count FROM campaign_queue WHERE campaign_id = $1 GROUP BY status`,
      [CAMPAIGN_ID]
    );
    console.log('\nQueue status:');
    for (const row of queueResult.rows) {
      console.log(`  ${row.status}: ${row.count}`);
    }

    // Check virtual agent assignment
    const agentResult = await pool.query(`
      SELECT va.name as agent_name, caa.is_active
      FROM campaign_agent_assignments caa
      JOIN virtual_agents va ON va.id = caa.virtual_agent_id
      WHERE caa.campaign_id = $1 AND caa.agent_type = 'ai'
    `, [CAMPAIGN_ID]);

    console.log('\nVirtual agents:');
    for (const row of agentResult.rows) {
      console.log(`  ${row.agent_name} (active: ${row.is_active})`);
    }

    console.log('\n✓ Campaign is now ACTIVE and ready to make calls!');
  } else {
    console.log('Campaign not found');
  }

  process.exit(0);
}

activateCampaign().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
