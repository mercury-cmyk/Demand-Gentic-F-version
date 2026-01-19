import { db } from './server/db';
import { sql } from 'drizzle-orm';
import IORedis from 'ioredis';

async function fullDiagnosis() {
  console.log('='.repeat(70));
  console.log('FULL AI CALLING SYSTEM DIAGNOSIS');
  console.log('='.repeat(70));
  console.log();

  // 1. Database connectivity
  console.log('1. DATABASE CONNECTIVITY');
  try {
    const dbTest = await db.execute(sql`SELECT 1 as test`);
    console.log('   ✅ Database connection OK');
  } catch (err) {
    console.log('   ❌ DATABASE CONNECTION FAILED:', err);
    process.exit(1);
  }

  // 2. Redis connectivity
  console.log('\n2. REDIS CONNECTIVITY');
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_URL_DEV || 'redis://localhost:6379';
  console.log(`   URL: ${redisUrl}`);

  let redis: IORedis | null = null;
  try {
    redis = new IORedis(redisUrl, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1
    });
    await redis.ping();
    console.log('   ✅ Redis connection OK');

    // Check for orchestrator queue
    const keys = await redis.keys('bull:ai-campaign-orchestrator:*');
    console.log(`   BullMQ keys found: ${keys.length}`);
    if (keys.length > 0) {
      console.log('   ✅ AI Orchestrator queue exists in Redis');

      // Check for waiting/active jobs
      const waiting = await redis.llen('bull:ai-campaign-orchestrator:wait');
      const active = await redis.llen('bull:ai-campaign-orchestrator:active');
      const delayed = await redis.zcard('bull:ai-campaign-orchestrator:delayed');
      const completed = await redis.zcard('bull:ai-campaign-orchestrator:completed');
      console.log(`   Queue status: ${waiting} waiting, ${active} active, ${delayed} delayed, ${completed} completed`);
    } else {
      console.log('   ⚠️  No orchestrator queue found - is the server running?');
    }
  } catch (err: any) {
    console.log('   ❌ REDIS CONNECTION FAILED:', err.message);
    console.log('   The AI Orchestrator REQUIRES Redis to function!');
  }

  // 3. Active AI campaigns
  console.log('\n3. ACTIVE AI CAMPAIGNS');
  const campaigns = await db.execute(sql`
    SELECT id, name, status, dial_mode, voice_provider
    FROM campaigns
    WHERE dial_mode = 'ai_agent' AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 5
  `);

  if (campaigns.rows.length === 0) {
    console.log('   ❌ NO ACTIVE AI_AGENT CAMPAIGNS!');
    console.log('   Create a campaign with dial_mode=ai_agent and status=active');
  } else {
    for (const c of campaigns.rows as any[]) {
      console.log(`   - ${c.name}`);
      console.log(`     ID: ${c.id}`);
      console.log(`     Voice: ${c.voice_provider || 'default (google)'}`);
    }
  }

  // 4. Queue status per campaign
  console.log('\n4. QUEUE STATUS');
  for (const c of campaigns.rows as any[]) {
    const queueStats = await db.execute(sql`
      SELECT status, COUNT(*) as count
      FROM campaign_queue
      WHERE campaign_id = ${c.id}
      GROUP BY status
      ORDER BY status
    `);

    console.log(`   Campaign: ${c.name}`);
    let hasQueued = false;
    for (const q of queueStats.rows as any[]) {
      console.log(`     ${q.status}: ${q.count}`);
      if (q.status === 'queued' && parseInt(q.count) > 0) hasQueued = true;
    }
    if (!hasQueued) {
      console.log('     ⚠️  No queued contacts!');
    }
  }

  // 5. Virtual agents
  console.log('\n5. VIRTUAL AGENTS & ASSIGNMENTS');
  const agents = await db.execute(sql`
    SELECT va.id, va.name, va.provider, va.is_active,
           caa.campaign_id
    FROM virtual_agents va
    LEFT JOIN campaign_agent_assignments caa ON va.id = caa.virtual_agent_id
    WHERE va.is_active = true
    ORDER BY va.name
  `);

  const agentMap = new Map<string, any>();
  for (const a of agents.rows as any[]) {
    if (!agentMap.has(a.id)) {
      agentMap.set(a.id, { ...a, campaigns: [] });
    }
    if (a.campaign_id) {
      agentMap.get(a.id).campaigns.push(a.campaign_id);
    }
  }

  for (const agent of agentMap.values()) {
    console.log(`   - ${agent.name}: provider=${agent.provider || 'default'}`);
    console.log(`     Assigned to ${agent.campaigns.length} campaign(s)`);
  }

  // 6. Environment variables
  console.log('\n6. ENVIRONMENT VARIABLES');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   TELNYX_API_KEY: ${process.env.TELNYX_API_KEY ? '✅ Set' : '❌ NOT SET'}`);
  console.log(`   TELNYX_TEXML_APP_ID: ${process.env.TELNYX_TEXML_APP_ID ? '✅ Set' : '❌ NOT SET'}`);
  console.log(`   TELNYX_FROM_NUMBER: ${process.env.TELNYX_FROM_NUMBER || '❌ NOT SET'}`);
  console.log(`   PUBLIC_WEBSOCKET_URL: ${process.env.PUBLIC_WEBSOCKET_URL || '❌ NOT SET'}`);
  console.log(`   GOOGLE_CLOUD_PROJECT: ${process.env.GOOGLE_CLOUD_PROJECT || '❌ NOT SET'}`);
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ NOT SET'}`);

  // 7. Recent call attempts
  console.log('\n7. RECENT CALL ATTEMPTS (last 24 hours)');
  const recentCalls = await db.execute(sql`
    SELECT status, disposition, COUNT(*) as count
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY status, disposition
    ORDER BY count DESC
    LIMIT 10
  `);

  if (recentCalls.rows.length === 0) {
    console.log('   ❌ NO CALL ATTEMPTS IN LAST 24 HOURS!');
    console.log('   This means calls are NOT being initiated.');
  } else {
    for (const call of recentCalls.rows as any[]) {
      console.log(`   - ${call.status}/${call.disposition || 'N/A'}: ${call.count}`);
    }
  }

  // 8. Business hours check
  console.log('\n8. BUSINESS HOURS CHECK');
  const now = new Date();
  const zones = ['America/New_York', 'America/Los_Angeles', 'Europe/London'];
  for (const tz of zones) {
    const localTime = now.toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const hour = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
    const day = now.toLocaleString('en-US', { timeZone: tz, weekday: 'short' });
    const isWorkingDay = !['Sat', 'Sun'].includes(day);
    const isWorkingHour = hour >= 9 && hour < 17;
    const canCall = isWorkingDay && isWorkingHour;
    console.log(`   ${tz}: ${localTime} - ${canCall ? '✅ Can call' : '❌ Outside hours'}`);
  }

  // 9. Summary
  console.log('\n' + '='.repeat(70));
  console.log('DIAGNOSIS SUMMARY');
  console.log('='.repeat(70));

  const issues: string[] = [];

  if (campaigns.rows.length === 0) {
    issues.push('No active AI_AGENT campaigns');
  }

  if (redis) {
    const keys = await redis.keys('bull:ai-campaign-orchestrator:*');
    if (keys.length === 0) {
      issues.push('AI Orchestrator queue not found in Redis - server may not be running');
    }
    await redis.quit();
  } else {
    issues.push('Redis not connected - orchestrator cannot function');
  }

  if (!process.env.TELNYX_FROM_NUMBER) {
    issues.push('TELNYX_FROM_NUMBER not set - calls cannot be initiated');
  }

  if (!process.env.PUBLIC_WEBSOCKET_URL) {
    issues.push('PUBLIC_WEBSOCKET_URL not set - calls may fail');
  }

  if (issues.length === 0) {
    console.log('\n✅ No critical issues found!');
    console.log('\nIf calls are still not happening, check:');
    console.log('  1. Server logs for orchestrator output');
    console.log('  2. Telnyx dashboard for call errors');
    console.log('  3. Google Cloud logs for Gemini errors');
  } else {
    console.log('\n❌ ISSUES FOUND:');
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }

  process.exit(0);
}

fullDiagnosis().catch(err => {
  console.error('Diagnosis error:', err);
  process.exit(1);
});
