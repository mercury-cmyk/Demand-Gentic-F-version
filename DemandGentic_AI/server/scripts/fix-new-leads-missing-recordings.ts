/**
 * Fix Leads in QA with "new" status that are missing recordings
 *
 * Finds all leads where qaStatus='new' and recordingUrl is NULL,
 * then attempts to find recordings via:
 *   1. call_sessions by telnyxCallId
 *   2. call_sessions by phone number (dialedNumber)
 *   3. dialer_call_attempts by callAttemptId
 *   4. Telnyx API by call_control_id
 *   5. Telnyx API by phone number search
 *
 * Usage: npx tsx server/scripts/fix-new-leads-missing-recordings.ts [--dry-run] [--campaign ]
 *   --dry-run   Show what would be updated without making changes
 *   --campaign   Only process leads for a specific campaign
 */

import { db } from "../db";
import { leads, callSessions, dialerCallAttempts } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  fetchTelnyxRecording,
  searchRecordingsByDialedNumber,
} from "../services/telnyx-recordings";

const DRY_RUN = process.argv.includes("--dry-run");
const CAMPAIGN_IDX = process.argv.indexOf("--campaign");
const CAMPAIGN_ID = CAMPAIGN_IDX !== -1 ? process.argv[CAMPAIGN_IDX + 1] : undefined;

interface LeadInfo {
  id: string;
  contactName: string | null;
  campaignId: string | null;
  dialedNumber: string | null;
  telnyxCallId: string | null;
  callAttemptId: string | null;
  recordingUrl: string | null;
  recordingS3Key: string | null;
  callDuration: number | null;
  createdAt: Date | null;
}

