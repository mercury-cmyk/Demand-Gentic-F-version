import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkRecentCalls() {
  console.log('='.repeat(70));
  console.log('RECENT CALL ACTIVITY ANALYSIS');
  console.log('='.repeat(70));
  console.log();

  // 1. Recent dialer call attempts (last 24 hours)
  console.log('1. DIALER CALL ATTEMPTS (last 24 hours)');
  const callAttempts = await db.execute(sql`
    SELECT
      dca.id,
      dca.phone_dialed,
      dca.agent_type,
      dca.attempt_number,
      dca.disposition,
      dca.call_duration_seconds,
      dca.recording_url,
      dca.connected,
      dca.voicemail_detected,
      dca.telnyx_call_id,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.country,
      va.name as agent_name,
      va.provider as agent_provider
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON dca.contact_id = c.id
    LEFT JOIN virtual_agents va ON dca.virtual_agent_id = va.id
    WHERE dca.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY dca.created_at DESC
    LIMIT 20
  `);

  if (callAttempts.rows.length === 0) {
    console.log('   ❌ NO CALL ATTEMPTS IN LAST 24 HOURS');
  } else {
    console.log(`   Found ${callAttempts.rows.length} call attempts:\n`);
    for (const call of callAttempts.rows as any[]) {
      const time = new Date(call.created_at).toLocaleString();
      console.log(`   [${time}]`);
      console.log(`     Contact: ${call.first_name} ${call.last_name} (${call.country})`);
      console.log(`     Phone: ${call.phone_dialed}`);
      console.log(`     Agent: ${call.agent_name || 'N/A'} (${call.agent_provider || 'default'})`);
      console.log(`     Disposition: ${call.disposition || 'pending'}`);
      console.log(`     Duration: ${call.duration_seconds || 0}s`);
      if (call.error_message) {
        console.log(`     ❌ Error: ${call.error_message}`);
      }
      if (call.recording_url) {
        console.log(`     🎙️ Recording: ${call.recording_url.substring(0, 50)}...`);
      }
      console.log();
    }
  }

  // 2. Call disposition summary
  console.log('\n2. DISPOSITION SUMMARY (last 24 hours)');
  const dispositionSummary = await db.execute(sql`
    SELECT
      disposition,
      COUNT(*) as count,
      AVG(call_duration_seconds) as avg_duration
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY disposition
    ORDER BY count DESC
  `);

  if (dispositionSummary.rows.length === 0) {
    console.log('   No data');
  } else {
    for (const d of dispositionSummary.rows as any[]) {
      const avgDur = d.avg_duration ? Math.round(d.avg_duration) : 0;
      console.log(`   - ${d.disposition || 'null'}: ${d.count} calls (avg ${avgDur}s)`);
    }
  }

  // 3. Campaign queue in_progress items
  console.log('\n3. CURRENTLY IN_PROGRESS QUEUE ITEMS');
  const inProgress = await db.execute(sql`
    SELECT
      cq.id,
      cq.updated_at,
      cq.enqueued_reason,
      c.first_name,
      c.last_name,
      camp.name as campaign_name
    FROM campaign_queue cq
    JOIN contacts c ON cq.contact_id = c.id
    JOIN campaigns camp ON cq.campaign_id = camp.id
    WHERE cq.status = 'in_progress'
    ORDER BY cq.updated_at DESC
    LIMIT 10
  `);

  if (inProgress.rows.length === 0) {
    console.log('   ✅ No items currently in progress');
  } else {
    console.log(`   Found ${inProgress.rows.length} in-progress items:\n`);
    for (const item of inProgress.rows as any[]) {
      const updatedAt = new Date(item.updated_at);
      const ageMin = Math.round((Date.now() - updatedAt.getTime()) / 60000);
      console.log(`   - ${item.first_name} ${item.last_name}`);
      console.log(`     Campaign: ${item.campaign_name}`);
      console.log(`     Updated: ${ageMin} minutes ago`);
      if (item.enqueued_reason) {
        console.log(`     Reason: ${item.enqueued_reason.substring(0, 80)}...`);
      }
      console.log();
    }
  }

  // 4. Recent leads created
  console.log('\n4. RECENT LEADS CREATED (last 24 hours)');
  const recentLeads = await db.execute(sql`
    SELECT
      l.id,
      l.ai_qualification_status as qualification_status,
      l.created_at,
      c.first_name,
      c.last_name,
      camp.name as campaign_name
    FROM leads l
    JOIN contacts c ON l.contact_id = c.id
    JOIN campaigns camp ON l.campaign_id = camp.id
    WHERE l.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY l.created_at DESC
    LIMIT 10
  `);

  if (recentLeads.rows.length === 0) {
    console.log('   ❌ NO LEADS CREATED IN LAST 24 HOURS');
  } else {
    console.log(`   Found ${recentLeads.rows.length} leads:\n`);
    for (const lead of recentLeads.rows as any[]) {
      const time = new Date(lead.created_at).toLocaleString();
      console.log(`   - ${lead.first_name} ${lead.last_name}`);
      console.log(`     Status: ${lead.qualification_status}, Score: ${lead.ai_qualification_score || 'N/A'}`);
      console.log(`     Campaign: ${lead.campaign_name}`);
      console.log(`     Created: ${time}`);
      console.log();
    }
  }

  // 5. AI Orchestrator activity (check BullMQ via dialer_runs)
  console.log('\n5. ACTIVE DIALER RUNS');
  const activeRuns = await db.execute(sql`
    SELECT
      dr.id,
      dr.run_type,
      dr.agent_type,
      dr.started_at,
      dr.max_concurrent_calls,
      camp.name as campaign_name,
      va.name as agent_name,
      va.provider as agent_provider
    FROM dialer_runs dr
    JOIN campaigns camp ON dr.campaign_id = camp.id
    LEFT JOIN virtual_agents va ON dr.virtual_agent_id = va.id
    WHERE dr.status = 'active'
    ORDER BY dr.started_at DESC
    LIMIT 10
  `);

  if (activeRuns.rows.length === 0) {
    console.log('   ❌ NO ACTIVE DIALER RUNS');
    console.log('   The AI Orchestrator may not be running or no campaigns are active.');
  } else {
    console.log(`   Found ${activeRuns.rows.length} active runs:\n`);
    for (const run of activeRuns.rows as any[]) {
      const started = new Date(run.started_at).toLocaleString();
      console.log(`   - Campaign: ${run.campaign_name}`);
      console.log(`     Agent: ${run.agent_name || 'N/A'} (${run.agent_provider || 'default'})`);
      console.log(`     Type: ${run.run_type}, Max Concurrent: ${run.max_concurrent_calls}`);
      console.log(`     Started: ${started}`);
      console.log();
    }
  }

  // 6. Check for errors in recent calls
  console.log('\n6. RECENT ERRORS');
  const errors = await db.execute(sql`
    SELECT
      error_message,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '24 hours'
      AND error_message IS NOT NULL
    GROUP BY error_message
    ORDER BY count DESC
    LIMIT 10
  `);

  if (errors.rows.length === 0) {
    console.log('   ✅ No errors found');
  } else {
    console.log('   Error breakdown:');
    for (const err of errors.rows as any[]) {
      console.log(`   - ${err.error_message}: ${err.count} occurrences`);
    }
  }

  // 7. Last 7 days summary
  console.log('\n7. LAST 7 DAYS SUMMARY');
  const weekSummary = await db.execute(sql`
    SELECT
      COUNT(*) as total_calls,
      COUNT(CASE WHEN disposition = 'voicemail' THEN 1 END) as voicemail_calls,
      COUNT(CASE WHEN disposition IN ('qualified_lead', 'interested', 'callback_requested') THEN 1 END) as positive_calls,
      COUNT(CASE WHEN disposition IN ('not_interested', 'do_not_call') THEN 1 END) as negative_calls,
      AVG(call_duration_seconds) as avg_duration
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '7 days'
  `);

  const ws = weekSummary.rows[0] as any;
  console.log(`   Total Calls: ${ws.total_calls}`);
  console.log(`   Voicemail: ${ws.voicemail_calls}`);
  console.log(`   Positive (qualified/interested/callback): ${ws.positive_calls}`);
  console.log(`   Negative (not interested/DNC): ${ws.negative_calls}`);
  console.log(`   Avg Duration: ${ws.avg_duration ? Math.round(ws.avg_duration) : 0}s`);

  console.log('\n' + '='.repeat(70));
  process.exit(0);
}

checkRecentCalls().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
