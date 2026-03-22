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
import { transcribeLeadCall } from "./server/services/google-transcription";
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
} = {}): Promise {
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

  for (let i = 0; i  r.recordingFound);
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