/**
 * Historical Lead Data Analysis & Fix Script
 * 
 * This script:
 * 1. Identifies leads that came from voicemail dispositions (should be soft-deleted)
 * 2. Identifies AI qualified calls without leads (should create leads)
 * 3. Optionally fixes both issues
 * 
 * Usage:
 *   npx tsx fix-historical-lead-data.ts analyze     # Just analyze, don't fix
 *   npx tsx fix-historical-lead-data.ts fix         # Analyze and fix issues
 */

import { db } from "./server/db";
import { sql, eq, and, isNull, inArray } from "drizzle-orm";
import { leads, dialerCallAttempts, contacts, accounts, campaigns, InsertLead } from "@shared/schema";

const DRY_RUN = process.argv[2] !== 'fix';

async function main() {
  console.log('='.repeat(60));
  console.log('HISTORICAL LEAD DATA ANALYSIS & FIX');
  console.log('Mode:', DRY_RUN ? 'ANALYZE ONLY (use "fix" arg to apply changes)' : 'FIX MODE');
  console.log('='.repeat(60));
  console.log('');

  // ============================================================
  // 1. FIND LEADS FROM VOICEMAIL/NO_ANSWER DISPOSITIONS
  // ============================================================
  console.log('1. LEADS FROM VOICEMAIL/NO_ANSWER DISPOSITIONS');
  console.log('-'.repeat(50));
  
  const voicemailLeads = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      l.contact_name,
      l.qa_status,
      l.created_at,
      dca.disposition,
      dca.agent_type,
      dca.call_duration_seconds,
      l.notes
    FROM leads l
    JOIN dialer_call_attempts dca ON l.call_attempt_id = dca.id
    WHERE dca.disposition IN ('voicemail', 'no_answer')
      AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC
  `);
  
  const vmLeadCount = voicemailLeads.rows?.length || 0;
  console.log(`Found ${vmLeadCount} leads created from voicemail/no_answer dispositions`);
  
  if (vmLeadCount > 0) {
    console.log('\nSample (first 10):');
    (voicemailLeads.rows || []).slice(0, 10).forEach((r: any) => {
      console.log(`  - ${r.lead_id} | ${r.contact_name} | ${r.disposition} | ${r.agent_type} | ${r.call_duration_seconds}s | QA: ${r.qa_status}`);
    });
    
    if (!DRY_RUN) {
      console.log('\n⚠️  SOFT-DELETING these invalid leads...');
      const leadIds = (voicemailLeads.rows || []).map((r: any) => r.lead_id);
      
      // Soft delete by setting deleted_at
      await db.execute(sql`
        UPDATE leads 
        SET 
          deleted_at = NOW(),
          notes = COALESCE(notes, '') || ' | SOFT-DELETED: Created from voicemail disposition (fix-historical-lead-data.ts)'
        WHERE id = ANY(${leadIds})
      `);
      
      console.log(`✅ Soft-deleted ${leadIds.length} invalid voicemail leads`);
    } else {
      console.log('\n💡 Run with "fix" argument to soft-delete these leads');
    }
  }
  
  // ============================================================
  // 2. FIND AI QUALIFIED CALLS WITHOUT LEADS
  // ============================================================
  console.log('\n');
  console.log('2. AI QUALIFIED CALLS WITHOUT LEADS (MISSING)');
  console.log('-'.repeat(50));
  
  const missingLeads = await db.execute(sql`
    SELECT 
      dca.id as call_attempt_id,
      dca.campaign_id,
      dca.contact_id,
      dca.disposition,
      dca.agent_type,
      dca.virtual_agent_id,
      dca.human_agent_id,
      dca.call_duration_seconds,
      dca.phone_dialed,
      dca.recording_url,
      dca.created_at,
      c.full_name as contact_name,
      c.first_name,
      c.last_name,
      c.email as contact_email,
      a.name as company_name,
      camp.name as campaign_name
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    LEFT JOIN contacts c ON dca.contact_id = c.id
    LEFT JOIN accounts a ON c.account_id = a.id
    LEFT JOIN campaigns camp ON dca.campaign_id = camp.id
    WHERE dca.disposition = 'qualified_lead'
      AND l.id IS NULL
    ORDER BY dca.created_at DESC
  `);
  
  const missingCount = missingLeads.rows?.length || 0;
  console.log(`Found ${missingCount} qualified calls without leads`);
  
  if (missingCount > 0) {
    console.log('\nSample (first 10):');
    (missingLeads.rows || []).slice(0, 10).forEach((r: any) => {
      console.log(`  - ${r.call_attempt_id} | ${r.contact_name || 'Unknown'} | ${r.campaign_name} | ${r.agent_type} | ${r.call_duration_seconds}s`);
    });
    
    if (!DRY_RUN) {
      console.log('\n⚠️  CREATING missing leads...');
      let created = 0;
      let errors = 0;
      
      for (const row of (missingLeads.rows || []) as any[]) {
        try {
          const contactName = row.contact_name || 
            (row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : 
             row.first_name || row.last_name || 'Unknown');
          
          const agentSource = row.agent_type === 'ai' 
            ? `Source: ai_agent | Virtual Agent: ${row.virtual_agent_id || 'unknown'} | RECOVERED by fix-historical-lead-data.ts`
            : `Source: human_agent | Agent: ${row.human_agent_id || 'unknown'} | RECOVERED by fix-historical-lead-data.ts`;
          
          const leadPayload: InsertLead = {
            campaignId: row.campaign_id || undefined,
            contactId: row.contact_id || undefined,
            callAttemptId: row.call_attempt_id,
            contactName,
            contactEmail: row.contact_email || undefined,
            accountName: row.company_name || undefined,
            qaStatus: 'new',
            qaDecision: '⚠️ RECOVERED LEAD: Created by fix-historical-lead-data.ts - original lead was never created',
            agentId: row.human_agent_id || undefined,
            dialedNumber: row.phone_dialed,
            recordingUrl: row.recording_url,
            callDuration: row.call_duration_seconds,
            notes: agentSource,
          };

          await db.insert(leads).values(leadPayload);
          
          created++;
          console.log(`  ✅ Created lead for ${contactName} (${row.call_attempt_id})`);
        } catch (err: any) {
          errors++;
          console.log(`  ❌ Failed for ${row.call_attempt_id}: ${err.message}`);
        }
      }
      
      console.log(`\n✅ Created ${created} missing leads (${errors} errors)`);
    } else {
      console.log('\n💡 Run with "fix" argument to create these missing leads');
    }
  }
  
  // ============================================================
  // 3. SUMMARY
  // ============================================================
  console.log('\n');
  console.log('3. SUMMARY');
  console.log('-'.repeat(50));
  
  const summary = await db.execute(sql`
    SELECT 
      (SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL) as active_leads,
      (SELECT COUNT(*) FROM leads WHERE deleted_at IS NOT NULL) as deleted_leads,
      (SELECT COUNT(*) FROM leads WHERE call_attempt_id IS NOT NULL AND deleted_at IS NULL) as leads_with_call_attempt,
      (SELECT COUNT(*) FROM leads WHERE call_attempt_id IS NULL AND deleted_at IS NULL) as leads_without_call_attempt,
      (SELECT COUNT(*) FROM dialer_call_attempts WHERE disposition = 'qualified_lead') as total_qualified_calls,
      (SELECT COUNT(*) FROM dialer_call_attempts WHERE disposition = 'qualified_lead' AND agent_type = 'ai') as ai_qualified_calls,
      (SELECT COUNT(*) FROM dialer_call_attempts WHERE disposition = 'qualified_lead' AND agent_type = 'human') as human_qualified_calls,
      (SELECT COUNT(*) FROM dialer_call_attempts WHERE disposition = 'voicemail') as voicemail_calls,
      (SELECT COUNT(*) FROM dialer_call_attempts WHERE disposition = 'no_answer') as no_answer_calls,
      (SELECT COUNT(*) 
       FROM leads l 
       JOIN dialer_call_attempts dca ON l.call_attempt_id = dca.id 
       WHERE dca.disposition IN ('voicemail', 'no_answer') AND l.deleted_at IS NULL
      ) as invalid_voicemail_leads
  `);
  
  const s = (summary.rows?.[0] || {}) as any;
  console.log(`  Active leads:                 ${s.active_leads}`);
  console.log(`  Deleted leads:                ${s.deleted_leads}`);
  console.log(`  Leads with call_attempt_id:   ${s.leads_with_call_attempt}`);
  console.log(`  Leads without call_attempt_id: ${s.leads_without_call_attempt}`);
  console.log(`  Total qualified_lead calls:   ${s.total_qualified_calls}`);
  console.log(`    - AI agent:                 ${s.ai_qualified_calls}`);
  console.log(`    - Human agent:              ${s.human_qualified_calls}`);
  console.log(`  Voicemail calls:              ${s.voicemail_calls}`);
  console.log(`  No answer calls:              ${s.no_answer_calls}`);
  console.log(`  Invalid voicemail leads:      ${s.invalid_voicemail_leads} ${Number(s.invalid_voicemail_leads) > 0 ? '⚠️ NEEDS FIX' : '✅'}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  
  process.exit(0);
}

main().catch(e => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
