import { db } from './server/db';
import { callSessions, leads } from './shared/schema';
import { desc, sql, eq, isNotNull } from 'drizzle-orm';

async function check() {
  // Check disposition breakdown
  const dispStats = await db.execute(sql`
    SELECT ai_disposition, COUNT(*) as count 
    FROM call_sessions 
    WHERE ai_disposition IS NOT NULL 
    GROUP BY ai_disposition 
    ORDER BY count DESC
  `);
  console.log('=== Disposition breakdown ===');
  console.log(dispStats.rows);
  
  // Check lead qa_status breakdown
  const leadStats = await db.execute(sql`
    SELECT qa_status, COUNT(*) as count 
    FROM leads 
    GROUP BY qa_status 
    ORDER BY count DESC
  `);
  console.log('\n=== Lead qa_status breakdown ===');
  console.log(leadStats.rows);
  
  // Check recent qualified calls
  const recentQualified = await db.execute(sql`
    SELECT id, ai_disposition, status, started_at 
    FROM call_sessions 
    WHERE ai_disposition ILIKE '%qualified%' 
    ORDER BY started_at DESC 
    LIMIT 5
  `);
  console.log('\n=== Recent qualified calls ===');
  console.log(recentQualified.rows);
  
  // Check leads created in last 30 days
  const recentLeads = await db.execute(sql`
    SELECT id, qa_status, created_at, contact_id, notes
    FROM leads 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  console.log('\n=== Recent leads ===');
  console.log(recentLeads.rows);
  
  // Check if leads are linked to call sessions
  const linkedLeads = await db.execute(sql`
    SELECT l.id as lead_id, l.qa_status as lead_status, cs.id as session_id, cs.ai_disposition
    FROM leads l
    LEFT JOIN call_sessions cs ON l.contact_id = cs.contact_id
    ORDER BY l.created_at DESC
    LIMIT 10
  `);
  console.log('\n=== Leads linked to call sessions ===');
  console.log(linkedLeads.rows);
  
  // Check Completed calls - are these qualified?
  const completedCalls = await db.execute(sql`
    SELECT id, ai_disposition, ai_transcript, contact_id, campaign_id, started_at
    FROM call_sessions 
    WHERE ai_disposition = 'Completed'
    ORDER BY started_at DESC 
    LIMIT 5
  `);
  console.log('\n=== Sample Completed calls ===');
  for (const row of completedCalls.rows as any[]) {
    console.log('ID:', row.id.substring(0, 8), '| Contact:', row.contact_id?.substring(0, 8), '| Transcript length:', row.ai_transcript?.length || 0);
  }
  
  process.exit(0);
}
check();
