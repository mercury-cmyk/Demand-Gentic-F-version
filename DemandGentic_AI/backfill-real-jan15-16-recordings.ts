import "dotenv/config";
import axios from "axios";
import fetch from "node-fetch";
import { pool } from "./server/db";
import { submitTranscription } from "./server/services/google-transcription";
import { uploadToS3, getPresignedDownloadUrl } from "./server/lib/s3";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const BASE_URL = "https://api.telnyx.com/v2";

interface Call {
  id: string;
  contactEmail: string;
  recordingUrl: string | null;
  transcript: string | null;
  telnyxCallId: string | null;
  recordingS3Key: string | null;
  createdAt: Date;
}

async function getRecordingFromTelnyxAPI(
  callLegId?: string,
  callControlId?: string,
  recordingId?: string
): Promise {
  try {
    // If we have a recording ID, try to get it directly
    if (recordingId) {
      const response = await axios.get(`${BASE_URL}/recordings/${recordingId}`, {
        headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
      });
      if (response.data.data?.download_urls?.wav) {
        return response.data.data.download_urls.wav;
      }
    }

    // Try searching by call_leg_id
    if (callLegId) {
      const response = await axios.get(`${BASE_URL}/recordings`, {
        headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
        params: {
          "filter[call_leg_id]": callLegId,
          "page[size]": 1,
        },
      });

      if (response.data.data?.length > 0) {
        const rec = response.data.data[0];
        if (rec.download_urls?.wav) {
          return rec.download_urls.wav;
        }
      }
    }
  } catch (error) {
    console.log(`  ⚠ Telnyx API error: ${error}`);
  }

  return null;
}

async function downloadRecording(url: string, recordingId: string): Promise {
  try {
    console.log(`  Downloading recording...`);
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`  ⚠ Download failed: ${response.status}`);
      return null;
    }

    const buffer = await response.buffer();
    console.log(`  ✓ Downloaded ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.log(`  ⚠ Download error: ${error}`);
    return null;
  }
}

async function getCalls(): Promise {
  console.log("Fetching real calls from Jan 15-16...");

  const result = await pool.query(`
    SELECT
      id,
      contact_email AS "contactEmail",
      recording_url AS "recordingUrl",
      transcript,
      telnyx_call_id AS "telnyxCallId",
      recording_s3_key AS "recordingS3Key",
      created_at AS "createdAt"
    FROM leads
    WHERE created_at >= '2026-01-15'::date
      AND created_at  {
  try {
    console.log(`\nProcessing call: ${call.contactEmail}`);
    console.log(`  Contact: ${call.contactEmail}`);
    console.log(`  Telnyx Call ID: ${call.telnyxCallId}`);
    console.log(`  Recording URL: ${call.recordingUrl ? 'present' : 'missing'}`);
    console.log(`  Recording S3 Key: ${call.recordingS3Key ? 'present' : 'missing'}  `);

    // Check if already has transcript
    if (call.transcript && call.transcript.length > 50) {
      console.log(`  ✓ Already has transcript (${call.transcript.length} chars), skipping`);
      return;
    }

    let recordingUrl = call.recordingUrl;

    // If URL might be expired or missing, try to fetch fresh one from Telnyx
    if (!recordingUrl) {
      console.log(`  Fetching fresh recording URL from Telnyx...`);
      recordingUrl = await getRecordingFromTelnyxAPI(
        call.telnyxCallId || undefined,
        undefined,
        undefined
      );

      if (!recordingUrl) {
        console.log(`  ⚠ No recording URL available`);
        return;
      }

      console.log(`  ✓ Got fresh URL from Telnyx`);
    }

    // Download the recording
    const recordingBuffer = await downloadRecording(recordingUrl, call.id);
    if (!recordingBuffer) {
      console.log(`  ⚠ Failed to download recording`);
      return;
    }

    // Generate S3 key
    const s3Key = `recordings/leads/${call.id}/${call.telnyxCallId || "recording"}.wav`;

    // Upload to GCS/S3
    console.log(`  Uploading to S3...`);
    await uploadToS3(s3Key, recordingBuffer, "audio/wav");
    console.log(`  ✓ Uploaded to S3`);

    // Get presigned URL for transcription
    const presignedUrl = await getPresignedDownloadUrl(s3Key);
    console.log(`  ✓ Generated presigned URL`);

    // Submit for transcription
    console.log(`  Submitting for transcription...`);
    const transcriptionId = await submitTranscription(presignedUrl);

    if (!transcriptionId) {
      console.log(`  ⚠ Transcription submission failed`);
      return;
    }

    console.log(`  ✓ Transcription submitted: ${transcriptionId}`);

    // Update database
    await pool.query(
      `UPDATE leads SET recording_s3_key = $1, recording_url = $2, "transcriptionStatus" = $3 WHERE id = $4`,
      [s3Key, presignedUrl, "pending", call.id]
    );

    console.log(`  ✓ Updated database`);
    console.log(`  ✅ Call processing complete`);
  } catch (error) {
    console.error(`  ❌ Error processing call ${call.contactEmail}:`, error);
  }
}

async function main() {
  try {
    console.log("=".repeat(80));
    console.log("Real Calls Backfill - Jan 15-16 Recordings & Transcription");
    console.log("=".repeat(80));

    const calls = await getCalls();

    if (calls.length === 0) {
      console.log("No calls found for Jan 15-16");
      return;
    }

    console.log(`\nProcessing ${calls.length} real calls...\n`);

    let processed = 0;
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;

    for (const call of calls) {
      processed++;
      console.log(`[${processed}/${calls.length}]`);

      try {
        if (call.transcript && call.transcript.length > 50) {
          skipped++;
          console.log(`  ⊘ Already has transcript, skipping`);
        } else {
          await processCall(call);
          succeeded++;
        }
      } catch (error) {
        console.error(`Error: ${error}`);
        failed++;
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("Summary:");
    console.log(`  Total calls processed: ${processed}`);
    console.log(`  Successful: ${succeeded}`);
    console.log(`  Skipped (already have transcript): ${skipped}`);
    console.log(`  Failed: ${failed}`);
    console.log("=".repeat(80));
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main().then(() => process.exit(0));