import { db } from "../server/db";
import { callSessions } from "@shared/schema";
import { and, gte, gt, isNotNull, isNull, or, desc, sql } from "drizzle-orm";
import { runPostCallAnalysis } from "../server/services/post-call-analyzer";

/**
 * Transcribe recent calls in small batches to control cost/time.
 * - Only calls from the last 3 days
 * - Must have a recording (URL or S3 key)
 * - Minimum duration filter (default 10s) to skip zero/very short calls
 * - Only calls missing a meaningful transcript (<50 chars)
 * - Processes a limited batch (default 100)
 *
 * Configure via env:
 *   TRANSCRIBE_BATCH_LIMIT   (default 100)
 *   TRANSCRIBE_MIN_DURATION  (default 10)
 */
async function main() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const batchLimit = parseInt(process.env.TRANSCRIBE_BATCH_LIMIT || "100", 10);
  const minDurationSec = parseInt(process.env.TRANSCRIBE_MIN_DURATION || "10", 10);
  const maxDurationSec = parseInt(process.env.TRANSCRIBE_MAX_DURATION || "600", 10); // keep inline STT payload reasonable

  console.log(
    `[Batch] Looking for calls since ${threeDaysAgo.toISOString()} | minDuration=${minDurationSec}s | maxDuration=${maxDurationSec}s | limit=${batchLimit}`
  );

  // Pre-filter to minimize workload at the DB level
  const calls = await db
    .select({
      id: callSessions.id,
      createdAt: callSessions.createdAt,
      recordingUrl: callSessions.recordingUrl,
      recordingS3Key: callSessions.recordingS3Key,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      telnyxCallId: callSessions.telnyxCallId,
      aiDisposition: callSessions.aiDisposition,
    })
    .from(callSessions)
    .where(
      and(
        gt(callSessions.createdAt, threeDaysAgo),
        or(isNotNull(callSessions.recordingUrl), isNotNull(callSessions.recordingS3Key)),
        gte(callSessions.durationSec, minDurationSec),
        // Avoid very long audio that exceeds inline STT limits; those should be handled via background jobs/GCS URIs
        gte(callSessions.durationSec, 0), // guard against null
        sql`${callSessions.durationSec} <= ${maxDurationSec}`,
        or(
          isNull(callSessions.aiTranscript),
          sql`char_length(${callSessions.aiTranscript}) < 50`
        )
      )
    )
    .orderBy(desc(callSessions.createdAt))
    .limit(batchLimit);

  console.log(`[Batch] Found ${calls.length} candidates to transcribe.`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const call of calls) {
    // Extra guard in case transcript got filled between query and processing
    if (call.aiTranscript && call.aiTranscript.length > 50) {
      skipped++;
      continue;
    }

    console.log(
      `[Batch][PROCESS] ${call.id} | ${call.durationSec || 0}s | telnyx=${call.telnyxCallId || "n/a"}`
    );

    try {
      const result = await runPostCallAnalysis(call.id, {
        callDurationSec: call.durationSec || 0,
        disposition: call.aiDisposition || undefined,
        contactId: call.contactId || undefined,
        campaignId: call.campaignId || undefined,
      });

      if (result.success) {
        processed++;
        console.log(
          `  ✅ transcript=${result.fullTranscript.length} chars | turns=${result.metrics.totalTurns}`
        );
      } else {
        errors++;
        console.error(`  ❌ Failed: ${result.error || "unknown error"}`);
      }
    } catch (err: any) {
      errors++;
      console.error(`  ❌ Exception: ${err.message}`);
    }
  }

  console.log("\n[Batch] Summary");
  console.log(`- Processed: ${processed}`);
  console.log(`- Skipped (already had transcript): ${skipped}`);
  console.log(`- Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
