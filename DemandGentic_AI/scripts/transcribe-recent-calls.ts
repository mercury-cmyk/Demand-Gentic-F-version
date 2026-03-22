import { db } from "../server/db";
import { callSessions } from "@shared/schema";
import { gt, and, isNotNull, desc, or } from "drizzle-orm";
// We need to import the service. Since it's a script, we use relative path from project root (via tsx) or absolute.
// When running with tsx scripts/..., relative imports inside the script should work if they are relative to the script file.
import { runPostCallAnalysis } from "../server/services/post-call-analyzer";

async function main() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  console.log(`Searching for calls with recordings since ${threeDaysAgo.toISOString()}...`);

  // Find calls with recordings (either URL or S3 Key)
  const calls = await db
    .select()
    .from(callSessions)
    .where(
        and(
            gt(callSessions.createdAt, threeDaysAgo),
            or(isNotNull(callSessions.recordingUrl), isNotNull(callSessions.recordingS3Key))
        )
    )
    .orderBy(desc(callSessions.createdAt));

  console.log(`Found ${calls.length} calls with recordings.`);

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const call of calls) {
      // Check if it already has a "full" transcript
      // We define "full" as having aiTranscript with length > 50 chars to avoid empty/failed ones
      if (call.aiTranscript && call.aiTranscript.length > 50) {
          console.log(`[SKIP] Call ${call.id} already has transcript (${call.aiTranscript.length} chars).`);
          skippedCount++;
          continue;
      }

      console.log(`[PROCESS] Transcribing Call ${call.id} (Duration: ${call.durationSec}s)...`);
      
      try {
          // runPostCallAnalysis handles fetching recording, transcribing, and saving result
          const result = await runPostCallAnalysis(call.id, {
             callDurationSec: call.durationSec || 0,
             disposition: call.aiDisposition || undefined,
             contactId: call.contactId || undefined,
             campaignId: call.campaignId || undefined
          });

          if (result.success) {
              console.log(`  ✅ Success: ${result.metrics.totalTurns} turns, ${result.fullTranscript.length} chars.`);
              processedCount++;
          } else {
              console.error(`  ❌ Failed: ${result.error}`);
              errorCount++;
          }
      } catch (err: any) {
          console.error(`  ❌ Exception: ${err.message}`);
          errorCount++;
      }
  }

  console.log(`\n\nSummary:`);
  console.log(`- Total Found: ${calls.length}`);
  console.log(`- Processed: ${processedCount}`);
  console.log(`- Skipped (Already Transcribed): ${skippedCount}`);
  console.log(`- Errors: ${errorCount}`);
}

main().catch(console.error).finally(() => process.exit(0));