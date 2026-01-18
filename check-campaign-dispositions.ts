import { pool } from './server/db';

async function checkCampaignDispositions() {
  console.log('\n📊 Disposition Breakdown by Campaign:\n');

  // Get disposition breakdown for all campaigns
  const result = await pool.query(`
    SELECT
      c.name as campaign_name,
      dca.disposition,
      COUNT(*) as count
    FROM dialer_call_attempts dca
    JOIN campaigns c ON dca.campaign_id = c.id
    WHERE dca.disposition IS NOT NULL
    GROUP BY c.name, dca.disposition
    ORDER BY c.name, count DESC
  `);

  console.log('Campaign | Disposition | Count');
  console.log('─'.repeat(60));

  let currentCampaign = '';
  for (const row of result.rows) {
    if (row.campaign_name !== currentCampaign) {
      currentCampaign = row.campaign_name;
      console.log(`\n🎯 ${currentCampaign}`);
    }
    console.log(`   ${String(row.disposition).padEnd(20)} : ${row.count}`);
  }

  // Get total invalid_data count
  const invalidData = await pool.query(`
    SELECT
      c.name as campaign_name,
      COUNT(*) as invalid_data_count
    FROM dialer_call_attempts dca
    JOIN campaigns c ON dca.campaign_id = c.id
    WHERE dca.disposition = 'invalid_data'
    GROUP BY c.name
    ORDER BY invalid_data_count DESC
  `);

  console.log('\n\n⚠️  Invalid Data Count by Campaign:\n');
  if (invalidData.rows.length === 0) {
    console.log('  No invalid_data dispositions found in dialer_call_attempts');
  } else {
    for (const row of invalidData.rows) {
      console.log(`  ${row.campaign_name}: ${row.invalid_data_count}`);
    }
  }

  // Check call_attempts table as well (for test calls and other sources)
  const callAttempts = await pool.query(`
    SELECT
      c.name as campaign_name,
      ca.disposition,
      COUNT(*) as count
    FROM call_attempts ca
    LEFT JOIN campaigns c ON ca.campaign_id = c.id
    WHERE ca.disposition IS NOT NULL
    GROUP BY c.name, ca.disposition
    ORDER BY c.name, count DESC
  `);

  console.log('\n\n📞 Call Attempts Table Breakdown:\n');
  if (callAttempts.rows.length === 0) {
    console.log('  No dispositions found in call_attempts table');
  } else {
    currentCampaign = '';
    for (const row of callAttempts.rows) {
      const campName = row.campaign_name || 'No Campaign';
      if (campName !== currentCampaign) {
        currentCampaign = campName;
        console.log(`\n🎯 ${currentCampaign}`);
      }
      console.log(`   ${String(row.disposition).padEnd(20)} : ${row.count}`);
    }
  }

  // Total summary
  const totalSummary = await pool.query(`
    SELECT disposition, COUNT(*) as count
    FROM (
      SELECT disposition FROM dialer_call_attempts WHERE disposition IS NOT NULL
      UNION ALL
      SELECT disposition FROM call_attempts WHERE disposition IS NOT NULL
    ) combined
    GROUP BY disposition
    ORDER BY count DESC
  `);

  console.log('\n\n📈 Overall Disposition Summary (All Tables):\n');
  for (const row of totalSummary.rows) {
    console.log(`  ${String(row.disposition).padEnd(20)} : ${row.count}`);
  }

  process.exit(0);
}

checkCampaignDispositions().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
