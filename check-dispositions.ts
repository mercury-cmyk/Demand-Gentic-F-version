import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkDispositions() {
  console.log('========================================');
  console.log('CALL DISPOSITION ANALYSIS');
  console.log('========================================\n');

  // Check recent campaign queue status (no disposition column in campaign_queue)
  const queueStats = await db.execute(sql`
    SELECT
      status,
      removed_reason,
      COUNT(*) as count
    FROM campaign_queue
    WHERE updated_at > NOW() - INTERVAL '7 days'
    GROUP BY status, removed_reason
    ORDER BY count DESC
  `);

  console.log('Campaign Queue Status (Last 7 Days):');
  console.log('------------------------------------');
  for (const row of queueStats.rows) {
    const r = row as any;
    console.log(`  status=${r.status || 'NULL'} / removed_reason=${r.removed_reason || 'NULL'}: ${r.count}`);
  }

  // Check dialer call attempts
  const callAttempts = await db.execute(sql`
    SELECT
      disposition,
      connected,
      voicemail_detected,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY disposition, connected, voicemail_detected
    ORDER BY count DESC
  `);

  console.log('\nDialer Call Attempts (Last 7 Days):');
  console.log('------------------------------------');
  if (callAttempts.rows.length === 0) {
    console.log('  NO CALL ATTEMPTS IN LAST 7 DAYS');
  } else {
    for (const row of callAttempts.rows) {
      const r = row as any;
      console.log(`  disposition=${r.disposition || 'NULL'}, connected=${r.connected}, voicemail=${r.voicemail_detected}: ${r.count}`);
    }
  }

  // Check if any leads were created
  const leads = await db.execute(sql`
    SELECT
      qa_status,
      source,
      COUNT(*) as count
    FROM leads
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY qa_status, source
    ORDER BY count DESC
    LIMIT 10
  `);

  console.log('\nLeads Created (Last 7 Days):');
  console.log('------------------------------------');
  if (leads.rows.length === 0) {
    console.log('  NO LEADS CREATED IN LAST 7 DAYS');
  } else {
    for (const row of leads.rows) {
      const r = row as any;
      console.log(`  qa_status=${r.qa_status || 'NULL'}, source=${r.source || 'NULL'}: ${r.count}`);
    }
  }

  // Check total call attempts today
  const todayCalls = await db.execute(sql`
    SELECT COUNT(*) as total
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '1 day'
  `);

  console.log('\nTotal Calls Today:', (todayCalls.rows[0] as any)?.total || 0);

  // Check recent call attempts with details
  const recentCalls = await db.execute(sql`
    SELECT
      id,
      disposition,
      connected,
      voicemail_detected,
      call_duration_seconds,
      created_at
    FROM dialer_call_attempts
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('\nMost Recent 10 Call Attempts:');
  console.log('------------------------------------');
  if (recentCalls.rows.length === 0) {
    console.log('  NO CALL ATTEMPTS FOUND');
  } else {
    for (const row of recentCalls.rows) {
      const r = row as any;
      const date = r.created_at ? new Date(r.created_at).toISOString() : 'N/A';
      console.log(`  ${date} | disposition=${r.disposition || 'NULL'} | connected=${r.connected} | voicemail=${r.voicemail_detected} | duration=${r.call_duration_seconds || 0}s`);
    }
  }

  // Check campaign queue summary
  const queueSummary = await db.execute(sql`
    SELECT
      c.name as campaign_name,
      cq.status,
      cq.removed_reason,
      COUNT(*) as count
    FROM campaign_queue cq
    JOIN campaigns c ON c.id = cq.campaign_id
    WHERE cq.updated_at > NOW() - INTERVAL '7 days'
    GROUP BY c.name, cq.status, cq.removed_reason
    ORDER BY c.name, count DESC
  `);

  console.log('\nCampaign Queue By Campaign (Last 7 Days):');
  console.log('------------------------------------');
  let currentCampaign = '';
  for (const row of queueSummary.rows) {
    const r = row as any;
    if (r.campaign_name !== currentCampaign) {
      currentCampaign = r.campaign_name;
      console.log(`\n  ${currentCampaign}:`);
    }
    console.log(`    status=${r.status || 'NULL'} / removed_reason=${r.removed_reason || 'NULL'}: ${r.count}`);
  }

  process.exit(0);
}

checkDispositions().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
