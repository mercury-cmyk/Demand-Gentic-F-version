/**
 * Fix Missing Leads Script
 *
 * Creates lead records for calls marked as qualified_lead that don't have leads
 *
 * Usage: npx tsx scripts/fix-missing-leads.ts [campaignId]
 */

import { db } from '../server/db';
import { dialerCallAttempts, leads, callSessions, contacts, qcWorkQueue } from '../shared/schema';
import { eq, and, isNull, desc, sql, notInArray } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');
// Get campaign ID filter from args (skip --dry-run flag)
const campaignIdFilter = process.argv.slice(2).find(arg => !arg.startsWith('--')) || null;

async function fixMissingLeads() {
  console.log('\n========================================');
  console.log('  FIX MISSING LEADS');
  console.log(DRY_RUN ? '  (DRY RUN - no changes will be made)' : '');
  console.log('========================================\n');

  // Use raw SQL to get qualified calls without leads (more reliable)
  const campaignFilter = campaignIdFilter ? sql`AND dca.campaign_id = ${campaignIdFilter}` : sql``;
  
  const qualifiedCallsWithoutLeads = await db.execute(sql`
    SELECT 
      dca.id,
      dca.campaign_id as "campaignId",
      dca.contact_id as "contactId",
      dca.call_session_id as "callSessionId",
      dca.call_duration_seconds as "callDurationSeconds",
      dca.phone_dialed as "phoneDialed",
      dca.recording_url as "recordingUrl",
      dca.human_agent_id as "humanAgentId",
      dca.disposition_processed as "dispositionProcessed"
    FROM dialer_call_attempts dca
    WHERE dca.disposition = 'qualified_lead'
      AND NOT EXISTS (
        SELECT 1 FROM leads l WHERE l.call_attempt_id = dca.id
      )
      ${campaignFilter}
    ORDER BY dca.created_at DESC
  `);

  const calls = qualifiedCallsWithoutLeads.rows as Array<{
    id: string;
    campaignId: string;
    contactId: string;
    callSessionId: string | null;
    callDurationSeconds: number | null;
    phoneDialed: string;
    recordingUrl: string | null;
    humanAgentId: string | null;
    dispositionProcessed: boolean;
  }>;

  console.log(`Found ${calls.length} qualified calls without leads\n`);

  if (calls.length === 0) {
    console.log('All qualified calls have corresponding leads. Nothing to fix.');
    return;
  }

  let created = 0;
  let failed = 0;

  for (const call of calls) {
    // Get contact info (companyName is on accounts table, not contacts)
    const [contact] = await db
      .select({
        fullName: contacts.fullName,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        accountId: contacts.accountId,
      })
      .from(contacts)
      .where(eq(contacts.id, call.contactId))
      .limit(1);

    const contactName = contact?.fullName ||
      (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}` :
        contact?.firstName || contact?.lastName || 'Unknown');

    // Determine QA status based on call duration
    const MINIMUM_DURATION = 30;
    const isShortCall = (call.callDurationSeconds || 0) < MINIMUM_DURATION;
    const qaStatus = isShortCall ? 'under_review' : 'new';
    const qaDecision = isShortCall
      ? `⚠️ SHORT DURATION: Call was only ${call.callDurationSeconds}s. Created via fix script.`
      : 'Created via fix-missing-leads script';

    console.log(`Processing: ${contactName} (${call.phoneDialed})`);
    console.log(`  Call Attempt: ${call.id}`);
    console.log(`  Duration: ${call.callDurationSeconds || 0}s`);
    console.log(`  QA Status: ${qaStatus}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would create lead\n`);
      created++;
      continue;
    }

    try {
      // Create lead
      const [newLead] = await db
        .insert(leads)
        .values({
          campaignId: call.campaignId,
          contactId: call.contactId,
          callAttemptId: call.id,
          contactName: contactName,
          contactEmail: contact?.email || undefined,
          qaStatus: qaStatus,
          qaDecision: qaDecision,
          agentId: call.humanAgentId,
          dialedNumber: call.phoneDialed,
          recordingUrl: call.recordingUrl,
          callDuration: call.callDurationSeconds,
        })
        .returning({ id: leads.id });

      if (newLead) {
        console.log(`  ✅ Created lead: ${newLead.id}`);

        // Mark disposition as processed if it wasn't
        if (!call.dispositionProcessed) {
          await db
            .update(dialerCallAttempts)
            .set({
              dispositionProcessed: true,
              dispositionProcessedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(dialerCallAttempts.id, call.id));
          console.log(`  ✅ Marked disposition as processed`);
        }

        // Add to QC queue
        try {
          await db.insert(qcWorkQueue).values({
            callSessionId: call.callSessionId,
            leadId: newLead.id,
            campaignId: call.campaignId,
            producerType: 'ai',
            status: 'pending',
            priority: isShortCall ? -1 : 0,
          });
          console.log(`  ✅ Added to QC queue`);
        } catch (qcErr) {
          console.log(`  ⚠️ Failed to add to QC queue (may already exist)`);
        }

        created++;
      }
    } catch (error) {
      console.log(`  ❌ Failed to create lead: ${error}`);
      failed++;
    }

    console.log('');
  }

  console.log('========================================');
  console.log('  RESULTS');
  console.log('========================================');
  console.log(`  Leads created: ${created}`);
  console.log(`  Failed: ${failed}`);

  if (DRY_RUN) {
    console.log('\n  To actually create the leads, run without --dry-run');
  }
}

fixMissingLeads()
  .then(() => {
    console.log('\nFix complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
