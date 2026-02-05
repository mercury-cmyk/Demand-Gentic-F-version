import "dotenv/config";
import axios from "axios";
import fetch from "node-fetch";
import { pool } from "./server/db";
import { submitTranscription } from "./server/services/google-transcription";
import { uploadToS3, getPresignedDownloadUrl } from "./server/lib/s3";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const BASE_URL = "https://api.telnyx.com/v2";

interface TelnyxRecording {
  id: string;
  call_control_id?: string;
  call_leg_id?: string;
  call_session_id?: string;
  download_urls: {
    wav: string;
  };
  created_at: string;
  duration_millis: number;
  status: string;
}

async function listTelnyxRecordings(): Promise<TelnyxRecording[]> {
  console.log("Fetching recordings from Telnyx API...");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recordings: TelnyxRecording[] = [];
  let nextPageToken: string | null = null;

  do {
    const params: any = {
      "filter[created_at][gte]": sevenDaysAgo.toISOString(),
      "page[size]": 100,
    };

    if (nextPageToken) {
      params["page[after]"] = nextPageToken;
    }

    const response = await axios.get(`${BASE_URL}/recordings`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params,
    });

    const data = response.data.data || [];
    recordings.push(...data);

    // Check for pagination
    if (response.data.meta?.pagination?.next_page_token) {
      nextPageToken = response.data.meta.pagination.next_page_token;
    } else {
      break;
    }
  } while (nextPageToken);

  console.log(`Found ${recordings.length} recordings from Telnyx API`);
  return recordings;
}

async function downloadRecording(url: string, recordingId: string): Promise<Buffer> {
  console.log(`  Downloading recording ${recordingId}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.status}`);
  }

  return await response.buffer();
}

async function findLinkedCall(
  callSessionId?: string,
  callLegId?: string,
  callControlId?: string
): Promise<{
  table: string;
  id: string;
} | null> {
  try {
    // Try to find matching record in database by telnyxCallId
    if (callSessionId) {
      const result = await pool.query<any>(
        `SELECT id FROM call_sessions WHERE telnyx_call_id = $1 LIMIT 1`,
        [callSessionId]
      );

      if (result.rows.length > 0) {
        return { table: "call_sessions", id: result.rows[0].id };
      }
    }

    if (callLegId) {
      // Try leads table - search by telnyx_call_leg_id
      const result = await pool.query<any>(
        `SELECT id FROM leads WHERE telnyx_call_leg_id = $1 LIMIT 1`,
        [callLegId]
      );

      if (result.rows.length > 0) {
        return { table: "leads", id: result.rows[0].id };
      }
    }

    if (callControlId) {
      // Try leads table - search by telnyx_call_control_id
      const result = await pool.query<any>(
        `SELECT id FROM leads WHERE telnyx_call_control_id = $1 LIMIT 1`,
        [callControlId]
      );

      if (result.rows.length > 0) {
        return { table: "leads", id: result.rows[0].id };
      }
    }
  } catch (error) {
    console.log(`  ⚠ Database query error: ${error}`);
  }

  return null;
}

async function processRecording(recording: TelnyxRecording): Promise<void> {
  try {
    console.log(`\nProcessing recording: ${recording.id}`);
    console.log(`  Call Session ID: ${recording.call_session_id}`);
    console.log(`  Call Leg ID: ${recording.call_leg_id}`);
    console.log(`  Call Control ID: ${recording.call_control_id}`);

    // Find linked call in database
    const linkedCall = await findLinkedCall(
      recording.call_session_id,
      recording.call_leg_id,
      recording.call_control_id
    );

    if (!linkedCall) {
      console.log("  ⚠ No linked call found in database, skipping");
      return;
    }

    console.log(`  ✓ Found linked ${linkedCall.table}: ${linkedCall.id}`);

    // Download recording from S3 URL (fresh URL from Telnyx API)
    const recordingBuffer = await downloadRecording(
      recording.download_urls.wav,
      recording.id
    );
    console.log(`  ✓ Downloaded ${recordingBuffer.length} bytes`);

    // Generate S3 key
    const s3Key = `recordings/${linkedCall.table}/${linkedCall.id}/${recording.id}.wav`;

    // Upload to GCS/S3
    console.log(`  Uploading to S3: ${s3Key}`);
    await uploadToS3(s3Key, recordingBuffer, "audio/wav");
    console.log(`  ✓ Uploaded to S3`);

    // Get presigned URL for GCS
    const recordingUrl = await getPresignedDownloadUrl(s3Key);
    console.log(`  ✓ Generated presigned URL`);

    // Submit for transcription
    console.log(`  Submitting for transcription...`);
    const transcriptionId = await submitTranscription(recordingUrl);

    if (!transcriptionId) {
      console.log(`  ⚠ Transcription submission failed`);
      return;
    }

    console.log(`  ✓ Transcription submitted: ${transcriptionId}`);

    // Update database
    if (linkedCall.table === "leads") {
      await pool.query(
        `UPDATE leads SET recording_s3_key = $1, recording_url = $2, telnyx_recording_id = $3, "transcriptionStatus" = $4 WHERE id = $5`,
        [s3Key, recordingUrl, recording.id, "pending", linkedCall.id]
      );
    } else if (linkedCall.table === "call_sessions") {
      await pool.query(
        `UPDATE call_sessions SET recording_s3_key = $1, recording_url = $2, telnyx_recording_id = $3 WHERE id = $4`,
        [s3Key, recordingUrl, recording.id, linkedCall.id]
      );
    }

    console.log(`  ✓ Updated ${linkedCall.table} database record`);
    console.log(`  ✅ Recording processing complete`);
  } catch (error) {
    console.error(`  ❌ Error processing recording ${recording.id}:`, error);
  }
}

async function main() {
  try {
    console.log("=".repeat(80));
    console.log("Telnyx Recording Download & Transcription Backfill");
    console.log("=".repeat(80));

    // List recordings from Telnyx API
    const recordings = await listTelnyxRecordings();

    if (recordings.length === 0) {
      console.log("No recordings found");
      return;
    }

    console.log(`\nProcessing ${recordings.length} recordings...\n`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const recording of recordings) {
      processed++;
      console.log(`[${processed}/${recordings.length}]`);

      try {
        await processRecording(recording);
        succeeded++;
      } catch (error) {
        console.error(`Error processing recording: ${error}`);
        failed++;
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("Summary:");
    console.log(`  Total recordings processed: ${processed}`);
    console.log(`  Successful: ${succeeded}`);
    console.log(`  Failed: ${failed}`);
    console.log("=".repeat(80));
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
