import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { leads } from './shared/schema';

async function addJordanRadewanLead() {
  console.log('========================================');
  console.log('ADD QUALIFIED LEAD - Jordan Radewan');
  console.log('========================================\n');

  const DRY_RUN = process.argv.includes('--execute') ? false : true;

  if (DRY_RUN) {
    console.log('DRY RUN MODE - No changes will be made');
    console.log('   Run with --execute flag to apply changes\n');
  } else {
    console.log('EXECUTE MODE - Changes WILL be applied\n');
  }

  // Call attempt ID from the visibility report
  const callAttemptId = '3e4024c3-c1a7-49f9-afde-bd37a23d0880';

  // Look up the call attempt and contact details
  const callData = await db.execute(sql`
    SELECT
      dca.id as call_attempt_id,
      dca.contact_id,
      dca.campaign_id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.notes,
      dca.recording_url,
      dca.telnyx_call_id,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.email,
      c.direct_phone as phone,
      c.job_title,
      c.account_id,
      a.name as company_name,
      a.industry_standardized as company_industry
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.id = ${callAttemptId}
  `);

  if (callData.rows.length === 0) {
    console.log('Call attempt not found. Trying by phone number...\n');

    const phoneData = await db.execute(sql`
      SELECT
        dca.id as call_attempt_id,
        dca.contact_id,
        dca.campaign_id,
        dca.disposition,
        dca.call_duration_seconds,
        dca.notes,
        dca.recording_url,
        dca.telnyx_call_id,
        dca.created_at,
        c.first_name,
        c.last_name,
        c.email,
        c.direct_phone as phone,
        c.job_title,
        c.account_id,
        a.name as company_name,
        a.industry_standardized as company_industry
      FROM dialer_call_attempts dca
      LEFT JOIN contacts c ON c.id = dca.contact_id
      LEFT JOIN accounts a ON a.id = c.account_id
      WHERE dca.phone_dialed = '+17205524216'
        AND dca.created_at::date = '2026-02-11'
      ORDER BY dca.created_at DESC
      LIMIT 1
    `);

    if (phoneData.rows.length === 0) {
      console.log('No call attempt found for +17205524216 on Feb 11, 2026');
      console.log('Creating lead with manual data...\n');

      if (!DRY_RUN) {
        const [newLead] = await db.insert(leads).values({
          contactName: 'Jordan Radewan',
          dialedNumber: '+17205524216',
          qaStatus: 'new',
          notes: 'Top Qualified Lead - Requested Callback. Date: Feb 11, 2026, 22:14.',
        }).returning();

        console.log(`Created lead: ${newLead.id}\n`);
      } else {
        console.log('Would create lead with manual data for Jordan Radewan\n');
      }

      process.exit(0);
      return;
    }

    callData.rows = phoneData.rows;
  }

  const r = callData.rows[0] as any;

  console.log('Found call attempt:');
  console.log(`   Name: ${r.first_name} ${r.last_name}`);
  console.log(`   Email: ${r.email || 'N/A'}`);
  console.log(`   Phone: ${r.phone || '+17205524216'}`);
  console.log(`   Company: ${r.company_name || 'N/A'}`);
  console.log(`   Industry: ${r.company_industry || 'N/A'}`);
  console.log(`   Title: ${r.job_title || 'N/A'}`);
  console.log(`   Duration: ${r.call_duration_seconds}s`);
  console.log(`   Disposition: ${r.disposition}`);
  console.log(`   Contact ID: ${r.contact_id}`);
  console.log(`   Campaign ID: ${r.campaign_id}`);
  console.log(`   Call Attempt ID: ${r.call_attempt_id}\n`);

  // Check if lead already exists
  const existingLead = await db.execute(sql`
    SELECT id FROM leads
    WHERE call_attempt_id = ${r.call_attempt_id}
       OR (contact_id = ${r.contact_id} AND contact_id IS NOT NULL)
    LIMIT 1
  `);

  if (existingLead.rows.length > 0) {
    console.log(`Lead already exists: ${(existingLead.rows[0] as any).id} - SKIPPING\n`);
    process.exit(0);
    return;
  }

  if (!DRY_RUN) {
    try {
      const contactName = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Jordan Radewan';

      const [newLead] = await db.insert(leads).values({
        contactId: r.contact_id || undefined,
        contactName: contactName,
        contactEmail: r.email || undefined,
        campaignId: r.campaign_id || undefined,
        callAttemptId: r.call_attempt_id,
        recordingUrl: r.recording_url || undefined,
        callDuration: r.call_duration_seconds || 40,
        dialedNumber: '+17205524216',
        telnyxCallId: r.telnyx_call_id || undefined,
        accountName: r.company_name || undefined,
        accountIndustry: r.company_industry || undefined,
        qaStatus: 'new',
        notes: 'Top Qualified Lead - Requested Callback. Date: Feb 11, 2026, 22:14.',
      }).returning();

      console.log(`Created lead: ${newLead.id}`);

      // Link the call attempt to this lead
      await db.execute(sql`
        UPDATE dialer_call_attempts
        SET lead_id = ${newLead.id}, updated_at = NOW()
        WHERE id = ${r.call_attempt_id}
      `);
      console.log(`Linked to call attempt: ${r.call_attempt_id}\n`);
    } catch (err: any) {
      console.log(`Error creating lead: ${err.message}\n`);
    }
  } else {
    console.log('Would create lead for Jordan Radewan with above details\n');
  }

  // Show current lead count
  const totalLeads = await db.execute(sql`SELECT COUNT(*) as total FROM leads`);
  console.log(`\nTotal leads in database: ${(totalLeads.rows[0] as any)?.total}`);

  if (DRY_RUN) {
    console.log('\nTo apply changes, run:');
    console.log('   npx tsx add-jordan-radewan-lead.ts --execute');
  }

  process.exit(0);
}

addJordanRadewanLead().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
