/**
 * Deep investigation of the 18 voicemail leads
 */
import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  console.log('='.repeat(80));
  console.log('DETAILED VOICEMAIL LEADS INVESTIGATION');
  console.log('='.repeat(80));
  console.log();

  // Check all leads created in last 7 days with their source disposition
  const allLeads = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      l.contact_name,
      l.account_name,
      l.qa_status,
      l.created_at as lead_created,
      l.call_attempt_id,
      dca.disposition as call_disposition,
      dca.voicemail_detected,
      dca.call_duration_seconds,
      camp.name as campaign
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    LEFT JOIN campaigns camp ON camp.id = l.campaign_id
    WHERE l.created_at >= ${startDate.toISOString()}
      AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC
  `);

  console.log(`Total leads in last 7 days: ${allLeads.rows.length}`);
  console.log();

  // Group by disposition
  const byDisposition: Record<string, any[]> = {};
  
  for (const row of allLeads.rows as any[]) {
    const disp = row.call_disposition || 'NULL';
    if (!byDisposition[disp]) {
      byDisposition[disp] = [];
    }
    byDisposition[disp].push(row);
  }

  console.log('Leads by Source Call Disposition:');
  console.log('-'.repeat(60));
  for (const [disp, leads] of Object.entries(byDisposition)) {
    console.log(`${disp}: ${leads.length} leads`);
  }
  console.log();

  // Find problematic leads (voicemail, no_answer, or voicemail_detected)
  const problematicLeads = (allLeads.rows as any[]).filter(row => {
    const disp = (row.call_disposition || '').toLowerCase();
    return disp.includes('voicemail') || 
           disp.includes('no_answer') || 
           row.voicemail_detected === true;
  });

  console.log(`PROBLEMATIC LEADS (voicemail/no_answer/vm_detected): ${problematicLeads.length}`);
  console.log('-'.repeat(80));

  for (const row of problematicLeads) {
    console.log(`\n❌ ${row.contact_name} @ ${row.account_name}`);
    console.log(`   Lead ID: ${row.lead_id}`);
    console.log(`   Call Attempt ID: ${row.call_attempt_id}`);
    console.log(`   Disposition: ${row.call_disposition}`);
    console.log(`   Voicemail Detected: ${row.voicemail_detected}`);
    console.log(`   Duration: ${row.call_duration_seconds}s`);
    console.log(`   QA Status: ${row.qa_status}`);
    console.log(`   Campaign: ${row.campaign}`);
  }

  // Now check the first analysis approach - joining via contact_id and campaign_id
  console.log();
  console.log('='.repeat(80));
  console.log('ALTERNATIVE CHECK: Leads matched via contact_id + campaign_id');
  console.log('='.repeat(80));
  console.log();

  const altCheck = await db.execute(sql`
    SELECT 
      l.id as lead_id,
      l.contact_name,
      l.account_name,
      l.created_at as lead_created,
      dca.id as dca_id,
      dca.disposition,
      dca.voicemail_detected,
      dca.call_duration_seconds,
      camp.name as campaign
    FROM leads l
    JOIN contacts c ON c.id = l.contact_id
    JOIN dialer_call_attempts dca ON dca.contact_id = c.id AND dca.campaign_id = l.campaign_id
    JOIN campaigns camp ON camp.id = l.campaign_id
    WHERE l.created_at >= ${startDate.toISOString()}
      AND l.deleted_at IS NULL
      AND (dca.disposition IN ('voicemail', 'no_answer') OR dca.voicemail_detected = true)
    ORDER BY l.created_at DESC
  `);

  console.log(`Leads with voicemail/no_answer calls (via contact match): ${altCheck.rows.length}`);

  for (const row of altCheck.rows as any[]) {
    console.log(`\n⚠️ ${row.contact_name} @ ${row.account_name}`);
    console.log(`   Lead ID: ${row.lead_id}`);
    console.log(`   Matching Call ID: ${row.dca_id}`);
    console.log(`   Call Disposition: ${row.disposition}`);
    console.log(`   VM Detected: ${row.voicemail_detected}`);
    console.log(`   Duration: ${row.call_duration_seconds}s`);
    console.log(`   Campaign: ${row.campaign}`);
  }

  console.log();
  console.log('='.repeat(80));
  console.log('ANALYSIS COMPLETE');
  console.log('='.repeat(80));

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
