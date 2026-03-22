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

  for (let i = 0; i  200 ? '...' : ''}`);
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

  for (let i = 0; i  200 ? '...' : ''}`);
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