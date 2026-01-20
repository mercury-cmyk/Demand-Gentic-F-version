/**
 * Recover misclassified calls by:
 * 1. Fetching recordings from Telnyx
 * 2. Creating leads for calls that have recordings
 * 3. Transcribing and analyzing those calls
 * 4. Updating dispositions
 */

import { db } from "./server/db";
import { dialerCallAttempts, contacts, accounts, campaigns, leads } from "./shared/schema";
import { eq, and, desc, or, gt, isNotNull } from "drizzle-orm";
import { fetchTelnyxRecording } from "./server/services/telnyx-recordings";
import { transcribeLeadCall } from "./server/services/assemblyai-transcription";
import { analyzeLeadQualification } from "./server/services/ai-qa-analyzer";

interface RecoveryResult {
  callId: string;
  telnyxCallId: string;
  contactName: string;
  company: string;
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

async function recoverMisclassifiedCalls(options: {
  limit?: number;
  dryRun?: boolean;
  fetchRecordingsOnly?: boolean;
} = {}): Promise<RecoveryResult[]> {
  const { limit = 10, dryRun = false, fetchRecordingsOnly = false } = options;

  console.log("=== RECOVERING MISCLASSIFIED CALLS ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Limit: ${limit}`);
  console.log("");

  // Find HIGH likelihood misclassified calls (duration > 60s)
  const misclassifiedCalls = await db
    .select()
    .from(dialerCallAttempts)
    .where(
      and(
        eq(dialerCallAttempts.disposition, "no_answer"),
        gt(dialerCallAttempts.callDurationSeconds, 60),
        isNotNull(dialerCallAttempts.telnyxCallId)
      )
    )
    .orderBy(desc(dialerCallAttempts.createdAt))
    .limit(limit);

  console.log(`Found ${misclassifiedCalls.length} misclassified calls to process`);
  console.log("");

  const results: RecoveryResult[] = [];

  for (let i = 0; i < misclassifiedCalls.length; i++) {
    const call = misclassifiedCalls[i];
    console.log(`\n[${i + 1}/${misclassifiedCalls.length}] Processing call ${call.id.substring(0, 8)}...`);

    const result: RecoveryResult = {
      callId: call.id,
      telnyxCallId: call.telnyxCallId!,
      contactName: "",
      company: "",
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

    try {
      // Get contact and account info
      const [contact] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, call.contactId))
        .limit(1);

      result.contactName = `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim();

      if (contact?.accountId) {
        const [account] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.id, contact.accountId))
          .limit(1);
        result.company = account?.name || "";
      }

      console.log(`  Contact: ${result.contactName} @ ${result.company}`);
      console.log(`  Duration: ${result.duration}s`);
      console.log(`  Telnyx ID: ${call.telnyxCallId}`);

      // Step 1: Fetch recording from Telnyx
      console.log("  Fetching recording from Telnyx...");
      const recordingUrl = await fetchTelnyxRecording(call.telnyxCallId!);

      if (recordingUrl) {
        result.recordingFound = true;
        result.recordingUrl = recordingUrl;
        console.log("  ✅ Recording found!");

        if (fetchRecordingsOnly) {
          // Just update the call attempt with the recording URL
          if (!dryRun) {
            await db
              .update(dialerCallAttempts)
              .set({ recordingUrl })
              .where(eq(dialerCallAttempts.id, call.id));
            console.log("  ✅ Updated call attempt with recording URL");
          }
        } else {
          // Step 2: Create lead for this call
          if (!dryRun) {
            console.log("  Creating lead...");

            // Get campaign for lead creation
            const [campaign] = await db
              .select()
              .from(campaigns)
              .where(eq(campaigns.id, call.campaignId))
              .limit(1);

            // Check if lead already exists
            const [existingLead] = await db
              .select()
              .from(leads)
              .where(eq(leads.telnyxCallId, call.telnyxCallId!))
              .limit(1);

            if (existingLead) {
              result.leadId = existingLead.id;
              result.leadCreated = false;
              console.log(`  Lead already exists: ${existingLead.id.substring(0, 8)}`);
            } else {
              // Create new lead
              const [newLead] = await db
                .insert(leads)
                .values({
                  campaignId: call.campaignId,
                  contactId: call.contactId,
                  callAttemptId: call.id,
                  accountId: contact?.accountId || null,
                  status: "new",
                  qaStatus: "new",
                  recordingUrl,
                  telnyxCallId: call.telnyxCallId,
                  callDuration: call.callDurationSeconds,
                  dialedNumber: call.phoneDialed,
                  transcriptionStatus: "pending",
                  accountName: result.company,
                })
                .returning();

              result.leadId = newLead.id;
              result.leadCreated = true;
              console.log(`  ✅ Lead created: ${newLead.id.substring(0, 8)}`);
            }

            // Step 3: Transcribe the call
            if (result.leadId) {
              console.log("  Transcribing...");
              try {
                const transcribed = await transcribeLeadCall(result.leadId);
                result.transcribed = transcribed;
                if (transcribed) {
                  console.log("  ✅ Transcribed");

                  // Step 4: Analyze the call
                  console.log("  Analyzing...");
                  try {
                    const analysisResult = await analyzeLeadQualification(result.leadId);
                    result.analyzed = !!analysisResult;
                    if (analysisResult) {
                      console.log("  ✅ Analyzed");

                      // Get the analysis result
                      const [updatedLead] = await db
                        .select()
                        .from(leads)
                        .where(eq(leads.id, result.leadId))
                        .limit(1);

                      if (updatedLead?.aiAnalysis) {
                        const analysis = typeof updatedLead.aiAnalysis === "string"
                          ? JSON.parse(updatedLead.aiAnalysis)
                          : updatedLead.aiAnalysis;

                        result.suggestedDisposition = analysis.qualificationStatus || analysis.disposition || "needs_review";
                        console.log(`  Suggested disposition: ${result.suggestedDisposition}`);
                      }
                    }
                  } catch (analyzeError: any) {
                    console.log(`  ⚠️ Analysis failed: ${analyzeError.message}`);
                  }
                }
              } catch (transcribeError: any) {
                console.log(`  ⚠️ Transcription failed: ${transcribeError.message}`);
              }
            }
          }
        }
      } else {
        console.log("  ❌ No recording found on Telnyx");
      }
    } catch (error: any) {
      result.error = error.message;
      console.log(`  ❌ Error: ${error.message}`);
    }

    results.push(result);
  }

  // Summary
  console.log("\n=== RECOVERY SUMMARY ===");
  const withRecordings = results.filter((r) => r.recordingFound);
  const leadsCreated = results.filter((r) => r.leadCreated);
  const transcribed = results.filter((r) => r.transcribed);
  const analyzed = results.filter((r) => r.analyzed);
  const errors = results.filter((r) => r.error);

  console.log(`Total processed: ${results.length}`);
  console.log(`Recordings found: ${withRecordings.length}`);
  console.log(`Leads created: ${leadsCreated.length}`);
  console.log(`Transcribed: ${transcribed.length}`);
  console.log(`Analyzed: ${analyzed.length}`);
  console.log(`Errors: ${errors.length}`);

  // Show suggested dispositions
  const qualified = results.filter((r) => r.suggestedDisposition === "qualified");
  const notInterested = results.filter((r) => r.suggestedDisposition === "not_qualified" || r.suggestedDisposition === "not_interested");

  console.log("");
  console.log("Suggested re-dispositions:");
  console.log(`  Should be QUALIFIED: ${qualified.length}`);
  console.log(`  Should be NOT_INTERESTED: ${notInterested.length}`);

  return results;
}

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fetchOnly = args.includes("--fetch-only");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 5;

recoverMisclassifiedCalls({ limit, dryRun, fetchRecordingsOnly: fetchOnly })
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
