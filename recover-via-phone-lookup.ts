/**
 * Recover misclassified calls using phone number lookup
 * This works when call_control_id has expired but recordings still exist
 */

import { db } from "./server/db";
import { dialerCallAttempts, contacts, accounts, campaigns, leads } from "./shared/schema";
import { eq, and, desc, gt, like } from "drizzle-orm";
import { searchRecordingsByDialedNumber } from "./server/services/telnyx-recordings";
import { transcribeLeadWithGemini } from "./server/services/gemini-transcription";
import { analyzeLeadQualification } from "./server/services/ai-qa-analyzer";

interface RecoveryResult {
  callId: string;
  contactName: string;
  company: string;
  phone: string;
  duration: number;
  recordingFound: boolean;
  recordingUrl: string | null;
  leadCreated: boolean;
  leadId: string | null;
  transcribed: boolean;
  analyzed: boolean;
  suggestedDisposition: string | null;
  error: string | null;
}

function formatPhoneE164(phone: string): string | null {
  let formatted = phone.replace(/[^0-9+]/g, '');

  // Skip international numbers for now (they don't have recordings)
  if (formatted.startsWith('44') || formatted.startsWith('49') || formatted.startsWith('33')) {
    return null; // UK, Germany, France - no recordings
  }

  if (!formatted.startsWith('+')) {
    if (formatted.length === 10) {
      formatted = '+1' + formatted;
    } else if (formatted.length === 11 && formatted.startsWith('1')) {
      formatted = '+' + formatted;
    } else {
      return null; // Unknown format
    }
  }

  return formatted;
}

