/**
 * Backfill Missing Qualified Leads
 * 
 * Creates lead records for call attempts that:
 * 1. Have disposition = 'qualified_lead'
 * 2. Don't have a corresponding lead record linked via call_attempt_id
 * 
 * This script handles two scenarios:
 * - dialer_call_attempts with qualified_lead disposition but no lead
 * - call_sessions marked as AI qualified_lead with no lead
 */

import 'dotenv/config';
import { db } from './server/db';
import { 
  dialerCallAttempts, 
  callSessions, 
  leads, 
  contacts, 
  campaigns 
} from './shared/schema';
import { eq, sql, and, isNull } from 'drizzle-orm';

interface BackfillResult {
  callAttemptId: string;
  contactId: string;
  campaignId: string;
  leadId: string;
  source: 'dialer_call_attempts' | 'call_sessions';
}

async function backfillMissingLeads(): Promise<void> {
  console.log('=== Backfill Missing Qualified Leads ===\n');
  
  const results: BackfillResult[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  // Find qualified call attempts without leads
  console.log('Step 1: Finding qualified_lead call attempts without leads...');
  
  const missingLeadsFromAttempts = await db.execute(sql`
    SELECT 
      dca.id as call_attempt_id,
      dca.contact_id,
      dca.campaign_id,
      dca.phone_dialed,
      dca.recording_url,
      dca.call_duration_seconds,
      dca.notes,
      dca.human_agent_id,
      dca.call_session_id,
      dca.created_at,
      c.full_name,
      c.first_name,
      c.last_name,
      c.email,
      c.company_norm as company_name,
      cs.ai_transcript,
      cs.ai_analysis
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND dca.contact_id IS NOT NULL
      AND dca.campaign_id IS NOT NULL
    ORDER BY dca.created_at DESC
  `);

  console.log(`Found ${(missingLeadsFromAttempts as any).rows?.length || 0} call attempts missing leads\n`);

  // Process each missing lead
  for (const row of (missingLeadsFromAttempts as any).rows || []) {
    try {
      const contactName = row.full_name || 
        (row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : 
         row.first_name || row.last_name || 'Unknown');

      // Generate a unique lead ID
      const leadId = `backfill-${row.call_attempt_id}`;

      // Build notes from available data
      let notes = `[Backfilled Lead - Qualified Call Attempt]\n`;
      if (row.notes) {
        notes += `\nCall Notes: ${row.notes}`;
      }
      if (row.ai_analysis?.summary) {
        notes += `\n\nAI Summary: ${row.ai_analysis.summary}`;
      }

      // Insert the lead
      const [newLead] = await db.insert(leads).values({
        id: leadId,
        campaignId: row.campaign_id,
        contactId: row.contact_id,
        callAttemptId: row.call_attempt_id, // CRITICAL: Link to call attempt
        contactName: contactName,
        contactEmail: row.email || undefined,
        accountName: row.company_name || undefined,
        qaStatus: 'new',
        qaDecision: 'Backfilled from qualified call attempt - requires QA review',
        agentId: row.human_agent_id || undefined,
        dialedNumber: row.phone_dialed || undefined,
        recordingUrl: row.recording_url || undefined,
        callDuration: row.call_duration_seconds || undefined,
        transcript: row.ai_transcript || undefined,
        transcriptionStatus: row.ai_transcript ? 'completed' : 'pending',
        aiAnalysis: row.ai_analysis || undefined,
        notes: notes,
        createdAt: row.created_at || new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing().returning({ id: leads.id });

      if (newLead) {
        results.push({
          callAttemptId: row.call_attempt_id,
          contactId: row.contact_id,
          campaignId: row.campaign_id,
          leadId: newLead.id,
          source: 'dialer_call_attempts'
        });
        console.log(`✅ Created lead ${newLead.id} for call attempt ${row.call_attempt_id}`);
      } else {
        console.log(`⚠️ Lead already exists for call attempt ${row.call_attempt_id} (conflict)`);
      }
    } catch (error: any) {
      if (!error.message?.includes('duplicate key')) {
        errors.push({ id: row.call_attempt_id, error: error.message });
        console.error(`❌ Failed to create lead for ${row.call_attempt_id}:`, error.message);
      }
    }
  }

  // Also check call_sessions for AI qualified calls without leads
  console.log('\nStep 2: Finding AI qualified call_sessions without leads...');
  
  const missingLeadsFromSessions = await db.execute(sql`
    SELECT 
      cs.id as call_session_id,
      cs.contact_id,
      cs.campaign_id,
      cs.queue_item_id,
      cs.to_number_e164 as dialed_number,
      cs.ai_transcript,
      cs.ai_analysis,
      cs.ai_disposition,
      cs.started_at,
      cs.duration_sec,
      c.full_name,
      c.first_name,
      c.last_name,
      c.email,
      c.company_norm as company_name
    FROM call_sessions cs
    LEFT JOIN leads l ON l.id LIKE 'ai-' || cs.id || '%'
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN leads l2 ON l2.call_attempt_id = dca.id
    LEFT JOIN contacts c ON c.id = cs.contact_id
    WHERE cs.agent_type = 'ai'
      AND cs.ai_disposition IN ('qualified_lead', 'Qualified Lead', 'Meeting Booked')
      AND l.id IS NULL
      AND l2.id IS NULL
      AND cs.contact_id IS NOT NULL
      AND cs.campaign_id IS NOT NULL
    ORDER BY cs.started_at DESC
  `);

  console.log(`Found ${(missingLeadsFromSessions as any).rows?.length || 0} AI call sessions missing leads\n`);

  for (const row of (missingLeadsFromSessions as any).rows || []) {
    try {
      const contactName = row.full_name || 
        (row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : 
         row.first_name || row.last_name || 'Unknown');

      const leadId = `ai-${row.call_session_id}`;

      let notes = `[Backfilled Lead - AI Call Session]\n`;
      notes += `AI Disposition: ${row.ai_disposition}\n`;
      if (row.ai_analysis?.summary) {
        notes += `\nAI Summary: ${row.ai_analysis.summary}`;
      }

      const [newLead] = await db.insert(leads).values({
        id: leadId,
        campaignId: row.campaign_id,
        contactId: row.contact_id,
        contactName: contactName,
        contactEmail: row.email || undefined,
        accountName: row.company_name || undefined,
        qaStatus: 'new',
        qaDecision: 'Backfilled from AI qualified call session - requires QA review',
        dialedNumber: row.dialed_number || undefined,
        callDuration: row.duration_sec || undefined,
        transcript: row.ai_transcript || undefined,
        transcriptionStatus: row.ai_transcript ? 'completed' : 'pending',
        aiAnalysis: row.ai_analysis || undefined,
        notes: notes,
        customFields: {
          aiAgentCall: true,
          aiDisposition: row.ai_disposition,
          aiCallSessionId: row.call_session_id,
          backfilled: true,
        },
        createdAt: row.started_at || new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing().returning({ id: leads.id });

      if (newLead) {
        results.push({
          callAttemptId: row.call_session_id,
          contactId: row.contact_id,
          campaignId: row.campaign_id,
          leadId: newLead.id,
          source: 'call_sessions'
        });
        console.log(`✅ Created lead ${newLead.id} for call session ${row.call_session_id}`);
      }
    } catch (error: any) {
      if (!error.message?.includes('duplicate key')) {
        errors.push({ id: row.call_session_id, error: error.message });
        console.error(`❌ Failed to create lead for session ${row.call_session_id}:`, error.message);
      }
    }
  }

  // Summary
  console.log('\n=== Backfill Summary ===');
  console.log(`Total leads created: ${results.length}`);
  console.log(`  - From dialer_call_attempts: ${results.filter(r => r.source === 'dialer_call_attempts').length}`);
  console.log(`  - From call_sessions: ${results.filter(r => r.source === 'call_sessions').length}`);
  console.log(`Errors: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e.id}: ${e.error}`));
  }

  if (results.length > 0) {
    console.log('\nCreated leads:');
    results.forEach(r => console.log(`  - Lead ${r.leadId} | Contact: ${r.contactId} | Campaign: ${r.campaignId}`));
  }

  process.exit(0);
}

backfillMissingLeads().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
