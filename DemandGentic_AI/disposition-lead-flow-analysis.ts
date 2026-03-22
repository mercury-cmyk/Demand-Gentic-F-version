/**
 * Disposition to Lead Flow Analysis
 * 
 * Traces the complete flow from call disposition to lead creation
 * to identify where leads are being lost or incorrectly created
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('='.repeat(120));
  console.log('DISPOSITION TO LEAD FLOW ANALYSIS');
  console.log('='.repeat(120));
  console.log();
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  // 1. Check all qualified_lead dispositions and their lead status
  console.log('1. QUALIFIED_LEAD DISPOSITIONS CHECK');
  console.log('-'.repeat(80));
  
  const qualifiedDispositions = await db.execute(sql`
    SELECT 
      dca.id as call_id,
      dca.disposition,
      dca.voicemail_detected,
      dca.connected,
      dca.call_duration_seconds as duration,
      dca.human_agent_id,
      dca.created_at,
      c.full_name as contact_name,
      a.name as company_name,
      camp.name as campaign_name,
      l.id as lead_id,
      l.qa_status as lead_status,
      l.created_at as lead_created_at
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = dca.campaign_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.created_at >= ${startDate.toISOString()}
      AND dca.disposition = 'qualified_lead'
    ORDER BY dca.created_at DESC
    LIMIT 50
  `);
  
  console.log(`Found ${qualifiedDispositions.rows.length} calls with qualified_lead disposition`);
  
  let withLead = 0;
  let withoutLead = 0;
  
  for (const row of qualifiedDispositions.rows as any[]) {
    if (row.lead_id) {
      withLead++;
    } else {
      withoutLead++;
      console.log(`\n❌ NO LEAD: ${row.contact_name} @ ${row.company_name}`);
      console.log(`   Call ID: ${row.call_id}`);
      console.log(`   Campaign: ${row.campaign_name}`);
      console.log(`   Duration: ${row.duration}s`);
      console.log(`   Voicemail: ${row.voicemail_detected}`);
      console.log(`   Human Agent: ${row.human_agent_id ? 'Yes' : 'No'}`);
      console.log(`   Created: ${row.created_at}`);
    }
  }
  
  console.log(`\nSummary: ${withLead} with lead, ${withoutLead} without lead`);
  console.log();
  
  // 2. Check leads and their source calls
  console.log('2. LEADS CHECK - Verifying source call disposition');
  console.log('-'.repeat(80));
  
  const leadsResult = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      l.contact_name,
      l.account_name,
      l.qa_status,
      l.created_at as lead_created,
      l.call_attempt_id,
      dca.disposition as call_disposition,
      dca.voicemail_detected,
      dca.call_duration_seconds as duration,
      dca.notes,
      camp.name as campaign_name
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    LEFT JOIN campaigns camp ON camp.id = l.campaign_id
    WHERE l.created_at >= ${startDate.toISOString()}
      AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC
    LIMIT 100
  `);
  
  console.log(`Found ${leadsResult.rows.length} leads created in last 7 days`);
  
  let properLeads = 0;
  let voicemailLeads = 0;
  let noAnswerLeads = 0;
  let otherIssues = 0;
  
  for (const row of leadsResult.rows as any[]) {
    const disp = (row.call_disposition || '').toLowerCase();
    
    if (disp === 'qualified_lead' || disp === 'qualified') {
      properLeads++;
    } else if (disp === 'voicemail') {
      voicemailLeads++;
      console.log(`\n⚠️ VOICEMAIL LEAD: ${row.contact_name} @ ${row.account_name}`);
      console.log(`   Lead ID: ${row.lead_id}`);
      console.log(`   Call Disposition: ${row.call_disposition}`);
      console.log(`   Duration: ${row.duration}s`);
      console.log(`   Voicemail Detected: ${row.voicemail_detected}`);
      console.log(`   Campaign: ${row.campaign_name}`);
    } else if (disp === 'no_answer') {
      noAnswerLeads++;
      console.log(`\n⚠️ NO_ANSWER LEAD: ${row.contact_name} @ ${row.account_name}`);
      console.log(`   Lead ID: ${row.lead_id}`);
      console.log(`   Call Disposition: ${row.call_disposition}`);
      console.log(`   Duration: ${row.duration}s`);
      console.log(`   Campaign: ${row.campaign_name}`);
    } else if (!row.call_attempt_id) {
      // Lead without call attempt - might be from other source
      otherIssues++;
    }
  }
  
  console.log(`\nLead Source Summary:`);
  console.log(`   Proper qualified_lead: ${properLeads}`);
  console.log(`   From voicemail: ${voicemailLeads} ❌`);
  console.log(`   From no_answer: ${noAnswerLeads} ❌`);
  console.log(`   No call link or other: ${otherIssues}`);
  console.log();
  
  // 3. Check call_sessions with qualified disposition
  console.log('3. AI CALL SESSIONS - Qualified dispositions');
  console.log('-'.repeat(80));
  
  const aiQualified = await db.execute(sql`
    SELECT 
      cs.id,
      cs.ai_disposition,
      cs.duration_sec as duration,
      cs.ai_transcript,
      cs.created_at,
      c.full_name as contact_name,
      a.name as company_name,
      camp.name as campaign_name,
      l.id as lead_id
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    LEFT JOIN leads l ON l.contact_id = cs.contact_id AND l.campaign_id = cs.campaign_id
    WHERE cs.created_at >= ${startDate.toISOString()}
      AND cs.agent_type = 'ai'
      AND (
        cs.ai_disposition ILIKE '%qualified%'
        OR cs.ai_disposition ILIKE '%interested%'
        OR cs.ai_disposition ILIKE '%meeting%'
      )
    ORDER BY cs.created_at DESC
  `);
  
  console.log(`Found ${aiQualified.rows.length} AI calls with qualified-like disposition`);
  
  for (const row of aiQualified.rows as any[]) {
    const hasLead = row.lead_id ? '✅' : '❌';
    console.log(`\n${hasLead} ${row.contact_name} @ ${row.company_name}`);
    console.log(`   AI Disposition: ${row.ai_disposition}`);
    console.log(`   Duration: ${row.duration}s`);
    console.log(`   Campaign: ${row.campaign_name}`);
    if (row.ai_transcript) {
      console.log(`   Transcript: ${row.ai_transcript.substring(0, 200)}...`);
    }
  }
  console.log();
  
  // 4. Check for human agent qualified calls
  console.log('4. HUMAN AGENT QUALIFIED CALLS');
  console.log('-'.repeat(80));
  
  const humanQualified = await db.execute(sql`
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
      u.username as agent_name,
      l.id as lead_id,
      l.qa_status
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = dca.campaign_id
    LEFT JOIN users u ON u.id = dca.human_agent_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.created_at >= ${startDate.toISOString()}
      AND dca.human_agent_id IS NOT NULL
      AND dca.disposition = 'qualified_lead'
    ORDER BY dca.created_at DESC
    LIMIT 30
  `);
  
  console.log(`Found ${humanQualified.rows.length} human agent qualified calls`);
  
  for (const row of humanQualified.rows as any[]) {
    const hasLead = row.lead_id ? '✅' : '❌';
    console.log(`\n${hasLead} ${row.contact_name} @ ${row.company_name}`);
    console.log(`   Disposition: ${row.disposition}`);
    console.log(`   Duration: ${row.duration}s`);
    console.log(`   Agent: ${row.agent_name}`);
    console.log(`   Voicemail: ${row.voicemail_detected}`);
    console.log(`   Lead Status: ${row.qa_status || 'No lead'}`);
  }
  console.log();
  
  // 5. Check for disposition patterns
  console.log('5. DISPOSITION DISTRIBUTION (Last 7 days)');
  console.log('-'.repeat(80));
  
  const dispDistribution = await db.execute(sql`
    SELECT 
      dca.disposition,
      COUNT(*) as count,
      COUNT(CASE WHEN l.id IS NOT NULL THEN 1 END) as with_lead,
      COUNT(CASE WHEN dca.voicemail_detected THEN 1 END) as voicemail_detected,
      AVG(dca.call_duration_seconds)::int as avg_duration
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.created_at >= ${startDate.toISOString()}
    GROUP BY dca.disposition
    ORDER BY count DESC
  `);
  
  console.log('Disposition | Count | With Lead | VM Detected | Avg Duration');
  console.log('-'.repeat(70));
  for (const row of dispDistribution.rows as any[]) {
    console.log(`${(row.disposition || 'NULL').padEnd(20)} | ${String(row.count).padEnd(5)} | ${String(row.with_lead).padEnd(9)} | ${String(row.voicemail_detected).padEnd(11)} | ${row.avg_duration || 0}s`);
  }
  console.log();
  
  // 6. Check for recent leads with issues
  console.log('6. RECENT LEADS DETAILED CHECK');
  console.log('-'.repeat(80));
  
  const recentLeads = await db.execute(sql`
    SELECT 
      l.id,
      l.contact_name,
      l.account_name,
      l.qa_status,
      l.transcript,
      l.ai_score,
      l.ai_qualification_status,
      l.created_at,
      dca.disposition as call_disposition,
      dca.voicemail_detected,
      dca.call_duration_seconds,
      dca.notes as call_notes,
      camp.name as campaign_name
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    LEFT JOIN campaigns camp ON camp.id = l.campaign_id
    WHERE l.created_at >= ${startDate.toISOString()}
      AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC
    LIMIT 20
  `);
  
  console.log(`Checking ${recentLeads.rows.length} most recent leads...`);
  
  for (const row of recentLeads.rows as any[]) {
    const disp = (row.call_disposition || '').toLowerCase();
    const isProper = disp === 'qualified_lead' || disp === 'qualified';
    const icon = isProper ? '✅' : '❌';
    
    console.log(`\n${icon} Lead: ${row.contact_name} @ ${row.account_name}`);
    console.log(`   Campaign: ${row.campaign_name}`);
    console.log(`   QA Status: ${row.qa_status}`);
    console.log(`   Call Disposition: ${row.call_disposition || 'N/A'}`);
    console.log(`   Duration: ${row.call_duration_seconds || 0}s`);
    console.log(`   Voicemail: ${row.voicemail_detected || false}`);
    console.log(`   AI Score: ${row.ai_score || 'N/A'}`);
    console.log(`   AI Qual Status: ${row.ai_qualification_status || 'N/A'}`);
    
    if (row.transcript) {
      console.log(`   Has Transcript: Yes (${row.transcript.length} chars)`);
    }
  }
  
  console.log();
  console.log('='.repeat(80));
  console.log('ANALYSIS COMPLETE');
  console.log('='.repeat(80));
  
  process.exit(0);
}

main().catch(err => {
  console.error('Analysis failed:', err);
  process.exit(1);
});