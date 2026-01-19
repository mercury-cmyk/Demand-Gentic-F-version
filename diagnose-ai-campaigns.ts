import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function diagnose() {
  console.log('=== AI CAMPAIGN DIAGNOSTICS ===\n');

  // 1. Check active campaigns with ai_agent dial mode
  const campaigns = await db.execute(sql`
    SELECT id, name, status, dial_mode, voice_provider, created_at
    FROM campaigns
    WHERE dial_mode = 'ai_agent' AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 5
  `);

  console.log('1. ACTIVE AI_AGENT CAMPAIGNS:');
  if (campaigns.rows.length === 0) {
    console.log('   ❌ NO ACTIVE AI_AGENT CAMPAIGNS FOUND!');
    console.log('   This is likely the problem - no campaigns are set to active with ai_agent mode.\n');
  } else {
    for (const c of campaigns.rows as any[]) {
      console.log(`   - ${c.name} (id: ${c.id})`);
      console.log(`     status: ${c.status}, mode: ${c.dial_mode}, voice: ${c.voice_provider || 'default (google)'}`);
    }
  }

  // 2. Check campaign_agent_assignments
  const agentAssignments = await db.execute(sql`
    SELECT caa.campaign_id, caa.virtual_agent_id, va.name as agent_name, c.name as campaign_name
    FROM campaign_agent_assignments caa
    JOIN virtual_agents va ON caa.virtual_agent_id = va.id
    JOIN campaigns c ON caa.campaign_id = c.id
    WHERE c.dial_mode = 'ai_agent'
    LIMIT 10
  `);

  console.log('\n2. CAMPAIGN-AGENT ASSIGNMENTS:');
  if (agentAssignments.rows.length === 0) {
    console.log('   ❌ NO AGENT ASSIGNMENTS FOUND!');
  } else {
    for (const a of agentAssignments.rows as any[]) {
      console.log(`   - Campaign "${a.campaign_name}" -> Agent "${a.agent_name}"`);
    }
  }

  // 3. Check queue items for first campaign
  if (campaigns.rows.length > 0) {
    const firstCampaign = (campaigns.rows as any[])[0];
    const queueStats = await db.execute(sql`
      SELECT status, COUNT(*) as count
      FROM campaign_queue
      WHERE campaign_id = ${firstCampaign.id}
      GROUP BY status
      ORDER BY status
    `);

    console.log(`\n3. QUEUE STATS FOR "${firstCampaign.name}":`);
    if (queueStats.rows.length === 0) {
      console.log('   ❌ NO QUEUE ITEMS FOUND!');
    } else {
      for (const q of queueStats.rows as any[]) {
        console.log(`   - ${q.status}: ${q.count}`);
      }
    }

    // Check sample queued contacts
    const queuedContacts = await db.execute(sql`
      SELECT cq.id, cq.status, c.first_name, c.last_name, c.country, c.mobile_phone, c.direct_phone
      FROM campaign_queue cq
      JOIN contacts c ON cq.contact_id = c.id
      WHERE cq.campaign_id = ${firstCampaign.id}
      AND cq.status = 'queued'
      LIMIT 5
    `);

    console.log(`\n4. SAMPLE QUEUED CONTACTS (${firstCampaign.name}):`);
    if (queuedContacts.rows.length === 0) {
      console.log('   ❌ NO QUEUED CONTACTS!');
    } else {
      for (const c of queuedContacts.rows as any[]) {
        const hasPhone = c.mobile_phone || c.direct_phone;
        console.log(`   - ${c.first_name} ${c.last_name}, Country: ${c.country || 'NULL'}, Phone: ${hasPhone ? '✅' : '❌ MISSING'}`);
      }
    }

    // Check in_progress items
    const inProgressItems = await db.execute(sql`
      SELECT cq.id, cq.status, cq.updated_at, c.first_name, c.last_name
      FROM campaign_queue cq
      JOIN contacts c ON cq.contact_id = c.id
      WHERE cq.campaign_id = ${firstCampaign.id}
      AND cq.status = 'in_progress'
      LIMIT 10
    `);

    console.log(`\n4b. IN_PROGRESS ITEMS (${firstCampaign.name}):`);
    if (inProgressItems.rows.length === 0) {
      console.log('   ✅ No items in progress');
    } else {
      for (const item of inProgressItems.rows as any[]) {
        const updatedAt = new Date(item.updated_at);
        const ageMin = Math.round((Date.now() - updatedAt.getTime()) / 60000);
        console.log(`   - ${item.first_name} ${item.last_name}, updated: ${ageMin} minutes ago`);
      }
    }
  }

  // 5. Check virtual agents
  const agents = await db.execute(sql`
    SELECT id, name, provider, is_active
    FROM virtual_agents
    ORDER BY created_at DESC
    LIMIT 5
  `);

  console.log('\n5. VIRTUAL AGENTS:');
  for (const a of agents.rows as any[]) {
    console.log(`   - ${a.name}: provider=${a.provider || 'default'}, active=${a.is_active}`);
  }

  // 6. Check recent call attempts
  const recentCalls = await db.execute(sql`
    SELECT
      id, campaign_id, status, disposition, started_at, ended_at, error_message, created_at
    FROM dialer_call_attempts
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('\n6. RECENT CALL ATTEMPTS (last 10):');
  if (recentCalls.rows.length === 0) {
    console.log('   ❌ NO CALL ATTEMPTS FOUND!');
    console.log('   This means the orchestrator is NOT initiating calls.');
  } else {
    for (const call of recentCalls.rows as any[]) {
      const date = new Date(call.created_at).toLocaleString();
      console.log(`   - [${date}] Status: ${call.status}, Disposition: ${call.disposition || 'N/A'}`);
      if (call.error_message) {
        console.log(`     Error: ${call.error_message}`);
      }
    }
  }

  // 7. Check dialer runs
  const runs = await db.execute(sql`
    SELECT id, campaign_id, status, run_type, agent_type, started_at, ended_at, created_at
    FROM dialer_runs
    ORDER BY created_at DESC
    LIMIT 5
  `);

  console.log('\n7. DIALER RUNS:');
  if (runs.rows.length === 0) {
    console.log('   ❌ NO DIALER RUNS FOUND!');
  } else {
    for (const run of runs.rows as any[]) {
      const date = new Date(run.created_at).toLocaleString();
      console.log(`   - [${date}] Status: ${run.status}, Type: ${run.run_type}, Agent: ${run.agent_type}`);
    }
  }

  // 8. Check environment variables for voice providers
  console.log('\n8. ENVIRONMENT CHECK:');
  console.log(`   GOOGLE_CLOUD_PROJECT: ${process.env.GOOGLE_CLOUD_PROJECT ? '✅ Set (' + process.env.GOOGLE_CLOUD_PROJECT + ')' : '❌ NOT SET'}`);
  console.log(`   GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? '✅ Set' : '❌ NOT SET'}`);
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ NOT SET'}`);
  console.log(`   TELNYX_API_KEY: ${process.env.TELNYX_API_KEY ? '✅ Set' : '❌ NOT SET'}`);
  console.log(`   TELNYX_TEXML_APP_ID: ${process.env.TELNYX_TEXML_APP_ID ? '✅ Set' : '❌ NOT SET'}`);
  console.log(`   PUBLIC_WEBSOCKET_URL: ${process.env.PUBLIC_WEBSOCKET_URL || '❌ NOT SET'}`);
  console.log(`   REDIS_URL: ${process.env.REDIS_URL || process.env.REDIS_URL_DEV ? '✅ Set' : '❌ NOT SET - AI ORCHESTRATOR NEEDS REDIS!'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

  // 9. Check business hours
  const now = new Date();
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
  const hour = now.getHours();
  console.log(`\n9. CURRENT TIME: ${now.toISOString()}`);
  console.log(`   Local: ${now.toLocaleString()}`);
  console.log(`   Day: ${dayOfWeek}, Hour: ${hour}`);

  // Check if it's likely outside UK business hours
  const ukTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const ukHour = ukTime.getHours();
  const ukDay = ukTime.getDay();
  console.log(`   UK Time: ${ukTime.toLocaleString()}, Hour: ${ukHour}`);
  if (ukDay === 0 || ukDay === 6 || ukHour < 9 || ukHour >= 18) {
    console.log(`   ⚠️  OUTSIDE UK BUSINESS HOURS (Mon-Fri 9-18) - calls may be blocked!`);
  } else {
    console.log(`   ✅ Within UK business hours`);
  }

  // 10. Check for stuck "in_progress" items
  const stuckItems = await db.execute(sql`
    SELECT cq.id, cq.status, cq.updated_at, c.first_name, c.last_name
    FROM campaign_queue cq
    JOIN contacts c ON cq.contact_id = c.id
    WHERE cq.status = 'in_progress'
    AND cq.updated_at < NOW() - INTERVAL '10 minutes'
    LIMIT 10
  `);

  console.log('\n10. STUCK IN_PROGRESS ITEMS (older than 10 min):');
  if (stuckItems.rows.length === 0) {
    console.log('   ✅ No stuck items');
  } else {
    console.log(`   ⚠️  ${stuckItems.rows.length} stuck items found!`);
    for (const item of stuckItems.rows as any[]) {
      console.log(`   - ${item.first_name} ${item.last_name}, updated: ${item.updated_at}`);
    }
  }

  console.log('\n=== DIAGNOSIS SUMMARY ===');

  // Check Redis
  if (!process.env.REDIS_URL && !process.env.REDIS_URL_DEV) {
    console.log('❌ CRITICAL: Redis is NOT configured!');
    console.log('   The AI Campaign Orchestrator requires Redis/BullMQ to function.');
    console.log('   Set REDIS_URL or REDIS_URL_DEV environment variable.');
  }

  // Check queue status
  if (campaigns.rows.length > 0) {
    const firstCampaign = (campaigns.rows as any[])[0];
    const queued = await db.execute(sql`
      SELECT COUNT(*) as count FROM campaign_queue
      WHERE campaign_id = ${firstCampaign.id} AND status = 'queued'
    `);
    const queuedCount = (queued.rows[0] as any).count;
    if (parseInt(queuedCount) === 0) {
      console.log('❌ CRITICAL: No queued contacts to call!');
      console.log('   Add contacts to the campaign queue.');
    } else {
      console.log(`✅ ${queuedCount} contacts queued for calling`);
    }
  }

  process.exit(0);
}

diagnose().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