async function main() {
  console.log("=== Fix New Leads Missing Recordings ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE (will update DB)"}`);
  if (CAMPAIGN_ID) console.log(`Campaign filter: ${CAMPAIGN_ID}`);
  console.log("");

  // Step 1: Find all leads with qaStatus='new' and no recording
  const conditions = [
    eq(leads.qaStatus, "new"),
    isNull(leads.recordingUrl),
    isNull(leads.recordingS3Key),
  ];

  if (CAMPAIGN_ID) {
    conditions.push(eq(leads.campaignId, CAMPAIGN_ID));
  }

  const newLeadsNoRecording = await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      campaignId: leads.campaignId,
      dialedNumber: leads.dialedNumber,
      telnyxCallId: leads.telnyxCallId,
      callAttemptId: leads.callAttemptId,
      recordingUrl: leads.recordingUrl,
      recordingS3Key: leads.recordingS3Key,
      callDuration: leads.callDuration,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(and(...conditions));

  console.log(`Found ${newLeadsNoRecording.length} leads in 'new' status with no recording\n`);

  if (newLeadsNoRecording.length === 0) {
    console.log("Nothing to fix!");
    process.exit(0);
  }

  let fixed = 0;
  let notFound = 0;
  let errors = 0;

  for (const lead of newLeadsNoRecording) {
    console.log(`--- ${lead.contactName || "Unknown"} (Lead: ${lead.id}) ---`);
    console.log(`  Phone: ${lead.dialedNumber || "NONE"}`);
    console.log(`  TelnyxCallId: ${lead.telnyxCallId || "NONE"}`);
    console.log(`  CallAttemptId: ${lead.callAttemptId || "NONE"}`);
    console.log(`  CampaignId: ${lead.campaignId || "NONE"}`);
    console.log(`  Created: ${lead.createdAt ? new Date(lead.createdAt).toISOString() : "NONE"}`);

    let foundRecordingUrl: string | null = null;
    let foundS3Key: string | null = null;
    let foundDuration: number | null = null;
    let foundVia: string | null = null;

    try {
      // Strategy 1: Search call_sessions by telnyxCallId
      if (!foundRecordingUrl && lead.telnyxCallId) {
        const sessions = await db
          .select({
            id: callSessions.id,
            recordingUrl: callSessions.recordingUrl,
            recordingS3Key: callSessions.recordingS3Key,
            recordingStatus: callSessions.recordingStatus,
            durationSec: callSessions.durationSec,
          })
          .from(callSessions)
          .where(eq(callSessions.telnyxCallId, lead.telnyxCallId))
          .limit(3);

        for (const s of sessions) {
          if (s.recordingUrl || s.recordingS3Key) {
            foundRecordingUrl = s.recordingUrl;
            foundS3Key = s.recordingS3Key;
            foundDuration = s.durationSec;
            foundVia = `call_sessions (telnyxCallId) - session ${s.id}`;
            break;
          }
        }
      }

      // Strategy 2: Search call_sessions by phone number
      if (!foundRecordingUrl && lead.dialedNumber) {
        const sessions = await db
          .select({
            id: callSessions.id,
            recordingUrl: callSessions.recordingUrl,
            recordingS3Key: callSessions.recordingS3Key,
            recordingStatus: callSessions.recordingStatus,
            durationSec: callSessions.durationSec,
            campaignId: callSessions.campaignId,
            aiDisposition: callSessions.aiDisposition,
          })
          .from(callSessions)
          .where(eq(callSessions.toNumberE164, lead.dialedNumber))
          .limit(10);

        // Prefer same campaign + has recording
        const matched = sessions.filter(
          (s) =>
            s.campaignId === lead.campaignId &&
            (s.recordingUrl || s.recordingS3Key)
        );

        if (matched.length > 0) {
          const s = matched[0];
          foundRecordingUrl = s.recordingUrl;
          foundS3Key = s.recordingS3Key;
          foundDuration = s.durationSec;
          foundVia = `call_sessions (phone match) - session ${s.id}, disposition: ${s.aiDisposition}`;
        }
      }

      // Strategy 3: Check dialer_call_attempts for recording
      if (!foundRecordingUrl && lead.callAttemptId) {
        const [attempt] = await db
          .select({
            recordingUrl: dialerCallAttempts.recordingUrl,
            telnyxCallId: dialerCallAttempts.telnyxCallId,
            callDuration: dialerCallAttempts.callDurationSeconds,
          })
          .from(dialerCallAttempts)
          .where(eq(dialerCallAttempts.id, lead.callAttemptId))
          .limit(1);

        if (attempt?.recordingUrl) {
          foundRecordingUrl = attempt.recordingUrl;
          foundDuration = attempt.callDuration;
          foundVia = `dialer_call_attempts (callAttemptId)`;
        }
      }

      // Strategy 4: Telnyx API by call_control_id
      if (!foundRecordingUrl && lead.telnyxCallId) {
        console.log(`  Trying Telnyx API by call_control_id...`);
        const url = await fetchTelnyxRecording(lead.telnyxCallId);
        if (url) {
          foundRecordingUrl = url;
          foundVia = "Telnyx API (call_control_id)";
        }
      }

      // Strategy 5: Telnyx API by phone number search
      if (!foundRecordingUrl && lead.dialedNumber && lead.createdAt) {
        console.log(`  Trying Telnyx API by phone number search...`);
        const searchStart = new Date(lead.createdAt);
        searchStart.setHours(searchStart.getHours() - 2);
        const searchEnd = new Date(lead.createdAt);
        searchEnd.setHours(searchEnd.getHours() + 2);

        const recordings = await searchRecordingsByDialedNumber(
          lead.dialedNumber,
          searchStart,
          searchEnd
        );

        if (recordings.length > 0) {
          const completed = recordings.find((r) => r.status === "completed");
          const recording = completed || recordings[0];
          const downloadUrl =
            recording.download_urls?.mp3 || recording.download_urls?.wav;
          if (downloadUrl) {
            foundRecordingUrl = downloadUrl;
            foundDuration = Math.floor(recording.duration_millis / 1000);
            foundVia = `Telnyx API (phone search) - recording ${recording.id}`;
          }
        }
      }

      // Apply the fix
      if (foundRecordingUrl || foundS3Key) {
        console.log(`  FOUND via: ${foundVia}`);
        console.log(`  RecordingUrl: ${foundRecordingUrl || "NONE"}`);
        console.log(`  S3Key: ${foundS3Key || "NONE"}`);
        console.log(`  Duration: ${foundDuration || "unknown"}s`);

        if (!DRY_RUN) {
          const updateData: Record = { updatedAt: new Date() };
          if (foundRecordingUrl) updateData.recordingUrl = foundRecordingUrl;
          if (foundS3Key) updateData.recordingS3Key = foundS3Key;
          if (foundDuration && !lead.callDuration) updateData.callDuration = foundDuration;

          await db
            .update(leads)
            .set(updateData)
            .where(eq(leads.id, lead.id));
          console.log(`  >> UPDATED lead with recording`);
        } else {
          console.log(`  >> [DRY RUN] Would update lead with recording`);
        }
        fixed++;
      } else {
        console.log(`  NO RECORDING FOUND (all 5 strategies exhausted)`);
        notFound++;
      }
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`);
      errors++;
    }

    console.log("");
  }

  console.log("=== SUMMARY ===");
  console.log(`Total leads checked: ${newLeadsNoRecording.length}`);
  console.log(`Fixed (recording found): ${fixed}`);
  console.log(`No recording found: ${notFound}`);
  console.log(`Errors: ${errors}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});