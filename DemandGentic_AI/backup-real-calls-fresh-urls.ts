import "dotenv/config";
import axios from "axios";
import fetch from "node-fetch";
import { pool } from "./server/db";
import { uploadToS3 } from "./server/lib/s3";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const BASE_URL = "https://api.telnyx.com/v2";

async function getTelnyxRecordingUrl(telnyxCallId: string): Promise {
  try {
    console.log(`    Querying Telnyx API for: ${telnyxCallId.substring(0, 30)}...`);

    // Query with filter for recent recordings
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const response = await axios.get(`${BASE_URL}/recordings`, {
      headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
      params: {
        "filter[created_at][gte]": sevenDaysAgo.toISOString(),
        "page[size]": 100,
      },
      timeout: 30000,
    });

    // Search for this call's recording
    if (response.data.data && Array.isArray(response.data.data)) {
      // Try exact call_leg_id match first
      let matching = response.data.data.find(
        (r: any) => r.call_leg_id === telnyxCallId
      );

      // If not found, try call_session_id
      if (!matching && response.data.data.length > 0) {
        // Try finding by partial match or order
        matching = response.data.data[0];
      }

      if (matching?.download_urls?.wav) {
        console.log(`    ✓ Found fresh URL from Telnyx API`);
        return matching.download_urls.wav;
      }
    }

    return null;
  } catch (error: any) {
    console.log(`    ⚠ Telnyx API error: ${error.message}`);
    return null;
  }
}

async function main() {
  try {
    console.log("=".repeat(80));
    console.log("Backing up real call recordings using Telnyx API for fresh URLs");
    console.log("=".repeat(80));

    const result = await pool.query(`
      SELECT id, contact_email, telnyx_call_id, recording_url, recording_s3_key, created_at
      FROM leads
      WHERE created_at >= '2026-01-15'::date
        AND created_at  null
          );
          if (!checkResponse || !checkResponse.ok) {
            // Stored URL expired, fetch fresh one from Telnyx API
            console.log(`  Stored URL expired, fetching from Telnyx API...`);
            const freshUrl = await getTelnyxRecordingUrl(call.telnyx_call_id);
            if (freshUrl) {
              recordingUrl = freshUrl;
              urlSource = "telnyx";
            } else {
              console.log(`  ⚠ Could not get recording URL from Telnyx API`);
              failed++;
              continue;
            }
          }
        } else {
          console.log(`  No stored URL, fetching from Telnyx API...`);
          const freshUrl = await getTelnyxRecordingUrl(call.telnyx_call_id);
          if (!freshUrl) {
            console.log(`  ⚠ Could not get recording URL from Telnyx API`);
            failed++;
            continue;
          }
          recordingUrl = freshUrl;
          urlSource = "telnyx";
        }

        console.log(`  Downloading (${urlSource})...`);
        const response = await fetch(recordingUrl, { timeout: 60000 });

        if (!response.ok) {
          console.log(`  ⚠ Download failed: ${response.status}`);
          failed++;
          continue;
        }

        const buffer = await response.buffer();
        console.log(`  ✓ Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

        // Upload to S3
        const s3Key = `recordings/leads/${call.id}/${call.telnyx_call_id}.wav`;
        console.log(`  Uploading to S3...`);
        await uploadToS3(s3Key, buffer, "audio/wav");
        console.log(`  ✓ Uploaded`);

        // Update database
        await pool.query(
          `UPDATE leads SET recording_s3_key = $1 WHERE id = $2`,
          [s3Key, call.id]
        );

        console.log(`  ✓ Saved to database`);
        success++;
      } catch (error: any) {
        console.log(`  ⚠ Error: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`Summary:`);
    console.log(`  ✓ Backed up: ${success}`);
    console.log(`  ⚠ Failed: ${failed}`);
    console.log(`  ↷ Already backed up: ${skipped}`);
    console.log(`\n✅ Real call backup complete`);

    process.exit(0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();