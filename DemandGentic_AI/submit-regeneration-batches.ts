import * as https from "https";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const BATCH_SIZE = 50;
const API_ENDPOINT = "demandgentic.ai";
const API_PATH = "/api/call-intelligence/transcription-gaps/regenerate";

interface RegenerationJob {
  call_id: string;
  source: string;
}

async function submitBatch(
  callIds: string[],
  strategy: string = "telnyx_phone_lookup"
): Promise {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      callIds,
      strategy,
    });

    const options = {
      hostname: API_ENDPOINT,
      port: 443,
      path: API_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            success: res.statusCode === 200,
            message: parsed.message || "OK",
          });
        } catch {
          resolve({
            success: res.statusCode === 200,
            message: `HTTP ${res.statusCode}`,
          });
        }
      });
    });

    req.on("error", (error) => {
      resolve({
        success: false,
        error: error.message,
      });
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  try {
    console.log("\n🚀 Starting batch submission of regeneration requests...\n");

    let totalBatches = 0;
    let successfulBatches = 0;
    let failedBatches = 0;
    let totalCallsSubmitted = 0;

    while (true) {
      // Fetch next batch of pending jobs
      const result = await pool.query(
        `
        SELECT call_id, source 
        FROM transcription_regeneration_jobs 
        WHERE status = 'pending' 
        LIMIT $1
      `,
        [BATCH_SIZE]
      );

      const jobs: RegenerationJob[] = result.rows;

      if (jobs.length === 0) {
        console.log("\n✅ All batches submitted!");
        break;
      }

      const callIds = jobs.map((j) => j.call_id);
      totalBatches++;

      console.log(`📤 Batch ${totalBatches} (${callIds.length} calls)...`);

      const response = await submitBatch(callIds);

      if (response.success) {
        successfulBatches++;
        totalCallsSubmitted += callIds.length;
        console.log(`   ✅ Success: ${response.message}`);

        // Update job status to submitted
        await pool.query(
          `
          UPDATE transcription_regeneration_jobs 
          SET status = 'submitted', attempts = attempts + 1
          WHERE call_id = ANY($1)
        `,
          [callIds]
        );
      } else {
        failedBatches++;
        console.log(`   ❌ Failed: ${response.error || response.message}`);
      }

      // Small delay between batches to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 Submission Report");
    console.log("=".repeat(60));
    console.log(`Total Batches Processed: ${totalBatches}`);
    console.log(`Successful: ${successfulBatches}`);
    console.log(`Failed: ${failedBatches}`);
    console.log(`Total Calls Submitted: ${totalCallsSubmitted}`);
    console.log("=".repeat(60) + "\n");

    // Check current status distribution
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM transcription_regeneration_jobs 
      GROUP BY status
    `);

    console.log("📋 Current Job Status Distribution:");
    statusResult.rows.forEach((row) => {
      console.log(`   ${row.status}: ${row.count}`);
    });

    console.log("\n✅ Batch submission complete!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();