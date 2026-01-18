import { pool } from './server/db';

async function analyzeInvalidDataDispositions() {
  console.log('\n🔍 Analyzing Invalid Data Dispositions for Potential Qualified Leads\n');
  console.log('='.repeat(80));

  // Find invalid_data calls with meaningful duration (potential misclassified qualified leads)
  const potentialLeads = await pool.query(`
    SELECT
      dca.id,
      dca.call_started_at,
      dca.call_ended_at,
      dca.call_duration_seconds as duration_seconds,
      dca.connected,
      dca.voicemail_detected,
      dca.disposition,
      dca.notes,
      dca.recording_url,
      c.name as campaign_name,
      dca.contact_id,
      ct.first_name,
      ct.last_name,
      ct.job_title,
      a.name as company_name
    FROM dialer_call_attempts dca
    JOIN campaigns c ON dca.campaign_id = c.id
    LEFT JOIN contacts ct ON dca.contact_id = ct.id
    LEFT JOIN accounts a ON ct.account_id = a.id
    WHERE dca.disposition = 'invalid_data'
      AND dca.connected = true
      AND dca.call_ended_at IS NOT NULL
      AND dca.call_duration_seconds > 30
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 50
  `);

  console.log(`\n📊 Found ${potentialLeads.rows.length} invalid_data calls with 30+ seconds duration AND connected=true\n`);
  console.log('These are likely MISCLASSIFIED and could be qualified leads:\n');

  if (potentialLeads.rows.length === 0) {
    console.log('  No calls matching criteria found.\n');
  } else {
    for (const row of potentialLeads.rows) {
      const duration = Math.round(row.duration_seconds || 0);
      const contactName = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown';

      console.log(`─`.repeat(80));
      console.log(`📞 Call ID: ${row.id}`);
      console.log(`   Contact: ${contactName} | ${row.job_title || 'N/A'} @ ${row.company_name || 'N/A'}`);
      console.log(`   Campaign: ${row.campaign_name}`);
      console.log(`   Duration: ${duration}s | Connected: ${row.connected} | Voicemail: ${row.voicemail_detected}`);
      console.log(`   Date: ${row.call_started_at}`);
      if (row.notes) {
        console.log(`   Notes: ${row.notes.substring(0, 100)}${row.notes.length > 100 ? '...' : ''}`);
      }
      if (row.recording_url) {
        console.log(`   Recording: ${row.recording_url}`);
      }
      console.log('');
    }
  }

  // Summary statistics
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total_invalid_data,
      COUNT(*) FILTER (WHERE connected = true) as connected_count,
      COUNT(*) FILTER (WHERE connected = true AND call_duration_seconds > 30) as long_connected_calls,
      COUNT(*) FILTER (WHERE connected = true AND call_duration_seconds > 60) as very_long_calls,
      COUNT(*) FILTER (WHERE connected = true AND call_duration_seconds > 120) as extended_calls,
      AVG(call_duration_seconds) FILTER (WHERE connected = true) as avg_duration_connected
    FROM dialer_call_attempts
    WHERE disposition = 'invalid_data'
  `);

  const s = stats.rows[0];
  console.log('\n' + '='.repeat(80));
  console.log('📈 INVALID_DATA DISPOSITION STATISTICS:\n');
  console.log(`   Total invalid_data calls: ${s.total_invalid_data}`);
  console.log(`   Connected (human answered): ${s.connected_count} (${Math.round(s.connected_count / s.total_invalid_data * 100)}%)`);
  console.log(`   Connected + 30+ seconds: ${s.long_connected_calls} ⚠️  POTENTIAL LEADS`);
  console.log(`   Connected + 60+ seconds: ${s.very_long_calls} ⚠️  LIKELY QUALIFIED`);
  console.log(`   Connected + 120+ seconds: ${s.extended_calls} 🔥 HIGH PRIORITY`);
  console.log(`   Avg duration (connected): ${Math.round(s.avg_duration_connected || 0)}s`);

  // Check for notes data in invalid_data calls
  const withNotes = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE notes IS NOT NULL AND notes != '') as has_notes
    FROM dialer_call_attempts
    WHERE disposition = 'invalid_data'
      AND connected = true
  `);

  const a = withNotes.rows[0];
  console.log(`\n   With notes: ${a.has_notes}/${a.total}`);

  // Breakdown by campaign
  const byCampaign = await pool.query(`
    SELECT
      c.name as campaign_name,
      COUNT(*) as invalid_data_count,
      COUNT(*) FILTER (WHERE dca.connected = true AND dca.call_duration_seconds > 30) as potential_leads
    FROM dialer_call_attempts dca
    JOIN campaigns c ON dca.campaign_id = c.id
    WHERE dca.disposition = 'invalid_data'
    GROUP BY c.name
    ORDER BY potential_leads DESC
  `);

  console.log('\n\n📋 BREAKDOWN BY CAMPAIGN:\n');
  console.log('Campaign'.padEnd(50) + 'Invalid Data'.padEnd(15) + 'Potential Leads');
  console.log('─'.repeat(80));
  for (const row of byCampaign.rows) {
    console.log(`${row.campaign_name.substring(0, 48).padEnd(50)}${String(row.invalid_data_count).padEnd(15)}${row.potential_leads}`);
  }

  console.log('\n\n💡 RECOMMENDATION:');
  console.log('─'.repeat(80));
  console.log(`   ${s.long_connected_calls} calls marked as "invalid_data" had 30+ second conversations.`);
  console.log('   These should be reviewed and potentially reclassified as qualified_lead or not_interested.');
  console.log('   Consider adding a safeguard to prevent marking connected calls >30s as invalid_data.\n');

  process.exit(0);
}

analyzeInvalidDataDispositions().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
