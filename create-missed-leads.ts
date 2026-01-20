/**
 * Create leads for missed qualified opportunities
 * This script creates leads for contacts who showed clear positive engagement
 * but were incorrectly marked as not_interested
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { leads, callSessions, dialerCallAttempts } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface MissedLead {
  callSessionId: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactTitle: string;
  contactCompany: string;
  campaignId: string;
  dialerCallAttemptId: string;
  phone: string;
  reason: string;
}

const MISSED_LEADS: MissedLead[] = [
  {
    callSessionId: 'c21acdad-5d0b-4399-9771-4c5ce724a685',
    contactId: 'c3eb85f3-e9f0-4e7a-aa2a-00c1cf438a56',
    contactName: 'Julie Parrish',
    contactEmail: 'julie.parrish@corelight.com',
    contactTitle: 'Chief Marketing Officer',
    contactCompany: 'Corelight',
    campaignId: 'ff475cfd-2af3-4821-8d91-c62535cde2b1',
    dialerCallAttemptId: '1236812a-35b3-4e80-95c9-4f1934c20746',
    phone: '+14086212472',
    reason: 'Said "Yeah, yeah, yeah, go ahead" - clear positive engagement, call was cut off mid-pitch'
  }
];

async function createMissedLeads(): Promise<void> {
  console.log('='.repeat(140));
  console.log('CREATING LEADS FOR MISSED QUALIFIED OPPORTUNITIES');
  console.log('='.repeat(140));
  console.log();

  for (const missed of MISSED_LEADS) {
    console.log(`\n📞 Processing: ${missed.contactName} (${missed.contactTitle})`);
    console.log(`   Company: ${missed.contactCompany}`);
    console.log(`   Email: ${missed.contactEmail}`);
    console.log(`   Phone: ${missed.phone}`);
    console.log(`   Reason: ${missed.reason}`);

    // Check if lead already exists
    const existingLead = await db.execute(sql`
      SELECT id FROM leads
      WHERE contact_id = ${missed.contactId}
        AND campaign_id = ${missed.campaignId}
      LIMIT 1
    `);

    if ((existingLead as any).rows?.length > 0) {
      console.log(`   ℹ️  Lead already exists: ${(existingLead as any).rows[0].id}`);
      // Still update dispositions even if lead exists
    } else {
      // Create the lead (without call_attempt_id since it references a different table)
      const leadId = `ai-recovered-${missed.callSessionId}`;

      await db.execute(sql`
        INSERT INTO leads (
          id,
          contact_id,
          contact_name,
          contact_email,
          campaign_id,
          qa_status,
          notes,
          created_at,
          updated_at
        ) VALUES (
          ${leadId},
          ${missed.contactId},
          ${missed.contactName},
          ${missed.contactEmail},
          ${missed.campaignId},
          'new',
          ${`RECOVERED LEAD (Call: ${missed.callSessionId}): ${missed.reason}`},
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `);

      console.log(`   ✅ Lead created: ${leadId}`);
    }

    // Update the call session disposition to qualified_lead
    await db.execute(sql`
      UPDATE call_sessions
      SET ai_disposition = 'qualified_lead'
      WHERE id = ${missed.callSessionId}
    `);
    console.log(`   ✅ Call session disposition updated to: qualified_lead`);

    // Update the dialer call attempt disposition
    await db.execute(sql`
      UPDATE dialer_call_attempts
      SET disposition = 'qualified_lead'
      WHERE id = ${missed.dialerCallAttemptId}
    `);
    console.log(`   ✅ Dialer call attempt disposition updated to: qualified_lead`);
  }

  // Verify the changes
  console.log('\n' + '='.repeat(140));
  console.log('VERIFICATION');
  console.log('='.repeat(140));

  for (const missed of MISSED_LEADS) {
    const verification = await db.execute(sql`
      SELECT
        l.id as "leadId",
        l.contact_name as "contactName",
        l.qa_status as "qaStatus",
        l.notes,
        cs.ai_disposition as "aiDisposition",
        dca.disposition::text as "dialerDisposition"
      FROM leads l
      LEFT JOIN call_sessions cs ON cs.id = ${missed.callSessionId}
      LEFT JOIN dialer_call_attempts dca ON dca.id = ${missed.dialerCallAttemptId}
      WHERE l.contact_id = ${missed.contactId}
        AND l.campaign_id = ${missed.campaignId}
    `);

    const result = (verification as any).rows?.[0];
    if (result) {
      console.log(`\n✅ ${result.contactName}:`);
      console.log(`   Lead ID:           ${result.leadId}`);
      console.log(`   QA Status:         ${result.qaStatus}`);
      console.log(`   AI Disposition:    ${result.aiDisposition}`);
      console.log(`   Dialer Disp:       ${result.dialerDisposition}`);
      console.log(`   Notes:             ${result.notes}`);
    } else {
      console.log(`\n❌ Could not verify lead for ${missed.contactName}`);
    }
  }

  console.log('\n' + '='.repeat(140));
  console.log('DONE');
  console.log('='.repeat(140));
  console.log(`
Created ${MISSED_LEADS.length} leads for missed qualified opportunities.

These contacts showed clear positive engagement during calls but were
incorrectly marked as "not_interested" due to bugs in the disposition engine.

The bug fixes have been applied to telnyx-ai-bridge.ts and unified-disposition.ts
to prevent this from happening in the future.
  `);

  process.exit(0);
}

createMissedLeads().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
