import { db } from "../server/db";
import { callSessions } from "@shared/schema";
import { and, gte, gt, isNotNull, isNull, or, desc, sql } from "drizzle-orm";
import { runPostCallAnalysis } from "../server/services/post-call-analyzer";
import { getPresignedDownloadUrl, BUCKET, isS3Configured } from "../server/lib/storage";
import { storeCallSessionRecording } from "../server/services/recording-storage";
import { fetchTelnyxRecording, searchRecordingsByDialedNumber } from "../server/services/telnyx-recordings";

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
 *   TRANSCRIBE_MAX_DURATION  (default 600)
 * Flags:
 *   --dry-run  : do not write transcripts; only list actions
 */
async function main() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const batchLimit = parseInt(process.env.TRANSCRIBE_BATCH_LIMIT || "100", 10);
  const minDurationSec = parseInt(process.env.TRANSCRIBE_MIN_DURATION || "10", 10);
  const maxDurationSec = parseInt(process.env.TRANSCRIBE_MAX_DURATION || "600", 10); // limit inline payloads

  console.log(
    `[Batch] Looking for calls since ${threeDaysAgo.toISOString()} | minDuration=${minDurationSec}s | maxDuration=${maxDurationSec}s | limit=${batchLimit} | dryRun=${dryRun}`
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
      toNumber: callSessions.toNumberE164,
    })
    .from(callSessions)
    .where(
      and(
        gt(callSessions.createdAt, threeDaysAgo),
        or(isNotNull(callSessions.recordingUrl), isNotNull(callSessions.recordingS3Key)),
        gte(callSessions.durationSec, minDurationSec),
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
  let stored = 0;

  async function resolveRecording(call: (typeof calls)[number]): Promise<{
    presignedUrl: string | null;
    gcsUri: string | null;
    reasonSkipped?: string;
  }> {
    let s3Key = call.recordingS3Key || null;
    let presignedUrl: string | null = null;
    let gcsUri: string | null = null;

    const setFromKey = async (key: string) => {
      if (!isS3Configured()) return;
      s3Key = key;
      presignedUrl = await getPresignedDownloadUrl(key, 3600);
      gcsUri = `gs://${BUCKET}/${key}`;
    };

    // 1) Already stored
    if (s3Key) {
      await setFromKey(s3Key);
      return { presignedUrl, gcsUri };
    }

    // Helper to store and refresh URLs
    const storeFromUrl = async (url: string | null): Promise<boolean> => {
      if (!url) return false;
      const newKey = dryRun ? null : await storeCallSessionRecording(call.id, url, call.durationSec || undefined);
      if (newKey) {
        stored++;
        await setFromKey(newKey);
        return true;
      }
      return false;
    };

    // 2) Use existing recordingUrl
    if (await storeFromUrl(call.recordingUrl)) {
      return { presignedUrl, gcsUri };
    }

    // 3) Refresh via Telnyx call_control_id
    if (call.telnyxCallId) {
      try {
        const refreshed = await fetchTelnyxRecording(call.telnyxCallId);
        if (await storeFromUrl(refreshed)) {
          return { presignedUrl, gcsUri };
        }
      } catch (err: any) {
        console.warn(`[Batch] Telnyx fetch failed for ${call.id}: ${err.message}`);
      }
    }

    // 4) Phone search window ±30m
    if (call.toNumber) {
      const start = new Date(call.createdAt);
      start.setMinutes(start.getMinutes() - 30);
      const end = new Date(call.createdAt);
      end.setMinutes(end.getMinutes() + 30);
      try {
        const recs = await searchRecordingsByDialedNumber(call.toNumber, start, end);
        const completed = recs.filter(r => r.status === "completed");
        const pick = (completed.length ? completed : recs).sort((a, b) => {
          const da = Math.abs((a.duration_millis || 0) / 1000 - (call.durationSec || 0));
          const db = Math.abs((b.duration_millis || 0) / 1000 - (call.durationSec || 0));
          return da - db;
        })[0];
        const url = pick?.download_urls?.mp3 || pick?.download_urls?.wav;
        if (await storeFromUrl(url || null)) {
          return { presignedUrl, gcsUri };
        }
      } catch (err: any) {
        console.warn(`[Batch] Phone search failed for ${call.id}: ${err.message}`);
      }
    }

    return { presignedUrl, gcsUri, reasonSkipped: "no-usable-recording" };
  }

  for (const call of calls) {
    // Extra guard in case transcript got filled between query and processing
    if (call.aiTranscript && call.aiTranscript.length > 50) {
      skipped++;
      continue;
    }

    console.log(
      `[Batch][PROCESS] ${call.id} | ${call.durationSec || 0}s | telnyx=${call.telnyxCallId || "n/a"}`
    );

    // Resolve recording & storage
    let recording: { presignedUrl: string | null; gcsUri: string | null; reasonSkipped?: string };
    try {
      recording = await resolveRecording(call);
    } catch (err: any) {
      errors++;
      console.error(`  ❌ Recording resolution failed: ${err.message}`);
      continue;
    }

    if (!recording.presignedUrl && !recording.gcsUri) {
      skipped++;
      console.log(`  ⚠️ Skipping (no recording) reason=${recording.reasonSkipped || "unknown"}`);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would transcribe using ${recording.gcsUri || recording.presignedUrl}`);
      continue;
    }

    try {
      const result = await runPostCallAnalysis(call.id, {
        callDurationSec: call.durationSec || 0,
        disposition: call.aiDisposition || undefined,
        contactId: call.contactId || undefined,
        campaignId: call.campaignId || undefined,
        gcsUri: recording.gcsUri || undefined,
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
  console.log(`- Skipped (already had transcript or no recording): ${skipped}`);
  console.log(`- Stored/updated recordings: ${stored}`);
  console.log(`- Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
