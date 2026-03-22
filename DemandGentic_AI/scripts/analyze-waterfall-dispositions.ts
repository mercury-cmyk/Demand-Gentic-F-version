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
  
  // 1. Campaign Queue dispositions (this is where contacts are tracked)
  const queueDispositions = await sql`
    SELECT 
      COALESCE(disposition, 'NULL') as disposition,
      COUNT(*)::int as count
    FROM campaign_queue 
    WHERE campaign_id = ${campaignId}
    GROUP BY disposition
    ORDER BY count DESC
  `;
  
  console.log('=== CAMPAIGN_QUEUE Table (Contact-level dispositions) ===');
  let totalContacts = 0;
  for (const r of queueDispositions) {
    console.log(`  ${r.disposition}: ${r.count}`);
    totalContacts += r.count;
  }
  console.log(`  TOTAL CONTACTS IN QUEUE: ${totalContacts}`);
  
  // 2. Calls table
  const callsData = await sql`
    SELECT COUNT(*)::int as total FROM calls WHERE campaign_id = ${campaignId}
  `;
  console.log('');
  console.log('=== CALLS Table ===');
  console.log(`  Total records: ${callsData[0].total}`);
  
  // 3. Call Sessions
  const sessionsData = await sql`
    SELECT COUNT(*)::int as total FROM call_sessions WHERE campaign_id = ${campaignId}
  `;
  console.log('');
  console.log('=== CALL_SESSIONS Table ===');
  console.log(`  Total sessions: ${sessionsData[0].total}`);
  
  const sessionDispositions = await sql`
    SELECT 
      COALESCE(disposition, 'NULL') as disposition,
      COUNT(*)::int as count
    FROM call_sessions 
    WHERE campaign_id = ${campaignId}
    GROUP BY disposition
    ORDER BY count DESC
  `;
  for (const r of sessionDispositions) {
    console.log(`  ${r.disposition}: ${r.count}`);
  }
  
  // 4. Check for contacts with multiple call attempts
  const multipleAttempts = await sql`
    SELECT 
      contact_id,
      COUNT(*)::int as attempt_count
    FROM call_sessions
    WHERE campaign_id = ${campaignId}
    GROUP BY contact_id
    HAVING COUNT(*) > 1
    ORDER BY attempt_count DESC
    LIMIT 10
  `;
  console.log('');
  console.log('=== Contacts with Multiple Attempts ===');
  console.log(`  Contacts with >1 call attempt: ${multipleAttempts.length}`);
  if (multipleAttempts.length > 0) {
    console.log('  Top 5:');
    multipleAttempts.slice(0, 5).forEach((r: any) => 
      console.log(`    Contact ${r.contact_id?.substring(0, 8)}...: ${r.attempt_count} attempts`)
    );
  }
  
  // 5. CRITICAL: Check where 'not_interested' dispositions are coming from
  console.log('');
  console.log('=== ANALYSIS: Where are Not Interested coming from? ===');
  
  const notInterestedQueue = await sql`
    SELECT COUNT(*)::int as count FROM campaign_queue 
    WHERE campaign_id = ${campaignId} AND disposition = 'not_interested'
  `;
  console.log(`  campaign_queue with not_interested: ${notInterestedQueue[0].count}`);
  
  const notInterestedSessions = await sql`
    SELECT COUNT(*)::int as count FROM call_sessions 
    WHERE campaign_id = ${campaignId} AND disposition = 'not_interested'
  `;
  console.log(`  call_sessions with not_interested: ${notInterestedSessions[0].count}`);
  
  // 6. Check if contacts are being marked not_interested without actual calls
  const notInterestedNoCall = await sql`
    SELECT COUNT(*)::int as count 
    FROM campaign_queue cq
    WHERE cq.campaign_id = ${campaignId} 
    AND cq.disposition = 'not_interested'
    AND NOT EXISTS (
      SELECT 1 FROM call_sessions cs 
      WHERE cs.contact_id = cq.contact_id 
      AND cs.campaign_id = cq.campaign_id
    )
  `;
  console.log('');
  console.log('=== ANOMALY CHECK ===');
  console.log(`  Contacts marked not_interested WITHOUT any call_session: ${notInterestedNoCall[0].count}`);
  
  // 7. Check import/batch operations
  const recentUpdates = await sql`
    SELECT 
      DATE(updated_at) as update_date,
      disposition,
      COUNT(*)::int as count
    FROM campaign_queue
    WHERE campaign_id = ${campaignId}
    AND disposition = 'not_interested'
    GROUP BY DATE(updated_at), disposition
    ORDER BY update_date DESC
    LIMIT 10
  `;
  console.log('');
  console.log('=== Not Interested by Date (Recent Updates) ===');
  for (const r of recentUpdates) {
    console.log(`  ${r.update_date}: ${r.count} contacts`);
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  const notInterestedInQueue = notInterestedQueue[0].count;
  const totalCalls = sessionsData[0].total;
  
  if (notInterestedInQueue > totalCalls) {
    console.log(`⚠️  ISSUE DETECTED: Not Interested (${notInterestedInQueue}) > Total Calls (${totalCalls})`);
    console.log(`   Excess: ${notInterestedInQueue - totalCalls} contacts marked without calls`);
    console.log('');
    console.log('POSSIBLE CAUSES:');
    console.log('  1. Bulk import with pre-set dispositions');
    console.log('  2. Data sync issue from external source');
    console.log('  3. Disposition being set on contact before call completes');
    console.log('  4. Multiple call attempts per contact inflating session count');
  } else {
    console.log('✅ Disposition counts appear consistent with call volume');
  }
  
  process.exit(0);
}

analyze().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});