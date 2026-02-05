import "dotenv/config";
import axios from "axios";
import fetch from "node-fetch";
import { pool } from "./server/db";
import { submitTranscription } from "./server/services/google-transcription";
import { uploadToS3, getPresignedDownloadUrl } from "./server/lib/s3";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const BASE_URL = "https://api.telnyx.com/v2";

async function main() {
  try {
    console.log("=".repeat(80));
    console.log("Fixing Missing Recording - Gray Bekurs 40-Second Call");
    console.log("=".repeat(80));

    // Get Gray's call record
    const result = await pool.query<any>(`
      SELECT id, contact_email, telnyx_call_id, transcript, created_at
      FROM leads
      WHERE contact_email LIKE '%Gray%'
        AND created_at >= '2026-01-15'::date
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log("Gray Bekurs call not found");
      return;
    }

    const call = result.rows[0];
    console.log(`\nFound call: ${call.contact_email}`);
    console.log(`  Telnyx Call ID: ${call.telnyx_call_id}`);
    console.log(`  Created: ${call.created_at}`);
    console.log(`  Current Transcript Length: ${call.transcript ? call.transcript.length : 0} chars`);

    // Try to list recordings by searching with the telnyx_call_id
    console.log("\nSearching Telnyx API for fresh recording URL...");
    
    // Since we have the telnyx_call_id, search recordings from the same day
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let recordingUrl: string | null = null;
    let nextPageToken: string | null = null;
    let page = 0;

    do {
      page++;
      console.log(`  Querying page ${page}...`);

      const params: any = {
        "filter[created_at][gte]": sevenDaysAgo.toISOString(),
        "page[size]": 100,
      };

      if (nextPageToken) {
        params["page[after]"] = nextPageToken;
      }

      const response = await axios.get(`${BASE_URL}/recordings`, {
        headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
        params,
      });

      // Look for a recording matching this time range
      if (response.data.data) {
        // Find the most recent call from the same timestamp
        const callTime = new Date(call.created_at);
        const recordings = response.data.data.filter((r: any) => {
          const recTime = new Date(r.created_at);
          // Within 5 minutes of call time
          return Math.abs(recTime.getTime() - callTime.getTime()) < 5 * 60 * 1000;
        });

        if (recordings.length > 0) {
          const rec = recordings[0];
          if (rec.download_urls?.wav) {
            recordingUrl = rec.download_urls.wav;
            console.log(`  ✓ Found matching recording: ${rec.id}`);
            console.log(`    Duration: ${(rec.duration_millis / 1000).toFixed(1)} seconds`);
            break;
          }
        }
      }

      if (response.data.meta?.pagination?.next_page_token) {
        nextPageToken = response.data.meta.pagination.next_page_token;
      } else {
        break;
      }
    } while (nextPageToken && page < 10);

    if (!recordingUrl) {
      console.log("  ⚠ No fresh recording found in Telnyx API");
      return;
    }

    console.log("\nDownloading recording...");
    const response = await fetch(recordingUrl);

    if (!response.ok) {
      console.log(`  ⚠ Download failed: ${response.status}`);
      return;
    }

    const buffer = await response.buffer();
    console.log(`  ✓ Downloaded ${buffer.length} bytes`);

    // Upload to S3
    const s3Key = `recordings/leads/${call.id}/${call.telnyx_call_id}.wav`;
    console.log(`\nUploading to S3: ${s3Key}`);
    await uploadToS3(s3Key, buffer, "audio/wav");
    console.log(`  ✓ Uploaded`);

    // Get presigned URL
    const presignedUrl = await getPresignedDownloadUrl(s3Key);
    console.log(`  ✓ Generated presigned URL`);

    // Submit for transcription
    console.log(`\nSubmitting for transcription...`);
    const transcriptionId = await submitTranscription(presignedUrl);

    if (!transcriptionId) {
      console.log(`  ⚠ Transcription submission failed`);
      return;
    }

    console.log(`  ✓ Transcription submitted: ${transcriptionId}`);

    // Update database
    await pool.query(
      `UPDATE leads SET recording_s3_key = $1, recording_url = $2, transcription_status = $3 WHERE id = $4`,
      [s3Key, presignedUrl, "pending", call.id]
    );

    console.log(`  ✓ Database updated`);
    console.log(`\n✅ Gray Bekurs recording processed and transcription submitted`);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