async function recoverViaPhoneLookup(options: {
  limit?: number;
  dryRun?: boolean;
  createLeads?: boolean;
} = {}): Promise<RecoveryResult[]> {
  const { limit = 10, dryRun = false, createLeads = false } = options;

  console.log("=== RECOVERING MISCLASSIFIED CALLS VIA PHONE LOOKUP ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Create Leads: ${createLeads}`);
  console.log(`Limit: ${limit}`);
  console.log("");

  // Find US-based misclassified calls (duration > 60s)
  const calls = await db
    .select({
      call: dialerCallAttempts,
      contact: contacts,
    })
    .from(dialerCallAttempts)
    .innerJoin(contacts, eq(dialerCallAttempts.contactId, contacts.id))
    .where(
      and(
        eq(dialerCallAttempts.disposition, "no_answer"),
        gt(dialerCallAttempts.callDurationSeconds, 60)
      )
    )
    .orderBy(desc(dialerCallAttempts.createdAt))
    .limit(limit * 2); // Get extra to filter out international

  console.log(`Found ${calls.length} potential calls`);

  const results: RecoveryResult[] = [];
  let processed = 0;

  for (const { call, contact } of calls) {
    if (processed >= limit) break;

    const phone = contact.directPhone || contact.mobilePhone || call.phoneDialed;
    const formattedPhone = phone ? formatPhoneE164(phone) : null;

    if (!formattedPhone) {
      continue; // Skip international or invalid numbers
    }

    processed++;
    console.log(`\n[${processed}/${limit}] Processing call ${call.id.substring(0, 8)}...`);

    const result: RecoveryResult = {
      callId: call.id,
      contactName: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
      company: "",
      phone: formattedPhone,
      duration: call.callDurationSeconds || 0,
      recordingFound: false,
      recordingUrl: null,
      leadCreated: false,
      leadId: null,
      transcribed: false,
      analyzed: false,
      suggestedDisposition: null,
      error: null,
    };

    // Get account name
    if (contact.accountId) {
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, contact.accountId))
        .limit(1);
      result.company = account?.name || "";
    }

    console.log(`  Contact: ${result.contactName} @ ${result.company}`);
    console.log(`  Phone: ${formattedPhone}`);
    console.log(`  Duration: ${result.duration}s`);

    try {
      // Search for recording by phone number
      const searchStart = new Date(call.createdAt);
      searchStart.setMinutes(searchStart.getMinutes() - 30);
      const searchEnd = new Date(call.createdAt);
      searchEnd.setMinutes(searchEnd.getMinutes() + 30);

      console.log(`  Searching recordings...`);
      const recordings = await searchRecordingsByDialedNumber(formattedPhone, searchStart, searchEnd);

      if (recordings.length > 0) {
        const recording = recordings.find(r => r.status === 'completed') || recordings[0];
        const recordingUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;

        if (recordingUrl) {
          result.recordingFound = true;
          result.recordingUrl = recordingUrl;
          console.log(`  ✅ Recording found! Duration: ${Math.floor(recording.duration_millis / 1000)}s`);

          if (!dryRun && createLeads) {
            // Check if lead already exists by telnyxCallId or contactId+campaignId
            const telnyxId = recording.call_control_id || call.telnyxCallId;
            const existingLeads = telnyxId
              ? await db
                  .select()
                  .from(leads)
                  .where(eq(leads.telnyxCallId, telnyxId))
                  .limit(1)
              : [];

            if (existingLeads.length > 0) {
              const existingLead = existingLeads[0];
              result.leadId = existingLead.id;
              console.log(`  Lead already exists: ${result.leadId.substring(0, 8)}`);

              // Check if lead needs transcription
              if (!existingLead.transcript || existingLead.transcript.trim().length === 0) {
                console.log(`  Lead needs transcription, processing...`);

                // Always update recording URL with fresh URL from Telnyx (old URLs expire)
                console.log(`  Updating with fresh recording URL...`);
                await db
                  .update(leads)
                  .set({ recordingUrl })
                  .where(eq(leads.id, existingLead.id));

                // Transcribe with Gemini
                console.log(`  Transcribing with Gemini...`);
                try {
                  const transcribed = await transcribeLeadWithGemini(result.leadId);
                  result.transcribed = transcribed;
                  if (transcribed) {
                    console.log(`  ✅ Transcribed`);

                    // Analyze
                    console.log(`  Analyzing...`);
                    try {
                      const analysis = await analyzeLeadQualification(result.leadId);
                      result.analyzed = !!analysis;
                      if (analysis) {
                        result.suggestedDisposition = analysis.qualification_status || "needs_review";
                        console.log(`  ✅ Analyzed - Suggested: ${result.suggestedDisposition}`);
                      }
                    } catch (e: any) {
                      console.log(`  ⚠️ Analysis failed: ${e.message}`);
                    }
                  }
                } catch (e: any) {
                  console.log(`  ⚠️ Transcription failed: ${e.message}`);
                }
              } else {
                console.log(`  Lead already has transcript`);
                result.transcribed = true;
              }
            } else {
              // Create new lead (without callAttemptId - it references old call_attempts table)
              console.log(`  Creating lead...`);
              const [newLead] = await db
                .insert(leads)
                .values({
                  campaignId: call.campaignId,
                  contactId: call.contactId,
                  // Note: Not setting callAttemptId as it references call_attempts, not dialer_call_attempts
                  // Note: accountId is not in leads schema, using accountName instead
                  qaStatus: "new",
                  recordingUrl,
                  telnyxCallId: telnyxId,
                  callDuration: Math.floor(recording.duration_millis / 1000),
                  dialedNumber: formattedPhone,
                  transcriptionStatus: "pending",
                  accountName: result.company,
                  notes: `Recovered from misclassified dialer call: ${call.id}`,
                })
                .returning();

              result.leadId = newLead.id;
              result.leadCreated = true;
              console.log(`  ✅ Lead created: ${newLead.id.substring(0, 8)}`);

              // Update call attempt with recording URL
              await db
                .update(dialerCallAttempts)
                .set({ recordingUrl })
                .where(eq(dialerCallAttempts.id, call.id));

              // Transcribe with Gemini
              console.log(`  Transcribing with Gemini...`);
              try {
                const transcribed = await transcribeLeadWithGemini(result.leadId);
                result.transcribed = transcribed;
                if (transcribed) {
                  console.log(`  ✅ Transcribed`);

                  // Analyze
                  console.log(`  Analyzing...`);
                  try {
                    const analysis = await analyzeLeadQualification(result.leadId);
                    result.analyzed = !!analysis;
                    if (analysis) {
                      result.suggestedDisposition = analysis.qualification_status || "needs_review";
                      console.log(`  ✅ Analyzed - Suggested: ${result.suggestedDisposition}`);
                    }
                  } catch (e: any) {
                    console.log(`  ⚠️ Analysis failed: ${e.message}`);
                  }
                }
              } catch (e: any) {
                console.log(`  ⚠️ Transcription failed: ${e.message}`);
              }
            }
          } else if (dryRun) {
            console.log(`  [DRY RUN] Would create lead and transcribe`);
          }
        } else {
          console.log(`  ⚠️ Recording found but no download URL available`);
        }
      } else {
        console.log(`  ❌ No recording found`);
      }
    } catch (error: any) {
      result.error = error.message;
      console.log(`  ❌ Error: ${error.message}`);
    }

    results.push(result);
  }

  // Summary
  console.log("\n=== RECOVERY SUMMARY ===");
  const withRecordings = results.filter(r => r.recordingFound);
  const leadsCreated = results.filter(r => r.leadCreated);
  const transcribed = results.filter(r => r.transcribed);
  const analyzed = results.filter(r => r.analyzed);

  console.log(`Total processed: ${results.length}`);
  console.log(`Recordings found: ${withRecordings.length}`);
  console.log(`Leads created: ${leadsCreated.length}`);
  console.log(`Transcribed: ${transcribed.length}`);
  console.log(`Analyzed: ${analyzed.length}`);

  if (analyzed.length > 0) {
    console.log("\nAnalysis results:");
    const qualified = analyzed.filter(r => r.suggestedDisposition === "qualified");
    const notQualified = analyzed.filter(r => r.suggestedDisposition === "not_qualified");
    console.log(`  Qualified: ${qualified.length}`);
    console.log(`  Not Qualified: ${notQualified.length}`);
  }

  return results;
}

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const createLeads = args.includes("--create-leads");
const limitArg = args.find(a => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 5;

recoverViaPhoneLookup({ limit, dryRun, createLeads })
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
