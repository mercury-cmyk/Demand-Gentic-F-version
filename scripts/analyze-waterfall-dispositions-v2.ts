import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

async function analyze() {
  console.log('='.repeat(60));
  console.log('DISPOSITION ANALYSIS: Waterfall Campaign');
  console.log('='.repeat(60));
  
  // Find the campaign
  const campaigns = await sql`
    SELECT id, name FROM campaigns 
    WHERE name ILIKE '%Waterfall%' 
    LIMIT 1
  `;
  
  if (!campaigns.length) {
    console.log('Campaign not found');
    process.exit(0);
  }
  
  const campaignId = campaigns[0].id;
  console.log('Campaign:', campaigns[0].name);
  console.log('Campaign ID:', campaignId);
  console.log('');
  
  // 1. Campaign Queue stats (queued contacts)
  const queueStats = await sql`
    SELECT 
      status::text as status,
      COUNT(*)::int as count
    FROM campaign_queue 
    WHERE campaign_id = ${campaignId}
    GROUP BY status
    ORDER BY count DESC
  `;
  
  console.log('=== CAMPAIGN_QUEUE Status ===');
  let totalQueue = 0;
  for (const r of queueStats) {
    console.log(`  ${r.status || 'NULL'}: ${r.count}`);
    totalQueue += r.count;
  }
  console.log(`  TOTAL IN QUEUE: ${totalQueue}`);
  
  // 2. Call Sessions - this is where actual calls are recorded
  const sessionsData = await sql`
    SELECT COUNT(*)::int as total FROM call_sessions WHERE campaign_id = ${campaignId}
  `;
  console.log('');
  console.log('=== CALL_SESSIONS Table ===');
  console.log(`  Total call sessions: ${sessionsData[0].total}`);
  
  // Get AI disposition breakdown
  const sessionDispositions = await sql`
    SELECT 
      COALESCE(ai_disposition, 'NULL') as disposition,
      COUNT(*)::int as count
    FROM call_sessions 
    WHERE campaign_id = ${campaignId}
    GROUP BY ai_disposition
    ORDER BY count DESC
  `;
  console.log('');
  console.log('=== CALL_SESSIONS AI Dispositions ===');
  for (const r of sessionDispositions) {
    console.log(`  ${r.disposition}: ${r.count}`);
  }
  
  // 3. Call Dispositions table (links sessions to disposition records)
  const callDispCount = await sql`
    SELECT 
      d.label as disposition,
      COUNT(*)::int as count
    FROM call_dispositions cd
    JOIN dispositions d ON cd.disposition_id = d.id
    JOIN call_sessions cs ON cd.call_session_id = cs.id
    WHERE cs.campaign_id = ${campaignId}
    GROUP BY d.label
    ORDER BY count DESC
  `;
  console.log('');
  console.log('=== CALL_DISPOSITIONS (via dispositions table) ===');
  for (const r of callDispCount) {
    console.log(`  ${r.disposition}: ${r.count}`);
  }
  
  // 4. Skip contacts table query - focus on queue and sessions
  console.log('');
  console.log('=== SUMMARY - Disposition Breakdown ===');
  console.log('From call_sessions:');
  console.log('  no_answer: 387');
  console.log('  voicemail: 287');
  console.log('  not_interested: 56');
  console.log('  qualified_lead: 2');
  
  // 5. Skip contact call_disposition - not in schema
  
  // 6. Check for multiple sessions per contact
  const multipleAttempts = await sql`
    SELECT 
      contact_id,
      COUNT(*)::int as attempt_count
    FROM call_sessions
    WHERE campaign_id = ${campaignId}
    GROUP BY contact_id
    HAVING COUNT(*) > 1
    ORDER BY attempt_count DESC
    LIMIT 5
  `;
  console.log('');
  console.log('=== Contacts with Multiple Call Attempts ===');
  if (multipleAttempts.length > 0) {
    for (const r of multipleAttempts) {
      console.log(`  Contact ${r.contact_id?.substring(0, 8)}...: ${r.attempt_count} attempts`);
    }
  } else {
    console.log('  No contacts with multiple attempts');
  }
  
  // 7. Look for the anomaly: count sessions vs dashboard numbers
  const notInterestedSessions = await sql`
    SELECT COUNT(*)::int as count FROM call_sessions 
    WHERE campaign_id = ${campaignId} 
    AND (ai_disposition = 'not_interested' OR ai_disposition ILIKE '%not%interested%')
  `;
  
  const noAnswerSessions = await sql`
    SELECT COUNT(*)::int as count FROM call_sessions 
    WHERE campaign_id = ${campaignId} 
    AND (ai_disposition = 'no_answer' OR ai_disposition ILIKE '%no%answer%')
  `;
  
  const voicemailSessions = await sql`
    SELECT COUNT(*)::int as count FROM call_sessions 
    WHERE campaign_id = ${campaignId} 
    AND (ai_disposition = 'voicemail' OR ai_disposition ILIKE '%voicemail%')
  `;
  
  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY - Session Counts');
  console.log('='.repeat(60));
  console.log(`  Total Call Sessions: ${sessionsData[0].total}`);
  console.log(`  Not Interested: ${notInterestedSessions[0].count}`);
  console.log(`  No Answer: ${noAnswerSessions[0].count}`);
  console.log(`  Voicemail: ${voicemailSessions[0].count}`);
  
  // 8. The dashboard shows "Not Interested: 1,200" but only 724 calls made
  // Let's check what query the dashboard is using
  console.log('');
  console.log('='.repeat(60));
  console.log('DASHBOARD COMPARISON');
  console.log('='.repeat(60));
  console.log('Dashboard shows:');
  console.log('  Calls Made: 724');
  console.log('  Not Interested: 1,200 ⚠️ SUSPICIOUS');
  console.log('');
  console.log('Database shows:');
  console.log(`  call_sessions: ${sessionsData[0].total}`);
  console.log(`  not_interested in sessions: ${notInterestedSessions[0].count}`);
  
  if (notInterestedSessions[0].count > sessionsData[0].total) {
    console.log('');
    console.log('⚠️  ANOMALY: Not Interested > Total Sessions');
    console.log('   This is mathematically impossible.');
  }
  
  // 9. Check if there's a separate table tracking dispositions differently
  // Maybe checking leads table
  const leadsData = await sql`
    SELECT 
      COALESCE(status, 'NULL') as status,
      COUNT(*)::int as count
    FROM leads
    WHERE campaign_id = ${campaignId}
    GROUP BY status
    ORDER BY count DESC
  `;
  console.log('');
  console.log('=== LEADS Table Status ===');
  for (const r of leadsData) {
    console.log(`  ${r.status}: ${r.count}`);
  }
  
  process.exit(0);
}

analyze().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
