import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function check() {
  // Get leads by campaign
  const result = await db.execute(sql`
    SELECT 
      c.name as campaign_name, 
      c.status, 
      COUNT(l.id) as lead_count 
    FROM leads l 
    LEFT JOIN campaigns c ON l.campaign_id = c.id 
    GROUP BY c.id, c.name, c.status 
    ORDER BY lead_count DESC
  `);
  
  console.log('\nLeads by Campaign:');
  console.log('='.repeat(80));
  result.rows.forEach((r: any) => {
    console.log(`- ${r.campaign_name || 'Unknown'} | ${r.status} | Leads: ${r.lead_count}`);
  });
  
  // Total leads
  const total = await db.execute(sql`SELECT COUNT(*) as count FROM leads`);
  console.log('\nTotal leads in system:', (total.rows[0] as any).count);
  
  // Active campaigns queue status
  const activeCampaigns = await db.execute(sql`
    SELECT 
      c.name, 
      (SELECT COUNT(*) FROM campaign_queue cq WHERE cq.campaign_id = c.id AND cq.status = 'queued') as queued,
      (SELECT COUNT(*) FROM campaign_queue cq WHERE cq.campaign_id = c.id) as total_queue
    FROM campaigns c 
    WHERE c.status = 'active' 
    ORDER BY c.name
  `);
  
  console.log('\nActive Campaigns Queue Status:');
  console.log('='.repeat(80));
  activeCampaigns.rows.forEach((c: any) => {
    console.log(`- ${c.name}: ${c.queued}/${c.total_queue} queued`);
  });
  
  // Check for "today" leads - leads created today
  const todayLeads = await db.execute(sql`
    SELECT 
      c.name as campaign_name,
      COUNT(l.id) as today_count
    FROM leads l
    LEFT JOIN campaigns c ON l.campaign_id = c.id
    WHERE l.created_at >= CURRENT_DATE
    GROUP BY c.id, c.name
    ORDER BY today_count DESC
  `);
  
  console.log('\nLeads Created Today:');
  console.log('='.repeat(80));
  if (todayLeads.rows.length === 0) {
    console.log('No leads created today');
  } else {
    todayLeads.rows.forEach((r: any) => {
      console.log(`- ${r.campaign_name || 'Unknown'}: ${r.today_count} leads`);
    });
  }
  
  process.exit(0);
}

check();
