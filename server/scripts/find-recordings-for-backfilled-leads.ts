/**
 * Find call recordings for backfilled leads by matching phone numbers and telnyxCallId
 */
import { db } from "../db";
import { leads, callSessions, dialerCallAttempts } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  // Get the 13 backfilled leads (created by our script - they have 'backfill_script' in notes)
  const backfilledLeads = await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      campaignId: leads.campaignId,
      dialedNumber: leads.dialedNumber,
      telnyxCallId: leads.telnyxCallId,
      callAttemptId: leads.callAttemptId,
      recordingUrl: leads.recordingUrl,
      callDuration: leads.callDuration,
      notes: leads.notes,
    })
    .from(leads)
    .where(sql`${leads.notes} LIKE '%backfill_script%'`);

  console.log("Found " + backfilledLeads.length + " backfilled leads\n");

  let withRecording = 0;
  let withoutRecording = 0;

  for (const lead of backfilledLeads) {
    console.log("--- " + lead.contactName + " (Lead: " + lead.id + ") ---");
    console.log("  Phone: " + (lead.dialedNumber || "NONE"));
    console.log("  TelnyxCallId: " + (lead.telnyxCallId || "NONE"));
    console.log("  CallAttemptId: " + (lead.callAttemptId || "NONE"));
    console.log("  Current RecordingUrl: " + (lead.recordingUrl || "NONE"));
    console.log("  Duration: " + (lead.callDuration || 0) + "s");

    let foundRecording = false;
    let recordingUrl: string | null = null;
    let recordingS3Key: string | null = null;
    let matchedSessionId: string | null = null;

    // Strategy 1: Search call_sessions by telnyxCallId
    if (lead.telnyxCallId) {
      const sessions = await db.select({
        id: callSessions.id,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingStatus: callSessions.recordingStatus,
        durationSec: callSessions.durationSec,
      }).from(callSessions)
        .where(eq(callSessions.telnyxCallId, lead.telnyxCallId))
        .limit(3);

      for (const s of sessions) {
        if (s.recordingUrl || s.recordingS3Key) {
          foundRecording = true;
          recordingUrl = s.recordingUrl;
          recordingS3Key = s.recordingS3Key;
          matchedSessionId = s.id;
          console.log("  RECORDING FOUND (via telnyxCallId):");
          console.log("    Session: " + s.id);
          console.log("    RecordingUrl: " + (s.recordingUrl || "NONE"));
          console.log("    S3Key: " + (s.recordingS3Key || "NONE"));
          console.log("    Status: " + (s.recordingStatus || "NONE"));
          break;
        }
      }
    }

    // Strategy 2: Search call_sessions by phone number
    if (!foundRecording && lead.dialedNumber) {
      const sessions = await db.select({
        id: callSessions.id,
        recordingUrl: callSessions.recordingUrl,
        recordingS3Key: callSessions.recordingS3Key,
        recordingStatus: callSessions.recordingStatus,
        telnyxCallId: callSessions.telnyxCallId,
        durationSec: callSessions.durationSec,
        campaignId: callSessions.campaignId,
        aiDisposition: callSessions.aiDisposition,
      }).from(callSessions)
        .where(eq(callSessions.toNumberE164, lead.dialedNumber))
        .limit(5);

      // Filter to same campaign and qualified disposition
      const matched = sessions.filter(s =>
        s.campaignId === lead.campaignId &&
        (s.recordingUrl || s.recordingS3Key)
      );

      if (matched.length > 0) {
        const s = matched[0];
        foundRecording = true;
        recordingUrl = s.recordingUrl;
        recordingS3Key = s.recordingS3Key;
        matchedSessionId = s.id;
        console.log("  RECORDING FOUND (via phone number match):");
        console.log("    Session: " + s.id);
        console.log("    RecordingUrl: " + (s.recordingUrl || "NONE"));
        console.log("    S3Key: " + (s.recordingS3Key || "NONE"));
        console.log("    Status: " + (s.recordingStatus || "NONE"));
        console.log("    Disposition: " + (s.aiDisposition || "NONE"));
      }
    }

    // Strategy 3: Check dialer_call_attempts for recording
    if (!foundRecording && lead.callAttemptId) {
      const [attempt] = await db.select({
        recordingUrl: dialerCallAttempts.recordingUrl,
        telnyxCallId: dialerCallAttempts.telnyxCallId,
      }).from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, lead.callAttemptId))
        .limit(1);

      if (attempt?.recordingUrl) {
        foundRecording = true;
        recordingUrl = attempt.recordingUrl;
        console.log("  RECORDING FOUND (via dialerCallAttempt):");
        console.log("    RecordingUrl: " + attempt.recordingUrl);
      }
    }

    if (!foundRecording) {
      console.log("  NO RECORDINGS FOUND");
      withoutRecording++;
    } else {
      withRecording++;

      // Update the lead with the found recording
      const updateData: Record<string, any> = {};
      if (recordingUrl && !lead.recordingUrl) {
        updateData.recordingUrl = recordingUrl;
      }
      if (Object.keys(updateData).length > 0) {
        await db.update(leads).set({
          ...updateData,
          updatedAt: new Date(),
        }).where(eq(leads.id, lead.id));
        console.log("  >> UPDATED lead with recording URL");
      }
    }

    console.log("");
  }

  console.log("=== SUMMARY ===");
  console.log("With recordings: " + withRecording);
  console.log("Without recordings: " + withoutRecording);
  console.log("Total: " + backfilledLeads.length);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
