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
 * - Only calls missing a meaningful transcript ( {
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
    const storeFromUrl = async (url: string | null): Promise => {
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