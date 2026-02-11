/**
 * Backfill Orphaned Qualified Leads
 *
 * Finds qualified call dispositions (from both dialerCallAttempts and callSessions)
 * that have NO matching lead record in the leads table, and creates the missing leads.
 *
 * This fixes the gap where the dashboard counts "Leads Qualified" from disposition records
 * but the actual leads table has fewer entries due to:
 * - Fallback sessions without callAttemptId
 * - processDisposition() failures
 * - Error handling paths that swallowed exceptions
 *
 * Usage: npx tsx server/scripts/backfill-orphaned-leads.ts [campaignId]
 * - If campaignId is provided, only backfills for that campaign
 * - If omitted, backfills ALL campaigns
 */

import { db } from "../db";
import {
  dialerCallAttempts,
  callSessions,
  leads,
  contacts,
  accounts
} from "@shared/schema";
import { eq, and, sql, isNull, not, inArray } from "drizzle-orm";

interface OrphanedRecord {
  source: 'dialer_call_attempts' | 'call_sessions';
  id: string;
  campaignId: string | null;
  contactId: string | null;
  telnyxCallId: string | null;
  callDuration: number | null;
  phoneDialed: string | null;
  transcript: string | null;
  disposition: string | null;
  createdAt: Date | null;
}

async function findOrphanedFromDialerCallAttempts(campaignId?: string): Promise<OrphanedRecord[]> {
  console.log("\n--- Checking dialer_call_attempts for orphaned qualified dispositions ---");

  const conditions = [
    eq(dialerCallAttempts.disposition, 'qualified_lead'),
  ];

  if (campaignId) {
    conditions.push(eq(dialerCallAttempts.campaignId, campaignId));
  }

  const qualifiedAttempts = await db
    .select({
      id: dialerCallAttempts.id,
      campaignId: dialerCallAttempts.campaignId,
      contactId: dialerCallAttempts.contactId,
      telnyxCallId: dialerCallAttempts.telnyxCallId,
      callDuration: dialerCallAttempts.callDurationSeconds,
      phoneDialed: dialerCallAttempts.phoneDialed,
      createdAt: dialerCallAttempts.createdAt,
      disposition: dialerCallAttempts.disposition,
    })
    .from(dialerCallAttempts)
    .where(and(...conditions));

  console.log(`  Found ${qualifiedAttempts.length} qualified call attempts total`);

  // Check which ones already have leads
  const orphaned: OrphanedRecord[] = [];
  for (const attempt of qualifiedAttempts) {
    // Check by callAttemptId first
    let hasLead = false;
    const [byAttempt] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.callAttemptId, attempt.id))
      .limit(1);

    if (byAttempt) {
      hasLead = true;
    }

    // Also check by telnyxCallId if available
    if (!hasLead && attempt.telnyxCallId) {
      const [byTelnyx] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.telnyxCallId, attempt.telnyxCallId))
        .limit(1);
      if (byTelnyx) {
        hasLead = true;
      }
    }

    if (!hasLead) {
      orphaned.push({
        source: 'dialer_call_attempts',
        id: attempt.id,
        campaignId: attempt.campaignId,
        contactId: attempt.contactId,
        telnyxCallId: attempt.telnyxCallId,
        callDuration: attempt.callDuration,
        phoneDialed: attempt.phoneDialed,
        transcript: null,
        disposition: attempt.disposition,
        createdAt: attempt.createdAt,
      });
    }
  }

  console.log(`  Orphaned (no matching lead): ${orphaned.length}`);
  return orphaned;
}

async function findOrphanedFromCallSessions(campaignId?: string): Promise<OrphanedRecord[]> {
  console.log("\n--- Checking call_sessions for orphaned qualified AI dispositions ---");

  const conditions = [
    eq(callSessions.aiDisposition, 'qualified_lead'),
  ];

  if (campaignId) {
    conditions.push(eq(callSessions.campaignId, campaignId));
  }

  const qualifiedSessions = await db
    .select({
      id: callSessions.id,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      telnyxCallId: callSessions.telnyxCallId,
      durationSec: callSessions.durationSec,
      toNumberE164: callSessions.toNumberE164,
      aiTranscript: callSessions.aiTranscript,
      aiDisposition: callSessions.aiDisposition,
      createdAt: callSessions.createdAt,
    })
    .from(callSessions)
    .where(and(...conditions));

  console.log(`  Found ${qualifiedSessions.length} qualified call sessions total`);

  // Check which ones already have leads (by telnyxCallId)
  const orphaned: OrphanedRecord[] = [];
  for (const session of qualifiedSessions) {
    let hasLead = false;

    if (session.telnyxCallId) {
      const [byTelnyx] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.telnyxCallId, session.telnyxCallId))
        .limit(1);
      if (byTelnyx) {
        hasLead = true;
      }
    }

    if (!hasLead) {
      orphaned.push({
        source: 'call_sessions',
        id: session.id,
        campaignId: session.campaignId,
        contactId: session.contactId,
        telnyxCallId: session.telnyxCallId,
        callDuration: session.durationSec,
        phoneDialed: session.toNumberE164,
        transcript: session.aiTranscript,
        disposition: session.aiDisposition,
        createdAt: session.createdAt,
      });
    }
  }

  console.log(`  Orphaned (no matching lead): ${orphaned.length}`);
  return orphaned;
}

