import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function diagnose() {
  console.log('=== CAMPAIGN QUEUE PHONE DIAGNOSTICS ===\n');
  
  // Check both active campaigns
  const campaigns = await db.execute(sql`
    SELECT id, name, status, dial_mode
    FROM campaigns
    WHERE dial_mode = 'ai_agent' AND status = 'active'
  `);
  
  for (const camp of campaigns.rows as any[]) {
    console.log(`\n=== Campaign: ${camp.name} ===`);
    
    // Count queued items WITH and WITHOUT phones
    const queueStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_queued,
        COUNT(CASE WHEN c.mobile_phone_e164 IS NOT NULL OR c.direct_phone_e164 IS NOT NULL THEN 1 END) as with_phone,
        COUNT(CASE WHEN c.mobile_phone_e164 IS NULL AND c.direct_phone_e164 IS NULL THEN 1 END) as without_phone
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${camp.id}
      AND cq.status = 'queued'
    `);
    
    const stats = queueStats.rows[0] as any;
    console.log(`  Queued: ${stats.total_queued} total, ${stats.with_phone} with phone, ${stats.without_phone} WITHOUT PHONE`);
    
    // Check in_progress items (stuck)
    const stuckItems = await db.execute(sql`
      SELECT cq.id, c.first_name, c.last_name, cq.updated_at,
             EXTRACT(EPOCH FROM (NOW() - cq.updated_at))/60 as minutes_stuck
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${camp.id}
      AND cq.status = 'in_progress'
    `);
    
    if (stuckItems.rows.length > 0) {
      console.log(`  ⚠️  STUCK IN_PROGRESS ITEMS:`);
      for (const item of stuckItems.rows as any[]) {
        console.log(`    - ${item.first_name} ${item.last_name}: stuck for ${Math.round(item.minutes_stuck)} minutes (id: ${item.id})`);
      }
    } else {
      console.log(`  ✅ No stuck in_progress items`);
    }
    
    // Sample contacts with phones that SHOULD be callable
    const callableContacts = await db.execute(sql`
      SELECT c.first_name, c.last_name, c.country, 
             c.mobile_phone_e164, c.direct_phone_e164
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${camp.id}
      AND cq.status = 'queued'
      AND (c.mobile_phone_e164 IS NOT NULL OR c.direct_phone_e164 IS NOT NULL)
      LIMIT 5
    `);
    
    console.log(`  Sample callable contacts (with phones):`);
    if (callableContacts.rows.length === 0) {
      console.log(`    ❌ NONE - No queued contacts have phone numbers!`);
    }
    for (const c of callableContacts.rows as any[]) {
      console.log(`    - ${c.first_name} ${c.last_name}, Country: ${c.country}, Mobile: ${c.mobile_phone_e164 || 'N/A'}, Direct: ${c.direct_phone_e164 || 'N/A'}`);
    }
    
    // Check if contacts already called today
    const calledToday = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM call_sessions cs
      JOIN campaign_queue cq ON cq.contact_id = cs.contact_id
      WHERE cq.campaign_id = ${camp.id}
      AND cs.created_at >= CURRENT_DATE
      AND cs.agent_type = 'ai'
    `);
    console.log(`  Contacts called today: ${(calledToday.rows[0] as any).count}`);
  }
  
  console.log('\n=== BUSINESS HOURS CHECK ===');
  const ukTime = await db.execute(sql`SELECT NOW() AT TIME ZONE 'Europe/London' as uk_time`);
  console.log(`UK Time: ${(ukTime.rows[0] as any).uk_time}`);
  
  const usTime = await db.execute(sql`SELECT NOW() AT TIME ZONE 'America/New_York' as us_time`);
  console.log(`US Eastern Time: ${(usTime.rows[0] as any).us_time}`);
  
  // Check if orchestrator is processing
  console.log('\n=== RECENT CALL ATTEMPTS ===');
  const recentCalls = await db.execute(sql`
    SELECT 
      cs.created_at, 
      c.first_name, 
      c.last_name, 
      cs.status,
      camp.name as campaign_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    WHERE cs.agent_type = 'ai'
    ORDER BY cs.created_at DESC
    LIMIT 5
  `);
  
  if (recentCalls.rows.length === 0) {
    console.log('  ❌ No recent AI calls found!');
  } else {
    for (const call of recentCalls.rows as any[]) {
      console.log(`  - ${call.created_at}: ${call.first_name} ${call.last_name} (${call.campaign_name}) - ${call.status}`);
    }
  }
  
  process.exit(0);
}

diagnose().catch(e => { console.error(e); process.exit(1); });
