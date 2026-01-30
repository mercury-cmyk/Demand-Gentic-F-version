import { db } from '../server/db';
import { callSessions, leads, campaigns } from '../shared/schema';
import { eq, sql, isNotNull, and } from 'drizzle-orm';

async function checkAiCalls() {
  console.log('=== AI Call Data Check ===\n');

  // Check call_sessions by agent type
  const sessionsByType = await db.execute(sql`
    SELECT agent_type, COUNT(*) as cnt
    FROM call_sessions
    GROUP BY agent_type
  `);
  console.log('Call sessions by agent type:');
  sessionsByType.rows.forEach((r: any) => console.log(`  ${r.agent_type}: ${r.cnt}`));

  // Check for AI dispositions
  const dispositions = await db.execute(sql`
    SELECT ai_disposition, COUNT(*) as cnt
    FROM call_sessions
    WHERE ai_disposition IS NOT NULL
    GROUP BY ai_disposition
    ORDER BY cnt DESC
  `);
  console.log('\nAI dispositions found:');
  if (dispositions.rows.length === 0) {
    console.log('  (none)');
  } else {
    dispositions.rows.forEach((r: any) => console.log(`  ${r.ai_disposition}: ${r.cnt}`));
  }

  // Check AI agent campaigns
  const aiCampaigns = await db.select({
    id: campaigns.id,
    name: campaigns.name,
    dialMode: campaigns.dialMode,
    status: campaigns.status
  }).from(campaigns).where(eq(campaigns.dialMode, 'ai_agent'));
  console.log(`\nAI agent campaigns: ${aiCampaigns.length}`);
  aiCampaigns.forEach(c => console.log(`  - ${c.name} (${c.status})`));

  // Check recent AI call sessions
  const recentAi = await db.execute(sql`
    SELECT id, status, ai_disposition, campaign_id, created_at
    FROM call_sessions
    WHERE agent_type = 'ai'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log(`\nRecent AI call sessions: ${recentAi.rows.length}`);
  recentAi.rows.forEach((r: any) => {
    console.log(`  ID: ${r.id.slice(0,8)}..., Status: ${r.status}, Disposition: ${r.ai_disposition || 'none'}`);
  });

  // Check leads with AI call data
  const aiLeads = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM leads
    WHERE notes LIKE '%[AI Agent Call]%'
       OR custom_fields->>'aiCallId' IS NOT NULL
  `);
  console.log(`\nLeads with AI call data: ${aiLeads.rows[0]?.cnt || 0}`);

  process.exit(0);
}

checkAiCalls().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
