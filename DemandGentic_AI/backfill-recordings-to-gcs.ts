import { pool } from "./server/db";
import { storeRecordingFromWebhook, isRecordingStorageEnabled } from "./server/services/recording-storage";

async function backfillRecordingsToGCS() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");
  const verbose = args.includes("--verbose");
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 50;

  console.log("========================================");
  console.log("BACKFILL RECORDINGS TO GCS/S3");
  console.log("========================================\n");

  if (!isRecordingStorageEnabled()) {
    console.log("❌ GCS/S3 storage is NOT configured!");
    console.log("\nTo enable, set environment variables:");
    console.log("  GCS_PROJECT_ID or GOOGLE_CLOUD_PROJECT");
    console.log("  GCS_BUCKET or S3_BUCKET");
    console.log("  GCS_KEY_FILE (optional, uses default service account in Cloud Run)");
    process.exit(1);
  }

  console.log("✓ GCS/S3 storage is configured\n");

  if (dryRun) {
    console.log("DRY RUN MODE - No uploads will be performed");
    console.log("Run with --execute to actually store recordings\n");
  } else {
    console.log("EXECUTE MODE - Recordings WILL be uploaded\n");
  }

  // Find recordings without S3 keys
  const result = await pool.query(`
    SELECT 
      id,
      contact_name,
      recording_url,
      recording_s3_key,
      call_duration,
      updated_at
    FROM leads
    WHERE updated_at >= '2026-01-15'
      AND recording_url IS NOT NULL
      AND recording_s3_key IS NULL
      AND call_duration > 0
    ORDER BY updated_at DESC
    LIMIT $1
  `, [limit]);

  console.log(`Found ${result.rows.length} recordings without permanent storage\n`);

  if (result.rows.length === 0) {
    console.log("✓ All recordings already have permanent storage!");
    process.exit(0);
  }

  let stored = 0;
  let failed = 0;
  let expired = 0;

  for (const row of result.rows) {
    if (verbose) {
      console.log(`\nProcessing: ${row.id}`);
      console.log(`  Contact: ${row.contact_name}`);
      console.log(`  Duration: ${row.call_duration}s`);
      console.log(`  Updated: ${row.updated_at}`);
    }

    if (dryRun) {
      stored++;
      continue;
    }

    try {
      const s3Key = await storeRecordingFromWebhook(row.id, row.recording_url);
      
      if (s3Key) {
        stored++;
        if (verbose) {
          console.log(`  ✓ Stored: ${s3Key}`);
        }
      } else {
        // Check if URL expired
        if (row.recording_url.includes('X-Amz-Expires')) {
          expired++;
          if (verbose) {
            console.log(`  ✗ URL expired (Telnyx signed URL)`);
          }
        } else {
          failed++;
          if (verbose) {
            console.log(`  ✗ Failed to store`);
          }
        }
      }
    } catch (error: any) {
      if (error.message?.includes('Forbidden') || error.message?.includes('403')) {
        expired++;
        if (verbose) {
          console.log(`  ✗ URL expired (403 Forbidden)`);
        }
      } else {
        failed++;
        if (verbose) {
          console.log(`  ✗ Error: ${error.message}`);
        }
      }
    }
  }

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Successfully stored: ${stored}`);
  console.log(`URL expired (cannot retrieve): ${expired}`);
  console.log(`Failed (other errors): ${failed}`);
  console.log(`Total processed: ${result.rows.length}`);

  if (dryRun) {
    console.log("\nTo apply changes, run:");
    console.log("  npx tsx backfill-recordings-to-gcs.ts --execute --verbose");
  }

  if (expired > 0) {
    console.log("\n⚠️  WARNING:");
    console.log(`${expired} recording(s) have expired URLs and cannot be retrieved.`);
    console.log("Going forward, recordings will be stored immediately via webhook.");
  }

  process.exit(0);
}

backfillRecordingsToGCS().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});