async function createLeadFromOrphan(orphan: OrphanedRecord): Promise<string | null> {
  try {
    if (!orphan.contactId || !orphan.campaignId) {
      console.warn(`  ⚠️ Skipping ${orphan.source}:${orphan.id} - missing contactId or campaignId`);
      return null;
    }

    // Fetch contact info
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
      .where(eq(contacts.id, orphan.contactId))
      .limit(1);

    const contactName = contact?.fullName ||
      (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}` :
       contact?.firstName || contact?.lastName || 'Unknown');

    const callDuration = orphan.callDuration || 0;
    const isShortDuration = callDuration < 20;

    const [newLead] = await db
      .insert(leads)
      .values({
        campaignId: orphan.campaignId,
        contactId: orphan.contactId,
        callAttemptId: orphan.source === 'dialer_call_attempts' ? orphan.id : undefined,
        contactName,
        contactEmail: contact?.email || undefined,
        accountName: contact?.companyName || undefined,
        qaStatus: isShortDuration ? 'under_review' : 'new',
        qaDecision: isShortDuration
          ? `⚠️ SHORT DURATION: ${callDuration}s - backfilled, requires verification`
          : null,
        dialedNumber: orphan.phoneDialed,
        callDuration,
        transcript: orphan.transcript || undefined,
        telnyxCallId: orphan.telnyxCallId || undefined,
        notes: `Source: backfill_script | Original: ${orphan.source}:${orphan.id} | Original Date: ${orphan.createdAt?.toISOString() || 'unknown'}`,
      })
      .returning({ id: leads.id });

    if (newLead) {
      console.log(`  ✅ Created lead ${newLead.id} | Contact: ${contactName} | Campaign: ${orphan.campaignId} | Source: ${orphan.source}`);
      return newLead.id;
    }
    return null;
  } catch (err) {
    console.error(`  ❌ Failed to create lead for ${orphan.source}:${orphan.id}:`, err);
    return null;
  }
}

async function main() {
  const campaignId = process.argv[2] || undefined;

  console.log("=== Backfill Orphaned Qualified Leads ===");
  if (campaignId) {
    console.log(`Campaign filter: ${campaignId}`);
  } else {
    console.log("Scope: ALL campaigns");
  }

  // Find orphans from both sources
  const dialerOrphans = await findOrphanedFromDialerCallAttempts(campaignId);
  const sessionOrphans = await findOrphanedFromCallSessions(campaignId);

  // Deduplicate across sources (same telnyxCallId could appear in both)
  const seenTelnyxIds = new Set<string>();
  const allOrphans: OrphanedRecord[] = [];

  // Prefer dialer_call_attempts records (more complete data)
  for (const orphan of dialerOrphans) {
    if (orphan.telnyxCallId) seenTelnyxIds.add(orphan.telnyxCallId);
    allOrphans.push(orphan);
  }
  for (const orphan of sessionOrphans) {
    if (orphan.telnyxCallId && seenTelnyxIds.has(orphan.telnyxCallId)) {
      console.log(`  ⏭️ Skipping duplicate call_sessions:${orphan.id} (already covered by dialer_call_attempts)`);
      continue;
    }
    allOrphans.push(orphan);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total orphaned qualified dispositions: ${allOrphans.length}`);
  console.log(`  From dialer_call_attempts: ${dialerOrphans.length}`);
  console.log(`  From call_sessions: ${allOrphans.length - dialerOrphans.length}`);

  if (allOrphans.length === 0) {
    console.log("\n✅ No orphaned leads found - all qualified dispositions have matching lead records!");
    process.exit(0);
  }

  // Show what we found before creating
  console.log("\nOrphaned records to backfill:");
  for (const orphan of allOrphans) {
    console.log(`  - ${orphan.source}:${orphan.id} | Campaign: ${orphan.campaignId} | Contact: ${orphan.contactId} | Duration: ${orphan.callDuration}s | Date: ${orphan.createdAt?.toISOString()}`);
  }

  // Create leads
  console.log(`\n--- Creating ${allOrphans.length} missing lead records ---`);
  let created = 0;
  let failed = 0;

  for (const orphan of allOrphans) {
    const leadId = await createLeadFromOrphan(orphan);
    if (leadId) {
      created++;
    } else {
      failed++;
    }
  }

  console.log(`\n=== BACKFILL COMPLETE ===`);
  console.log(`Created: ${created}`);
  console.log(`Failed/Skipped: ${failed}`);
  console.log(`Total processed: ${allOrphans.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during backfill:", err);
  process.exit(1);
});
