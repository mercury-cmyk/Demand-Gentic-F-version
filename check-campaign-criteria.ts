import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function check() {
  const campaigns = await db.execute(sql`
    SELECT
      id,
      name,
      success_criteria,
      campaign_objective,
      campaign_context_brief
    FROM campaigns
    WHERE dial_mode = 'ai_agent' AND status = 'active'
    LIMIT 3
  `);

  console.log('=== CAMPAIGN SUCCESS CRITERIA ===\n');
  for (const c of campaigns.rows as any[]) {
    console.log('---', c.name, '---');
    console.log('Success Criteria:', c.success_criteria || '❌ NOT SET');
    console.log('Objective:', c.campaign_objective || '❌ NOT SET');
    console.log('Context Brief:', c.campaign_context_brief ? c.campaign_context_brief.substring(0, 300) + '...' : '❌ NOT SET');
    console.log();
  }
  process.exit(0);
}
check().catch(console.error);
