/**
 * Backfill Orphaned Call Sessions
 *
 * Finds callSessions records that have NULL contactId and/or campaignId
 * and attempts to resolve them by matching phone numbers against:
 * 1. dialerCallAttempts.phoneDialed (has both contactId and campaignId)
 * 2. contacts.directPhoneE164 or contacts.mobilePhoneE164
 *
 * This fixes the "Unknown Contact / Unknown Company / Unknown Campaign" issue
 * in the Conversations/Unified Intelligence page.
 *
 * Usage: npx tsx server/scripts/backfill-orphaned-sessions.ts [--dry-run]
 */

import { db } from "../db";
import {
  callSessions,
  contacts,
  dialerCallAttempts,
} from "@shared/schema";
import { eq, and, or, isNull, desc, gte } from "drizzle-orm";

const isDryRun = process.argv.includes("--dry-run");

async function resolveContactAndCampaign(
  phoneNumber: string,
  callTime: Date | null
): Promise {
  if (!phoneNumber || phoneNumber === "unknown") {
    return { contactId: null, campaignId: null };
  }

  // Strategy 1: Match against dialerCallAttempts (most reliable)
  const attemptConditions: any[] = [eq(dialerCallAttempts.phoneDialed, phoneNumber)];
  if (callTime) {
    // Look within 24 hours before and after the call
    const windowStart = new Date(callTime.getTime() - 24 * 60 * 60 * 1000);
    attemptConditions.push(gte(dialerCallAttempts.createdAt, windowStart));
  }

  const [attempt] = await db
    .select({
      contactId: dialerCallAttempts.contactId,
      campaignId: dialerCallAttempts.campaignId,
    })
    .from(dialerCallAttempts)
    .where(and(...attemptConditions))
    .orderBy(desc(dialerCallAttempts.createdAt))
    .limit(1);

  if (attempt) {
    return { contactId: attempt.contactId, campaignId: attempt.campaignId };
  }

  // Strategy 2: Match against contacts phone fields
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      or(
        eq(contacts.directPhoneE164, phoneNumber),
        eq(contacts.mobilePhoneE164, phoneNumber)
      )
    )
    .limit(1);

  if (contact) {
    // Try to find a campaign this contact was in
    const [recentAttempt] = await db
      .select({ campaignId: dialerCallAttempts.campaignId })
      .from(dialerCallAttempts)
      .where(eq(dialerCallAttempts.contactId, contact.id))
      .orderBy(desc(dialerCallAttempts.createdAt))
      .limit(1);

    return {
      contactId: contact.id,
      campaignId: recentAttempt?.campaignId || null,
    };
  }

  return { contactId: null, campaignId: null };
}

async function main() {
  console.log("=== Backfill Orphaned Call Sessions ===");
  console.log(`Mode: ${isDryRun ? "DRY RUN (no changes)" : "LIVE (will update records)"}\n`);

  // Find all callSessions with missing contactId OR campaignId
  const orphanedSessions = await db
    .select({
      id: callSessions.id,
      toNumberE164: callSessions.toNumberE164,
      contactId: callSessions.contactId,
      campaignId: callSessions.campaignId,
      startedAt: callSessions.startedAt,
      telnyxCallId: callSessions.telnyxCallId,
    })
    .from(callSessions)
    .where(
      or(
        isNull(callSessions.contactId),
        isNull(callSessions.campaignId)
      )
    )
    .orderBy(desc(callSessions.startedAt));

  console.log(`Found ${orphanedSessions.length} call sessions with missing contactId or campaignId\n`);

  if (orphanedSessions.length === 0) {
    console.log("Nothing to backfill!");
    process.exit(0);
  }

  let resolved = 0;
  let partiallyResolved = 0;
  let unresolved = 0;
  let updated = 0;

  for (const session of orphanedSessions) {
    const result = await resolveContactAndCampaign(
      session.toNumberE164,
      session.startedAt
    );

    const needsContactId = !session.contactId && result.contactId;
    const needsCampaignId = !session.campaignId && result.campaignId;

    if (!needsContactId && !needsCampaignId) {
      unresolved++;
      continue;
    }

    const updateFields: any = {};
    if (needsContactId) updateFields.contactId = result.contactId;
    if (needsCampaignId) updateFields.campaignId = result.campaignId;

    if (needsContactId && needsCampaignId) {
      resolved++;
    } else {
      partiallyResolved++;
    }

    const contactLabel = needsContactId ? `contact=${result.contactId}` : "contact=unchanged";
    const campaignLabel = needsCampaignId ? `campaign=${result.campaignId}` : "campaign=unchanged";
    console.log(
      `  ${isDryRun ? "[DRY]" : "[UPD]"} Session ${session.id} | Phone: ${session.toNumberE164} | ${contactLabel} | ${campaignLabel}`
    );

    if (!isDryRun) {
      await db
        .update(callSessions)
        .set(updateFields)
        .where(eq(callSessions.id, session.id));
      updated++;
    }
  }

  console.log(`\n=== BACKFILL COMPLETE ===`);
  console.log(`Total orphaned sessions:  ${orphanedSessions.length}`);
  console.log(`Fully resolved:           ${resolved}`);
  console.log(`Partially resolved:       ${partiallyResolved}`);
  console.log(`Unresolved (no match):    ${unresolved}`);
  if (!isDryRun) {
    console.log(`Records updated:          ${updated}`);
  } else {
    console.log(`\nThis was a DRY RUN. Run without --dry-run to apply changes.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during backfill:", err);
  process.exit(1);
});