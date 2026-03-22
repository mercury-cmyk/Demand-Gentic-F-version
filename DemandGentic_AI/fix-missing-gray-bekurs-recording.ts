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
    const result = await pool.query(`
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
          return Math.abs(recTime.getTime() - callTime.getTime())  0) {
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
    } while (nextPageToken && page  process.exit(0));