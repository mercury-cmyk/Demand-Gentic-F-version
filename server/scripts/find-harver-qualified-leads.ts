/**
 * Find all 10 qualified leads from the "Harver Appointment Gen" campaign
 *
 * Searches both:
 * 1. leads table (already created leads)
 * 2. dialerCallAttempts + callSessions with disposition='qualified_lead' (in case some weren't created)
 *
 * Usage: npx tsx server/scripts/find-harver-qualified-leads.ts
 */

import { db } from "../db";
import {
  campaigns,
  leads,
  dialerCallAttempts,
  callSessions,
  contacts,
  accounts,
} from "@shared/schema";
import { eq, and, ilike, or, sql } from "drizzle-orm";

async function main() {
  // Step 1: Find the Harver campaign
  console.log("=== Finding Harver Appointment Gen Campaign ===\n");

  const matchingCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.type,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(ilike(campaigns.name, "%harver%"));

  if (matchingCampaigns.length === 0) {
    console.log("No campaigns found matching 'harver'!");
    process.exit(1);
  }

  for (const c of matchingCampaigns) {
    console.log(`Campaign: "${c.name}" (${c.id}) | Type: ${c.type} | Status: ${c.status}`);
  }

  const campaignId = matchingCampaigns[0].id;
  const campaignName = matchingCampaigns[0].name;
  console.log(`\nUsing campaign: "${campaignName}" (${campaignId})\n`);

  // Step 2: Find leads already in the leads table
  console.log("=== Leads in leads table ===\n");

  const existingLeads = await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      contactEmail: leads.contactEmail,
      accountName: leads.accountName,
      qaStatus: leads.qaStatus,
      aiQualificationStatus: leads.aiQualificationStatus,
      dialedNumber: leads.dialedNumber,
      callDuration: leads.callDuration,
      telnyxCallId: leads.telnyxCallId,
      callAttemptId: leads.callAttemptId,
      createdAt: leads.createdAt,
      notes: leads.notes,
      transcript: leads.transcript,
    })
    .from(leads)
    .where(eq(leads.campaignId, campaignId))
    .orderBy(leads.createdAt);

  console.log(`Found ${existingLeads.length} leads in leads table:\n`);

  for (let i = 0; i < existingLeads.length; i++) {
    const lead = existingLeads[i];
    console.log(`--- Lead ${i + 1} ---`);
    console.log(`  ID:              ${lead.id}`);
    console.log(`  Contact:         ${lead.contactName || 'N/A'}`);
    console.log(`  Email:           ${lead.contactEmail || 'N/A'}`);
    console.log(`  Company:         ${lead.accountName || 'N/A'}`);
    console.log(`  QA Status:       ${lead.qaStatus || 'N/A'}`);
    console.log(`  AI Qualification:${lead.aiQualificationStatus || 'N/A'}`);
    console.log(`  Phone Dialed:    ${lead.dialedNumber || 'N/A'}`);
    console.log(`  Call Duration:   ${lead.callDuration || 0}s`);
    console.log(`  Telnyx Call ID:  ${lead.telnyxCallId || 'N/A'}`);
    console.log(`  Call Attempt ID: ${lead.callAttemptId || 'N/A'}`);
    console.log(`  Created:         ${lead.createdAt?.toISOString() || 'N/A'}`);
    console.log(`  Notes:           ${lead.notes || 'N/A'}`);
    if (lead.transcript) {
      const preview = lead.transcript.substring(0, 200);
      console.log(`  Transcript:      ${preview}${lead.transcript.length > 200 ? '...' : ''}`);
    }
    console.log();
  }

  // Step 3: Find qualified dispositions from dialerCallAttempts
  console.log("\n=== Qualified dispositions in dialer_call_attempts ===\n");

  const qualifiedAttempts = await db
    .select({
      id: dialerCallAttempts.id,
      contactId: dialerCallAttempts.contactId,
      disposition: dialerCallAttempts.disposition,
      telnyxCallId: dialerCallAttempts.telnyxCallId,
      callDuration: dialerCallAttempts.callDurationSeconds,
      phoneDialed: dialerCallAttempts.phoneDialed,
      connected: dialerCallAttempts.connected,
      notes: dialerCallAttempts.notes,
      createdAt: dialerCallAttempts.createdAt,
    })
    .from(dialerCallAttempts)
    .where(
      and(
        eq(dialerCallAttempts.campaignId, campaignId),
        eq(dialerCallAttempts.disposition, "qualified_lead")
      )
    )
    .orderBy(dialerCallAttempts.createdAt);

  console.log(`Found ${qualifiedAttempts.length} qualified_lead dispositions in dialer_call_attempts:\n`);

  for (let i = 0; i < qualifiedAttempts.length; i++) {
    const attempt = qualifiedAttempts[i];

    // Get contact details
    let contactName = "Unknown";
    let contactEmail = "N/A";
    let companyName = "N/A";

    if (attempt.contactId) {
      const [contact] = await db
        .select({
          fullName: contacts.fullName,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          jobTitle: contacts.jobTitle,
          companyName: accounts.name,
        })
        .from(contacts)
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(eq(contacts.id, attempt.contactId))
        .limit(1);

      if (contact) {
        contactName = contact.fullName ||
          [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";
        contactEmail = contact.email || "N/A";
        companyName = contact.companyName || "N/A";
      }
    }

    console.log(`--- Qualified Call Attempt ${i + 1} ---`);
    console.log(`  Attempt ID:      ${attempt.id}`);
    console.log(`  Contact:         ${contactName}`);
    console.log(`  Email:           ${contactEmail}`);
    console.log(`  Company:         ${companyName}`);
    console.log(`  Phone Dialed:    ${attempt.phoneDialed || 'N/A'}`);
    console.log(`  Call Duration:   ${attempt.callDuration || 0}s`);
    console.log(`  Connected:       ${attempt.connected}`);
    console.log(`  Telnyx Call ID:  ${attempt.telnyxCallId || 'N/A'}`);
    console.log(`  Notes:           ${attempt.notes || 'N/A'}`);
    console.log(`  Created:         ${attempt.createdAt?.toISOString() || 'N/A'}`);

    // Check if this attempt has a corresponding lead
    const [matchingLead] = await db
      .select({ id: leads.id, qaStatus: leads.qaStatus })
      .from(leads)
      .where(eq(leads.callAttemptId, attempt.id))
      .limit(1);

    if (matchingLead) {
      console.log(`  ✅ Has lead:     ${matchingLead.id} (status: ${matchingLead.qaStatus})`);
    } else {
      console.log(`  ❌ NO LEAD RECORD - needs backfill!`);
    }
    console.log();
  }

  // Step 4: Also check callSessions for qualified
  console.log("\n=== Qualified dispositions in call_sessions ===\n");

  const qualifiedSessions = await db
    .select({
      id: callSessions.id,
      contactId: callSessions.contactId,
      aiDisposition: callSessions.aiDisposition,
      telnyxCallId: callSessions.telnyxCallId,
      durationSec: callSessions.durationSec,
      toNumberE164: callSessions.toNumberE164,
      aiTranscript: callSessions.aiTranscript,
      createdAt: callSessions.createdAt,
    })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.campaignId, campaignId),
        eq(callSessions.aiDisposition, "qualified_lead")
      )
    )
    .orderBy(callSessions.createdAt);

  console.log(`Found ${qualifiedSessions.length} qualified_lead AI dispositions in call_sessions:\n`);

  for (let i = 0; i < qualifiedSessions.length; i++) {
    const session = qualifiedSessions[i];

    let contactName = "Unknown";
    let contactEmail = "N/A";
    let companyName = "N/A";

    if (session.contactId) {
      const [contact] = await db
        .select({
          fullName: contacts.fullName,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          companyName: accounts.name,
        })
        .from(contacts)
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(eq(contacts.id, session.contactId))
        .limit(1);

      if (contact) {
        contactName = contact.fullName ||
          [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";
        contactEmail = contact.email || "N/A";
        companyName = contact.companyName || "N/A";
      }
    }

    console.log(`--- Qualified Session ${i + 1} ---`);
    console.log(`  Session ID:      ${session.id}`);
    console.log(`  Contact:         ${contactName}`);
    console.log(`  Email:           ${contactEmail}`);
    console.log(`  Company:         ${companyName}`);
    console.log(`  Phone Dialed:    ${session.toNumberE164 || 'N/A'}`);
    console.log(`  Duration:        ${session.durationSec || 0}s`);
    console.log(`  Telnyx Call ID:  ${session.telnyxCallId || 'N/A'}`);
    console.log(`  Created:         ${session.createdAt?.toISOString() || 'N/A'}`);

    // Check if has lead
    if (session.telnyxCallId) {
      const [matchingLead] = await db
        .select({ id: leads.id, qaStatus: leads.qaStatus })
        .from(leads)
        .where(eq(leads.telnyxCallId, session.telnyxCallId))
        .limit(1);

      if (matchingLead) {
        console.log(`  ✅ Has lead:     ${matchingLead.id} (status: ${matchingLead.qaStatus})`);
      } else {
        console.log(`  ❌ NO LEAD RECORD - needs backfill!`);
      }
    } else {
      console.log(`  ⚠️ No telnyxCallId to match against leads`);
    }

    if (session.aiTranscript) {
      const preview = session.aiTranscript.substring(0, 200);
      console.log(`  Transcript:      ${preview}${session.aiTranscript.length > 200 ? '...' : ''}`);
    }
    console.log();
  }

  // Step 5: Summary
  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Campaign:                    ${campaignName}`);
  console.log(`Leads in leads table:        ${existingLeads.length}`);
  console.log(`Qualified in call_attempts:  ${qualifiedAttempts.length}`);
  console.log(`Qualified in call_sessions:  ${qualifiedSessions.length}`);

  // Count orphans
  const attemptIds = new Set(existingLeads.map(l => l.callAttemptId).filter(Boolean));
  const telnyxIds = new Set(existingLeads.map(l => l.telnyxCallId).filter(Boolean));

  const orphanedAttempts = qualifiedAttempts.filter(a => !attemptIds.has(a.id) && !(a.telnyxCallId && telnyxIds.has(a.telnyxCallId)));
  const orphanedSessions = qualifiedSessions.filter(s => !(s.telnyxCallId && telnyxIds.has(s.telnyxCallId)));

  if (orphanedAttempts.length > 0 || orphanedSessions.length > 0) {
    console.log(`\n⚠️ ORPHANED qualified dispositions (no lead record):`);
    console.log(`  From call_attempts: ${orphanedAttempts.length}`);
    console.log(`  From call_sessions: ${orphanedSessions.length}`);
    console.log(`\nRun backfill to create missing leads:`);
    console.log(`  npx tsx server/scripts/backfill-orphaned-leads.ts ${campaignId}`);
  } else {
    console.log(`\n✅ All qualified dispositions have matching lead records`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
