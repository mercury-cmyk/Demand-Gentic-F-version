/**
 * Voicemail Leads Investigation and NULL Disposition Analysis
 * 
 * Investigates:
 * 1. The 18 leads incorrectly created from voicemail/no_answer
 * 2. The 6416 calls with NULL disposition
 * 3. Why leads are being created from non-qualified dispositions
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('='.repeat(120));
  console.log('VOICEMAIL LEADS & NULL DISPOSITION INVESTIGATION');
  console.log('='.repeat(120));
  console.log();
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  // 1. Find leads that were created from voicemail/no_answer calls
  console.log('1. LEADS FROM VOICEMAIL/NO_ANSWER CALLS');
  console.log('-'.repeat(80));
  
  const voicemailLeads = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      l.contact_name,
      l.account_name,
      l.qa_status,
      l.created_at as lead_created,
      l.call_attempt_id,
      dca.disposition,
      dca.voicemail_detected,
      dca.call_duration_seconds as duration,
      dca.notes,
      dca.created_at as call_created,
      camp.name as campaign_name
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    JOIN campaigns camp ON camp.id = l.campaign_id
    WHERE l.created_at >= ${startDate.toISOString()}
      AND l.deleted_at IS NULL
      AND (dca.disposition IN ('voicemail', 'no_answer') OR dca.voicemail_detected = true)
    ORDER BY l.created_at DESC
  `);
  
  console.log(`Found ${voicemailLeads.rows.length} leads from voicemail/no_answer calls:`);
  
  for (const row of voicemailLeads.rows as any[]) {
    console.log(`\n❌ Lead: ${row.contact_name} @ ${row.account_name}`);
    console.log(`   Lead ID: ${row.lead_id}`);
    console.log(`   Call Attempt ID: ${row.call_attempt_id}`);
    console.log(`   Call Disposition: ${row.disposition}`);
    console.log(`   Voicemail Detected: ${row.voicemail_detected}`);
    console.log(`   Duration: ${row.duration}s`);
    console.log(`   QA Status: ${row.qa_status}`);
    console.log(`   Campaign: ${row.campaign_name}`);
    console.log(`   Lead Created: ${row.lead_created}`);
    console.log(`   Call Created: ${row.call_created}`);
    
    if (row.notes) {
      console.log(`   Notes Preview: ${(row.notes || '').substring(0, 200)}...`);
    }
  }
  
  console.log();
  
  // 2. Analyze NULL disposition calls
  console.log('2. NULL DISPOSITION CALLS ANALYSIS');
  console.log('-'.repeat(80));
  
  const nullDispSummary = await db.execute(sql`
    SELECT 
      camp.name as campaign_name,
      COUNT(*) as total_null,
      COUNT(CASE WHEN l.id IS NOT NULL THEN 1 END) as with_lead,
      COUNT(CASE WHEN dca.call_duration_seconds > 30 THEN 1 END) as long_calls,
      AVG(dca.call_duration_seconds)::int as avg_duration
    FROM dialer_call_attempts dca
    LEFT JOIN campaigns camp ON camp.id = dca.campaign_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.created_at >= ${startDate.toISOString()}
      AND dca.disposition IS NULL
    GROUP BY camp.name
    ORDER BY total_null DESC
  `);
  
  console.log('Campaign Breakdown of NULL Dispositions:');
  console.log('Campaign | NULL Count | With Lead | Long Calls (>30s) | Avg Duration');
  console.log('-'.repeat(90));
  
  for (const row of nullDispSummary.rows as any[]) {
    console.log(`${(row.campaign_name || 'Unknown').substring(0, 30).padEnd(30)} | ${String(row.total_null).padEnd(10)} | ${String(row.with_lead).padEnd(9)} | ${String(row.long_calls).padEnd(17)} | ${row.avg_duration || 0}s`);
  }
  console.log();
  
  // 3. Sample of NULL disposition calls with long duration
  console.log('3. SAMPLE: NULL DISPOSITION CALLS WITH LONG DURATION (>30s)');
  console.log('-'.repeat(80));
  
  const longNullCalls = await db.execute(sql`
    SELECT 
      dca.id,
      dca.disposition,
      dca.call_duration_seconds as duration,
      dca.notes,
      dca.connected,
      dca.voicemail_detected,
      dca.created_at,
      c.full_name as contact_name,
      a.name as company_name,
      camp.name as campaign_name,
      l.id as lead_id
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = dca.campaign_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.created_at >= ${startDate.toISOString()}
      AND dca.disposition IS NULL
      AND dca.call_duration_seconds > 30
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 20
  `);
  
  console.log(`Found ${longNullCalls.rows.length} NULL disposition calls with duration > 30s:`);
  
  for (const row of longNullCalls.rows as any[]) {
    const leadStatus = row.lead_id ? '✅ Has Lead' : '❌ No Lead';
    console.log(`\n${leadStatus} ${row.contact_name} @ ${row.company_name}`);
    console.log(`   Call ID: ${row.id}`);
    console.log(`   Duration: ${row.duration}s`);
    console.log(`   Connected: ${row.connected}`);
    console.log(`   Voicemail: ${row.voicemail_detected}`);
    console.log(`   Campaign: ${row.campaign_name}`);
    
    if (row.notes) {
      console.log(`   Notes: ${(row.notes || '').substring(0, 300)}...`);
    }
  }
  console.log();
  
  // 4. Check call_sessions for AI calls with NULL ai_disposition
  console.log('4. AI CALL SESSIONS WITH MISSING DISPOSITION');
  console.log('-'.repeat(80));
  
  const aiNullDisp = await db.execute(sql`
    SELECT 
      cs.id,
      cs.ai_disposition,
      cs.status,
      cs.duration_sec as duration,
      cs.ai_transcript,
      cs.created_at,
      c.full_name as contact_name,
      a.name as company_name,
      camp.name as campaign_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    WHERE cs.created_at >= ${startDate.toISOString()}
      AND cs.agent_type = 'ai'
      AND cs.status = 'completed'
      AND (cs.ai_disposition IS NULL OR cs.ai_disposition = '')
    ORDER BY cs.duration_sec DESC
    LIMIT 15
  `);
  
  console.log(`Found ${aiNullDisp.rows.length} completed AI calls with missing disposition:`);
  
  for (const row of aiNullDisp.rows as any[]) {
    console.log(`\n${row.contact_name} @ ${row.company_name}`);
    console.log(`   Session ID: ${row.id}`);
    console.log(`   Status: ${row.status}`);
    console.log(`   Duration: ${row.duration}s`);
    console.log(`   AI Disposition: ${row.ai_disposition || 'NULL'}`);
    console.log(`   Campaign: ${row.campaign_name}`);
    
    if (row.ai_transcript) {
      console.log(`   Transcript Preview: ${row.ai_transcript.substring(0, 300)}...`);
    }
  }
  console.log();
  
  // 5. Check how leads were created - pathway analysis
  console.log('5. LEAD CREATION PATHWAY ANALYSIS');
  console.log('-'.repeat(80));
  
  // Check if there are leads without call_attempt_id
  const leadsWithoutCall = await db.execute(sql`
    SELECT 
      l.id,
      l.contact_name,
      l.account_name,
      l.qa_status,
      l.created_at,
      l.call_attempt_id,
      camp.name as campaign_name
    FROM leads l
    LEFT JOIN campaigns camp ON camp.id = l.campaign_id
    WHERE l.created_at >= ${startDate.toISOString()}
      AND l.deleted_at IS NULL
      AND l.call_attempt_id IS NULL
    ORDER BY l.created_at DESC
    LIMIT 20
  `);
  
  console.log(`Leads without call_attempt_id: ${leadsWithoutCall.rows.length}`);
  
  for (const row of leadsWithoutCall.rows as any[]) {
    console.log(`\n${row.contact_name} @ ${row.account_name}`);
    console.log(`   Lead ID: ${row.id}`);
    console.log(`   QA Status: ${row.qa_status}`);
    console.log(`   Campaign: ${row.campaign_name}`);
  }
  console.log();
  
  // 6. Check for duplicate leads or leads created from same contact
  console.log('6. DISPOSITION CORRECTION RECOMMENDATIONS');
  console.log('-'.repeat(80));
  
  // Get counts of leads by source disposition
  const leadsBySourceDisp = await db.execute(sql`
    SELECT 
      dca.disposition,
      COUNT(*) as lead_count,
      COUNT(CASE WHEN l.qa_status = 'approved' THEN 1 END) as approved,
      COUNT(CASE WHEN l.qa_status = 'rejected' THEN 1 END) as rejected,
      COUNT(CASE WHEN l.qa_status IN ('new', 'under_review') THEN 1 END) as pending
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.created_at >= ${startDate.toISOString()}
      AND l.deleted_at IS NULL
    GROUP BY dca.disposition
    ORDER BY lead_count DESC
  `);
  
  console.log('Leads by Source Call Disposition:');
  console.log('Disposition | Leads | Approved | Rejected | Pending');
  console.log('-'.repeat(60));
  
  for (const row of leadsBySourceDisp.rows as any[]) {
    console.log(`${(row.disposition || 'NULL').padEnd(20)} | ${String(row.lead_count).padEnd(5)} | ${String(row.approved).padEnd(8)} | ${String(row.rejected).padEnd(8)} | ${row.pending}`);
  }
  
  console.log();
  console.log('='.repeat(80));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(80));
  console.log();
  console.log('1. DELETE the 18+ leads created from voicemail/no_answer dispositions');
  console.log('2. INVESTIGATE the 6416 calls with NULL disposition - these are AI calls');
  console.log('   that may not be getting proper disposition assigned');
  console.log('3. FIX the lead creation logic to reject any call where:');
  console.log('   - disposition is voicemail, no_answer, not_interested, dnc');
  console.log('   - voicemail_detected flag is true');
  console.log('   - disposition is NULL (should not create leads from unprocessed calls)');
  console.log('4. ADD validation in the disposition submission to ensure only');
  console.log('   qualified_lead disposition triggers lead creation');
  console.log();
  
  process.exit(0);
}

main().catch(err => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
