import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { leads } from './shared/schema';

async function addJan15Leads() {
  console.log('========================================');
  console.log('ADD JAN 15 QUALIFIED LEADS');
  console.log('========================================\n');

  const DRY_RUN = process.argv.includes('--execute') ? false : true;

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('   Run with --execute flag to apply changes\n');
  } else {
    console.log('⚠️  EXECUTE MODE - Changes WILL be applied\n');
  }

  // Get the qualified lead and not_interested calls from Jan 15 that have actual conversations
  const leadsToAdd = await db.execute(sql`
    SELECT
      dca.id as call_attempt_id,
      dca.contact_id,
      dca.campaign_id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.notes,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.email,
      c.job_title,
      c.account_id,
      a.name as company_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.disposition IN ('qualified_lead', 'not_interested')
      AND dca.call_duration_seconds > 0
    ORDER BY dca.disposition, dca.created_at DESC
  `);

  console.log(`Found ${leadsToAdd.rows.length} leads to add:\n`);

  for (const row of leadsToAdd.rows) {
    const r = row as any;
    console.log(`📞 ${r.disposition.toUpperCase()}`);
    console.log(`   Name: ${r.first_name} ${r.last_name}`);
    console.log(`   Email: ${r.email || 'N/A'}`);
    console.log(`   Company: ${r.company_name || 'N/A'}`);
    console.log(`   Title: ${r.job_title || 'N/A'}`);
    console.log(`   Duration: ${r.call_duration_seconds}s`);
    console.log(`   Contact ID: ${r.contact_id}`);
    console.log(`   Campaign ID: ${r.campaign_id}`);

    // Check if lead already exists for this contact
    const existingLead = await db.execute(sql`
      SELECT id FROM leads WHERE contact_id = ${r.contact_id} LIMIT 1
    `);

    if (existingLead.rows.length > 0) {
      console.log(`   ⚠️  Lead already exists for this contact - SKIPPING\n`);
      continue;
    }

    if (!DRY_RUN) {
      try {
        const [newLead] = await db.insert(leads).values({
          contactId: r.contact_id,
          campaignId: r.campaign_id,
          accountId: r.account_id || undefined,
          qaStatus: 'new',
          transcript: r.notes || undefined,
        }).returning();

        console.log(`   ✅ Created lead: ${newLead.id}\n`);

        // Update the dialer_call_attempts to link to the lead
        await db.execute(sql`
          UPDATE dialer_call_attempts
          SET lead_id = ${newLead.id}, updated_at = NOW()
          WHERE id = ${r.call_attempt_id}
        `);
        console.log(`   ✅ Linked to call attempt\n`);
      } catch (err: any) {
        console.log(`   ❌ Error creating lead: ${err.message}\n`);
      }
    } else {
      console.log(`   Would create lead for this contact\n`);
    }
  }

  // Final count
  console.log('\n========================================');
  console.log('CURRENT LEADS COUNT');
  console.log('========================================');

  const totalLeads = await db.execute(sql`
    SELECT COUNT(*) as total FROM leads
  `);
  console.log(`Total leads in database: ${(totalLeads.rows[0] as any)?.total}`);

  const recentLeads = await db.execute(sql`
    SELECT
      l.id,
      c.first_name,
      c.last_name,
      l.qa_status,
      l.created_at
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    ORDER BY l.created_at DESC
    LIMIT 5
  `);

  console.log('\nMost recent leads:');
  for (const row of recentLeads.rows) {
    const r = row as any;
    const date = r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : 'N/A';
    console.log(`  ${date} | ${r.first_name} ${r.last_name} | qa_status=${r.qa_status}`);
  }

  if (DRY_RUN) {
    console.log('\n💡 To apply these changes, run:');
    console.log('   npx tsx add-jan15-leads.ts --execute');
  }

  process.exit(0);
}

addJan15Leads().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});