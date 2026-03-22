/**
 * Re-qualify calls that were incorrectly marked as no_answer
 * due to the disposition overwrite bug.
 *
 * This script:
 * 1. Finds calls marked as no_answer but with engagement signs (duration > 30s)
 * 2. Checks if they have transcripts stored in leads table
 * 3. Analyzes transcripts to determine correct disposition
 * 4. Exports results to CSV
 * 5. Optionally updates dispositions
 */

import { db } from "./server/db";
import { dialerCallAttempts, contacts, accounts, campaigns, leads } from "./shared/schema";
import { eq, and, desc, or, gt, isNotNull } from "drizzle-orm";
import * as fs from "fs";

interface MisclassifiedCall {
  callId: string;
  telnyxCallId: string | null;
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactName: string;
  company: string;
  phone: string;
  date: Date;
  duration: number | null;
  connected: boolean;
  hasRecording: boolean;
  likelihood: string;
  // Transcript info
  hasTranscript: boolean;
  transcript: string | null;
  leadId: string | null;
  aiAnalysis: any;
  suggestedDisposition: string | null;
}

async function findMisclassifiedCallsWithTranscripts(): Promise {
  console.log("=== FINDING MISCLASSIFIED CALLS WITH TRANSCRIPTS ===");
  console.log("");

  // Find calls marked as no_answer but with engagement signs
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
    .limit(200);

  console.log(`Found ${suspiciousCalls.length} potentially misclassified calls`);
  console.log("");

  const results: MisclassifiedCall[] = [];

  for (let i = 0; i  0;
        transcript = lead.transcript;
        aiAnalysis = lead.aiAnalysis;

        // Determine suggested disposition from AI analysis
        if (aiAnalysis) {
          const analysis = typeof aiAnalysis === "string" ? JSON.parse(aiAnalysis) : aiAnalysis;
          if (analysis.qualificationStatus === "qualified") {
            suggestedDisposition = "qualified";
          } else if (analysis.qualificationStatus === "not_qualified") {
            suggestedDisposition = "not_interested";
          } else if (analysis.isCallback || analysis.callbackRequested) {
            suggestedDisposition = "callback";
          }
        }
      }
    }

    // Calculate likelihood
    let likelihood = "LOW";
    if (call.callDurationSeconds && call.callDurationSeconds > 60) likelihood = "HIGH";
    else if (call.callDurationSeconds && call.callDurationSeconds > 30) likelihood = "MEDIUM";
    else if (call.connected) likelihood = "MEDIUM";

    results.push({
      callId: call.id,
      telnyxCallId: call.telnyxCallId,
      campaignId: call.campaignId,
      campaignName: campaign?.name || call.campaignId,
      contactId: call.contactId,
      contactName: `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim(),
      company: accountName,
      phone: contact?.directPhone || contact?.mobilePhone || "",
      date: call.createdAt,
      duration: call.callDurationSeconds,
      connected: call.connected,
      hasRecording: !!call.recordingUrl,
      likelihood,
      hasTranscript,
      transcript,
      leadId,
      aiAnalysis,
      suggestedDisposition,
    });
  }

  console.log("\n");
  return results;
}

function analyzeResults(results: MisclassifiedCall[]) {
  console.log("=== ANALYSIS SUMMARY ===");
  console.log("");

  const highLikelihood = results.filter((c) => c.likelihood === "HIGH");
  const mediumLikelihood = results.filter((c) => c.likelihood === "MEDIUM");
  const withTranscripts = results.filter((c) => c.hasTranscript);
  const withLeads = results.filter((c) => c.leadId);
  const suggestedQualified = results.filter((c) => c.suggestedDisposition === "qualified");
  const suggestedNotInterested = results.filter((c) => c.suggestedDisposition === "not_interested");
  const suggestedCallback = results.filter((c) => c.suggestedDisposition === "callback");

  console.log("Total misclassified calls:", results.length);
  console.log("");
  console.log("By likelihood:");
  console.log("  HIGH (duration > 60s):", highLikelihood.length);
  console.log("  MEDIUM (30-60s or connected):", mediumLikelihood.length);
  console.log("  LOW:", results.length - highLikelihood.length - mediumLikelihood.length);
  console.log("");
  console.log("Data availability:");
  console.log("  With existing leads:", withLeads.length);
  console.log("  With transcripts:", withTranscripts.length);
  console.log("");
  console.log("Suggested re-dispositions (from AI analysis):");
  console.log("  Should be QUALIFIED:", suggestedQualified.length);
  console.log("  Should be NOT_INTERESTED:", suggestedNotInterested.length);
  console.log("  Should be CALLBACK:", suggestedCallback.length);
  console.log("  Unknown/needs review:", results.length - suggestedQualified.length - suggestedNotInterested.length - suggestedCallback.length);

  return {
    total: results.length,
    highLikelihood: highLikelihood.length,
    mediumLikelihood: mediumLikelihood.length,
    withTranscripts: withTranscripts.length,
    withLeads: withLeads.length,
    suggestedQualified: suggestedQualified.length,
    suggestedNotInterested: suggestedNotInterested.length,
    suggestedCallback: suggestedCallback.length,
  };
}

function exportToCSV(results: MisclassifiedCall[], filename: string) {
  const headers = [
    "Call ID",
    "Telnyx ID",
    "Campaign",
    "Contact Name",
    "Company",
    "Phone",
    "Date",
    "Duration (s)",
    "Likelihood",
    "Has Transcript",
    "Has Lead",
    "Suggested Disposition",
    "Current Disposition",
  ];

  const rows = results.map((r) => [
    r.callId,
    r.telnyxCallId || "",
    r.campaignName,
    r.contactName,
    r.company,
    r.phone,
    r.date.toISOString(),
    r.duration?.toString() || "",
    r.likelihood,
    r.hasTranscript ? "Yes" : "No",
    r.leadId ? "Yes" : "No",
    r.suggestedDisposition || "needs_review",
    "no_answer",
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(","))].join("\n");

  fs.writeFileSync(filename, csv);
  console.log(`\nExported ${results.length} calls to ${filename}`);
}

function printHighPriorityTable(results: MisclassifiedCall[]) {
  // Filter to HIGH likelihood with transcripts
  const highPriority = results.filter((r) => r.likelihood === "HIGH" && r.hasTranscript);

  if (highPriority.length === 0) {
    console.log("\nNo HIGH likelihood calls with transcripts found.");
    return;
  }

  console.log("");
  console.log("=== HIGH PRIORITY: Calls with Transcripts (Need Review) ===");
  console.log("Call ID   | Duration | Suggested    | Contact              | Company");
  console.log("-".repeat(90));

  for (const call of highPriority.slice(0, 20)) {
    const suggested = (call.suggestedDisposition || "review").padEnd(12);
    console.log(
      `${call.callId.substring(0, 8).padEnd(10)}| ${String(call.duration || 0).padEnd(9)}| ${suggested} | ${call.contactName.padEnd(21).substring(0, 21)}| ${call.company.substring(0, 25)}`
    );
  }

  if (highPriority.length > 20) {
    console.log(`... and ${highPriority.length - 20} more`);
  }
}

async function main() {
  try {
    const results = await findMisclassifiedCallsWithTranscripts();

    if (results.length === 0) {
      console.log("No misclassified calls found.");
      return;
    }

    // Analyze and print summary
    analyzeResults(results);

    // Print high priority table
    printHighPriorityTable(results);

    // Export to CSV
    const filename = `misclassified-calls-${new Date().toISOString().split("T")[0]}.csv`;
    exportToCSV(results, filename);

    // Also export just the HIGH likelihood ones
    const highLikelihood = results.filter((r) => r.likelihood === "HIGH");
    if (highLikelihood.length > 0) {
      const highFilename = `high-priority-misclassified-${new Date().toISOString().split("T")[0]}.csv`;
      exportToCSV(highLikelihood, highFilename);
    }

    console.log("");
    console.log("=== NEXT STEPS ===");
    console.log("1. Review the CSV files for detailed data");
    console.log("2. Calls with existing transcripts can be re-analyzed");
    console.log("3. HIGH likelihood calls without transcripts may need manual review");
    console.log("4. Run with --fix flag to update dispositions based on AI analysis");

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });