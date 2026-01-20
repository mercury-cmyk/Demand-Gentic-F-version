/**
 * Script to find and create AI calls that were qualified but didn't get leads created.
 */
import { pool } from './server/db';
import { storage } from './server/storage';

async function findAndCreateMissedQualifiedLeads() {
  console.log('=== Finding and Creating Missed Qualified Leads ===\n');

  // 1. Find call attempts with qualified dispositions that don't have leads
  console.log('Searching for qualified call attempts without leads...\n');

  const missedLeadsQuery = `
    SELECT 
      dca.id as attempt_id,
      dca.campaign_id,
      dca.contact_id,
      dca.disposition,
      dca.call_duration_seconds as call_duration,
      dca.telnyx_call_id,
      dca.created_at,
      dca.call_ended_at,
      dca.notes,
      c.full_name as contact_name,
      c.email as contact_email,
      a.name as company_name,
      c.account_id,
      cam.name as campaign_name
    FROM dialer_call_attempts dca
    JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    JOIN campaigns cam ON cam.id = dca.campaign_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE 
      (dca.disposition = 'qualified_lead' 
       OR dca.notes ILIKE '%qualified_lead%'
       OR dca.notes ILIKE '%qualified%lead%')
      AND l.id IS NULL
      AND dca.created_at > NOW() - INTERVAL '30 days'
    ORDER BY dca.created_at DESC
  `;

  const missedLeads = await pool.query(missedLeadsQuery);

  console.log(`Found ${missedLeads.rows.length} potential missed qualified leads to create.\n`);

  if (missedLeads.rows.length === 0) {
    console.log('No missed leads found to create.');
    process.exit(0);
  }

  // Create the leads
  let createdCount = 0;
  for (const row of missedLeads.rows) {
    console.log(`---`);
    console.log(`Creating lead for Attempt ID: ${row.attempt_id}`);
    console.log(`  Campaign: ${row.campaign_name}`);
    console.log(`  Contact: ${row.contact_name} (${row.contact_email})`);

    try {
      await storage.createLead({
        campaignId: row.campaign_id,
        contactId: row.contact_id,
        contactName: row.contact_name,
        contactEmail: row.contact_email || undefined,
        companyName: row.company_name || undefined,
        callAttemptId: row.attempt_id,
        agentId: null, // AI Agent
        qaStatus: "new",
        notes: row.notes || '[AI Backfill] Notes not available.',
        callDuration: row.call_duration,
        telnyxCallId: row.telnyx_call_id,
        customFields: {
          backfilledFrom: 'find-missed-qualified-leads.ts',
          originalDisposition: row.disposition,
        },
      });
      console.log(`  ✅ Lead created successfully.`);
      createdCount++;
    } catch (error) {
      console.error(`  ❌ Failed to create lead for attempt ${row.attempt_id}:`, error);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total missed qualified leads found: ${missedLeads.rows.length}`);
  console.log(`Successfully created ${createdCount} new leads.`);

  process.exit(0);
}

findAndCreateMissedQualifiedLeads().catch(console.error);
