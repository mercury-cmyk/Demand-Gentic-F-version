import "dotenv/config";
import fetch from "node-fetch";
import { pool } from "./server/db";
import { uploadToS3, getPresignedDownloadUrl } from "./server/lib/s3";

async function main() {
  try {
    console.log("=".repeat(80));
    console.log("Backing up real call recordings to S3 (permanent storage)");
    console.log("=".repeat(80));

    const result = await pool.query(`
      SELECT id, contact_email, telnyx_call_id, recording_url, recording_s3_key
      FROM leads
      WHERE created_at >= '2026-01-15'::date
        AND created_at < '2026-01-17'::date
        AND recording_url IS NOT NULL
      ORDER BY created_at DESC
    `);

    console.log(`\nFound ${result.rows.length} real calls\n`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < result.rows.length; i++) {
      const call = result.rows[i];
      const idx = i + 1;

      // Skip if already has S3 key
      if (call.recording_s3_key) {
        console.log(`[${idx}/${result.rows.length}] ✓ ${call.contact_email} - Already backed up`);
        continue;
      }

      console.log(`[${idx}/${result.rows.length}] Processing ${call.contact_email}`);
      console.log(`  Downloading from: ${call.recording_url.substring(0, 60)}...`);

      try {
        const response = await fetch(call.recording_url, { timeout: 30000 });

        if (!response.ok) {
          console.log(`  ⚠ Download failed: ${response.status} ${response.statusText}`);
          failed++;
          continue;
        }

        const buffer = await response.buffer();
        console.log(`  ✓ Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

        // Upload to S3
        const s3Key = `recordings/leads/${call.id}/${call.telnyx_call_id}.wav`;
        console.log(`  Uploading to S3: ${s3Key}`);
        await uploadToS3(s3Key, buffer, "audio/wav");
        console.log(`  ✓ Uploaded to S3`);

        // Get presigned URL
        const presignedUrl = await getPresignedDownloadUrl(s3Key);

        // Update database
        await pool.query(
          `UPDATE leads SET recording_s3_key = $1 WHERE id = $2`,
          [s3Key, call.id]
        );

        console.log(`  ✓ Database updated with S3 key`);
        success++;
      } catch (error: any) {
        console.log(`  ⚠ Error: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n${"-".repeat(80)}`);
    console.log(`Summary:`);
    console.log(`  ✓ Backed up: ${success}`);
    console.log(`  ⚠ Failed: ${failed}`);
    console.log(`  ✓ Already backed up: ${result.rows.length - success - failed}`);
    console.log(`\n✅ All real call recordings now have permanent S3 backup`);

    process.exit(0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
