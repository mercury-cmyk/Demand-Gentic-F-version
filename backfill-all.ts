
import { pool } from "./server/db";
import { storeRecordingFromWebhook, isRecordingStorageEnabled } from "./server/services/recording-storage";

async function backfillAllRecordings() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 1000;

  console.log("BACKFILLING ALL RECORDINGS TO GCS...");

  if (!isRecordingStorageEnabled()) {
    console.error("GCS/S3 storage is NOT configured!");
    process.exit(1);
  }

  // Find recordings without S3 keys - removed date constraint
  const result = await pool.query(`
    SELECT 
      id,
      contact_name,
      recording_url,
      recording_s3_key,
      call_duration,
      updated_at
    FROM leads
    WHERE recording_url IS NOT NULL
      AND recording_s3_key IS NULL
      AND call_duration > 0
    ORDER BY updated_at DESC
    LIMIT $1
  `, [limit]);

  console.log(`Found ${result.rows.length} recordings without permanent storage.`);

  if (result.rows.length === 0) {
    console.log("All recordings are already stored.");
    process.exit(0);
  }

  if (!execute) {
    console.log("DRY RUN: skipping uploads. Use --execute to apply.");
    process.exit(0);
  }

  for (const row of result.rows) {
    try {
      console.log(`Processing lead ${row.id}...`);
      const s3Key = await storeRecordingFromWebhook(row.id, row.recording_url);
      if (s3Key) {
        console.log(`  Stored: ${s3Key}`);
      } else {
        console.log(`  Failed/Expired: ${row.recording_url}`);
      }
    } catch (err: any) {
      console.error(`  Error processing lead ${row.id}: ${err.message}`);
    }
  }

  console.log("Finished backfill.");
  process.exit(0);
}

backfillAllRecordings().catch(console.error);
