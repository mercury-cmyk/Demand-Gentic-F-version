/**
 * Find calls that were potentially misclassified as no_answer
 * when they should have been qualified or reviewed.
 *
 * These are calls that:
 * 1. Have disposition = 'no_answer'
 * 2. But show signs of engagement (connected, duration > 30s, has recording)
 */

import { db } from "./server/db";
import { dialerCallAttempts, contacts, accounts, campaigns } from "./shared/schema";
import { eq, and, desc, or, gt, isNotNull } from "drizzle-orm";

async function findMisclassifiedCalls() {
  console.log("=== FINDING POTENTIALLY MISCLASSIFIED CALLS ===");
  console.log("Looking for calls marked as no_answer but with signs of engagement...");
  console.log("");

  // Find calls that have no_answer disposition but show signs of engagement
  // Use a raw query approach to avoid Drizzle ORM issues
  const suspiciousCalls = await db
    .select()
    .from(dialerCallAttempts)
    .where(
      and(
        eq(dialerCallAttempts.disposition, "no_answer"),
        or(
          eq(dialerCallAttempts.connected, true),
          gt(dialerCallAttempts.callDurationSeconds, 30),
          isNotNull(dialerCallAttempts.recordingUrl)
        )
      )
    )
    .orderBy(desc(dialerCallAttempts.createdAt))
    .limit(100);

  console.log("Found", suspiciousCalls.length, "potentially misclassified calls:");
  console.log("");

  if (suspiciousCalls.length === 0) {
    console.log("No potentially misclassified calls found.");
    return [];
  }

  // Group by campaign
  const byCampaign: Record = {};
  for (const call of suspiciousCalls) {
    if (!byCampaign[call.campaignId]) byCampaign[call.campaignId] = [];
    byCampaign[call.campaignId].push(call);
  }

  const results: Array = [];

  for (const campaignId of Object.keys(byCampaign)) {
    const calls = byCampaign[campaignId];

    // Get campaign name
    const campaignResult = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    const campaign = campaignResult[0];

    console.log("--- Campaign:", campaign?.name || campaignId, "---");
    console.log("Suspicious calls:", calls.length);

    for (const call of calls) {
      // Get contact info
      const contactResult = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, call.contactId))
        .limit(1);

      const contact = contactResult[0];

      let accountName = "";
      if (contact?.accountId) {
        const accountResult = await db
          .select()
          .from(accounts)
          .where(eq(accounts.id, contact.accountId))
          .limit(1);
        accountName = accountResult[0]?.name || "";
      }

      // Flag likelihood of being misclassified
      let likelihood = "LOW";
      if (call.callDurationSeconds && call.callDurationSeconds > 60) likelihood = "HIGH";
      else if (call.callDurationSeconds && call.callDurationSeconds > 30) likelihood = "MEDIUM";
      else if (call.connected) likelihood = "MEDIUM";

      console.log("");
      console.log("  Call ID:", call.id.substring(0, 8));
      console.log("  Contact:", contact?.firstName, contact?.lastName);
      console.log("  Company:", accountName);
      console.log("  Phone:", contact?.directPhone || contact?.mobilePhone);
      console.log("  Date:", call.createdAt);
      console.log("  Duration:", call.callDurationSeconds, "seconds");
      console.log("  Connected:", call.connected);
      console.log("  Has Recording:", !!call.recordingUrl);
      console.log("  Voicemail:", call.voicemailDetected);
      console.log("  Telnyx ID:", call.telnyxCallId);
      console.log("  MISCLASSIFICATION LIKELIHOOD:", likelihood);

      results.push({
        callId: call.id,
        campaignName: campaign?.name || campaignId,
        contactName: `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim(),
        company: accountName,
        phone: contact?.directPhone || contact?.mobilePhone || "",
        date: call.createdAt,
        duration: call.callDurationSeconds,
        connected: call.connected,
        hasRecording: !!call.recordingUrl,
        telnyxId: call.telnyxCallId,
        likelihood,
      });
    }
    console.log("");
  }

  // Summary
  console.log("=== SUMMARY ===");
  const highLikelihood = results.filter((c) => c.likelihood === "HIGH");
  const mediumLikelihood = results.filter((c) => c.likelihood === "MEDIUM");

  console.log("HIGH likelihood (duration > 60s):", highLikelihood.length);
  console.log("MEDIUM likelihood (30-60s or connected):", mediumLikelihood.length);
  console.log("LOW likelihood:", results.length - highLikelihood.length - mediumLikelihood.length);
  console.log("");
  console.log("These calls were answered/engaged but marked as no_answer.");
  console.log("HIGH likelihood calls should be reviewed for re-qualification.");

  // Print HIGH likelihood calls as a table for easy review
  if (highLikelihood.length > 0) {
    console.log("");
    console.log("=== HIGH LIKELIHOOD CALLS FOR REVIEW ===");
    console.log("Call ID   | Duration | Contact              | Company                    | Phone");
    console.log("-".repeat(100));
    for (const call of highLikelihood) {
      console.log(
        `${call.callId.substring(0, 8).padEnd(10)}| ${String(call.duration || 0).padEnd(9)}| ${call.contactName.padEnd(21).substring(0, 21)}| ${call.company.padEnd(27).substring(0, 27)}| ${call.phone}`
      );
    }
  }

  return results;
}

findMisclassifiedCalls()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });