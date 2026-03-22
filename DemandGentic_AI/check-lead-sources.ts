import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkRecentLeads() {
  console.log('=== REPORT DATA DIAGNOSTIC ===\n');

  // Get recent leads with raw SQL
  const recentLeadsResult = await db.execute(sql`
    SELECT id, contact_name, qa_status, campaign_id, created_at, call_duration, transcript IS NOT NULL as has_transcript
    FROM leads
    ORDER BY created_at DESC
    LIMIT 15
  `);
  
  console.log('=== 15 MOST RECENT LEADS ===');
  console.table(recentLeadsResult.rows.map((l: any) => ({
    id: l.id?.substring(0,8) + '...',
    contactName: l.contact_name,
    qaStatus: l.qa_status,
    duration: l.call_duration,
    hasTranscript: l.has_transcript,
    createdAt: l.created_at?.toISOString?.().substring(0,16) || String(l.created_at).substring(0,16)
  })));
  
  // Get QA status counts (leads don't have disposition - that's on call attempts)
  const qaStatusCounts = await db.execute(sql`
    SELECT qa_status, COUNT(*)::int as count 
    FROM leads 
    WHERE qa_status IS NOT NULL
    GROUP BY qa_status
    ORDER BY count DESC
  `);
  
  console.log('\n=== LEAD QA STATUS COUNTS ===');
  console.table(qaStatusCounts.rows);
  
  // Check legacy call sessions stats
  const sessionStats = await db.execute(sql`
    SELECT 
      COUNT(*)::int as total_sessions
    FROM call_sessions
  `);
  
  console.log('\n=== LEGACY CALL SESSIONS ===');
  console.table(sessionStats.rows);
  
  // Check dialer_call_attempts - this is where AI dialer calls are tracked
  const dialerStats = await db.execute(sql`
    SELECT 
      COUNT(*)::int as total_attempts,
      COUNT(CASE WHEN disposition IS NOT NULL THEN 1 END)::int as with_disposition,
      COUNT(CASE WHEN connected = true THEN 1 END)::int as connected_calls
    FROM dialer_call_attempts
  `);
  
  console.log('\n=== DIALER CALL ATTEMPTS (AI Dialer tracking) ===');
  console.table(dialerStats.rows);
  
  // Check dialer runs
  const runsStats = await db.execute(sql`
    SELECT 
      COUNT(*)::int as total_runs,
      COUNT(CASE WHEN status = 'active' THEN 1 END)::int as active_runs,
      COUNT(CASE WHEN agent_type = 'ai' THEN 1 END)::int as ai_runs
    FROM dialer_runs
  `);
  
  console.log('\n=== DIALER RUNS ===');
  console.table(runsStats.rows);
  
  process.exit(0);
}

checkRecentLeads();