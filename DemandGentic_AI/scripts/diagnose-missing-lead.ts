/**
 * Diagnose Missing Lead Script
 *
 * Finds calls marked as qualified_lead that don't have corresponding lead records
 *
 * Usage: npx tsx scripts/diagnose-missing-lead.ts [campaignId]
 */

import { db } from '../server/db';
import { dialerCallAttempts, leads, callSessions, campaigns, contacts } from '../shared/schema';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';

const campaignIdFilter = process.argv[2] || null;

async function diagnose() {
  console.log('\n========================================');
  console.log('  MISSING LEAD DIAGNOSTIC');
  console.log('========================================\n');

  // 1. Find all calls marked as qualified_lead
  const qualifiedCalls = await db
    .select({
      id: dialerCallAttempts.id,
      campaignId: dialerCallAttempts.campaignId,
      contactId: dialerCallAttempts.contactId,
      disposition: dialerCallAttempts.disposition,
      dispositionProcessed: dialerCallAttempts.dispositionProcessed,
      connected: dialerCallAttempts.connected,
      callDurationSeconds: dialerCallAttempts.callDurationSeconds,
      callStartedAt: dialerCallAttempts.callStartedAt,
      callEndedAt: dialerCallAttempts.callEndedAt,
      phoneDialed: dialerCallAttempts.phoneDialed,
      callSessionId: dialerCallAttempts.callSessionId,
      recordingUrl: dialerCallAttempts.recordingUrl,
      createdAt: dialerCallAttempts.createdAt,
    })
    .from(dialerCallAttempts)
    .where(
      and(
        eq(dialerCallAttempts.disposition, 'qualified_lead'),
        campaignIdFilter ? eq(dialerCallAttempts.campaignId, campaignIdFilter) : sql`1=1`
      )
    )
    .orderBy(desc(dialerCallAttempts.createdAt))
    .limit(20);

  console.log(`Found ${qualifiedCalls.length} calls with disposition = 'qualified_lead'\n`);

  if (qualifiedCalls.length === 0) {
    // Check call_sessions for qualified_lead
    console.log('Checking call_sessions table...\n');

    const qualifiedSessions = await db
      .select({
        id: callSessions.id,
        campaignId: callSessions.campaignId,
        aiDisposition: callSessions.aiDisposition,
        contactName: callSessions.contactName,
        duration: callSessions.duration,
        createdAt: callSessions.createdAt,
      })
      .from(callSessions)
      .where(
        and(
          eq(callSessions.aiDisposition, 'qualified_lead'),
          campaignIdFilter ? eq(callSessions.campaignId, campaignIdFilter) : sql`1=1`
        )
      )
      .orderBy(desc(callSessions.createdAt))
      .limit(10);

    if (qualifiedSessions.length > 0) {
      console.log(`Found ${qualifiedSessions.length} sessions with aiDisposition = 'qualified_lead' in call_sessions:\n`);
      for (const session of qualifiedSessions) {
        console.log(`  Session ID: ${session.id}`);
        console.log(`  Campaign: ${session.campaignId}`);
        console.log(`  Contact: ${session.contactName}`);
        console.log(`  Duration: ${session.duration}s`);
        console.log(`  Created: ${session.createdAt}`);
        console.log('  ---');
      }

      console.log('\n⚠️  PROBLEM IDENTIFIED:');
      console.log('   Qualified calls exist in call_sessions but NOT in dialer_call_attempts.');
      console.log('   This means the AI marked the call as qualified but the disposition was');
      console.log('   not synced to dialer_call_attempts where lead creation happens.\n');

      console.log('🔧 POSSIBLE CAUSES:');
      console.log('   1. call_session was updated but dialer_call_attempts was not');
      console.log('   2. processDisposition() was never called');
      console.log('   3. The call ended before disposition could be processed\n');

      // Check if there's a matching dialer_call_attempt
      for (const session of qualifiedSessions) {
        const [matchingAttempt] = await db
          .select({
            id: dialerCallAttempts.id,
            disposition: dialerCallAttempts.disposition,
            dispositionProcessed: dialerCallAttempts.dispositionProcessed,
          })
          .from(dialerCallAttempts)
          .where(eq(dialerCallAttempts.callSessionId, session.id))
          .limit(1);

        if (matchingAttempt) {
          console.log(`  Session ${session.id} → dialer_call_attempt ${matchingAttempt.id}`);
          console.log(`    Disposition in DCA: ${matchingAttempt.disposition || 'NULL'}`);
          console.log(`    Disposition Processed: ${matchingAttempt.dispositionProcessed}`);
        } else {
          console.log(`  Session ${session.id} → NO matching dialer_call_attempt found!`);
        }
      }
    } else {
      console.log('No qualified calls found in either table.');
    }
    return;
  }

  // 2. For each qualified call, check if a lead exists
  console.log('Checking for missing leads...\n');

  for (const call of qualifiedCalls) {
    const [existingLead] = await db
      .select({ id: leads.id, qaStatus: leads.qaStatus })
      .from(leads)
      .where(eq(leads.callAttemptId, call.id))
      .limit(1);

    const [contact] = await db
      .select({ fullName: contacts.fullName, email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, call.contactId))
      .limit(1);

    const status = existingLead ? '✅ LEAD EXISTS' : '❌ MISSING LEAD';

    console.log(`${status}`);
    console.log(`  Call Attempt ID: ${call.id}`);
    console.log(`  Contact: ${contact?.fullName || 'Unknown'} (${contact?.email || 'no email'})`);
    console.log(`  Phone: ${call.phoneDialed}`);
    console.log(`  Duration: ${call.callDurationSeconds || 0}s`);
    console.log(`  Connected: ${call.connected}`);
    console.log(`  Disposition Processed: ${call.dispositionProcessed}`);
    console.log(`  Call Started: ${call.callStartedAt}`);
    console.log(`  Call Ended: ${call.callEndedAt}`);
    console.log(`  Recording: ${call.recordingUrl || 'none'}`);

    if (existingLead) {
      console.log(`  Lead ID: ${existingLead.id}`);
      console.log(`  Lead QA Status: ${existingLead.qaStatus}`);
    }
    console.log('');

    if (!existingLead && call.dispositionProcessed === false) {
      console.log('  ⚠️  Disposition not processed! This is why no lead was created.');
      console.log('     Run: processDisposition() for this call attempt to create the lead.\n');
    }

    if (!existingLead && call.dispositionProcessed === true) {
      console.log('  🐛 BUG: Disposition was processed but no lead was created!');
      console.log('     Check the disposition-engine logs for errors.\n');
    }
  }

  // 3. Summary
  const missingLeads = [];
  for (const call of qualifiedCalls) {
    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.callAttemptId, call.id))
      .limit(1);

    if (!existingLead) {
      missingLeads.push(call);
    }
  }

  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================');
  console.log(`  Total qualified calls: ${qualifiedCalls.length}`);
  console.log(`  Missing leads: ${missingLeads.length}`);
  console.log(`  Existing leads: ${qualifiedCalls.length - missingLeads.length}`);

  if (missingLeads.length > 0) {
    console.log('\n  MISSING LEAD CALL ATTEMPT IDs:');
    for (const call of missingLeads) {
      console.log(`    - ${call.id} (dispositionProcessed: ${call.dispositionProcessed})`);
    }

    console.log('\n  🔧 TO FIX:');
    console.log('     Run the following to create missing leads:');
    console.log('     npx tsx scripts/fix-missing-leads.ts');
  }
}

diagnose()
  .then(() => {
    console.log('\nDiagnostic complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error running diagnostic:', error);
    process.exit(1);
  });