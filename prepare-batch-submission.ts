import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const BATCH_SIZE = 50;

async function submitJobsViaDirect() {
  try {
    console.log("\n📋 Job Submission Plan");
    console.log("=".repeat(60));

    // Get current job status
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM transcription_regeneration_jobs 
      GROUP BY status 
      ORDER BY status
    `);

    console.log("Current Job Distribution:");
    statusResult.rows.forEach((row) => {
      console.log(`  ${row.status}: ${row.count} jobs`);
    });

    console.log("\n📝 Jobs Ready for Submission:");
    console.log("=".repeat(60));

    // Get first batch
    const batchResult = await pool.query(`
      SELECT call_id, source 
      FROM transcription_regeneration_jobs 
      WHERE status = 'pending' 
      ORDER BY created_at ASC
      LIMIT $1
    `, [BATCH_SIZE]);

    const batch = batchResult.rows;
    console.log(`\nBatch 1: ${batch.length} jobs`);
    console.log(`Sample IDs: ${batch.slice(0, 3).map(j => j.call_id).join(", ")}...`);

    // Mark these as "submitted" to prevent resubmission
    if (batch.length > 0) {
      const callIds = batch.map(j => j.call_id);
      
      await pool.query(`
        UPDATE transcription_regeneration_jobs 
        SET status = 'submitted'
        WHERE call_id = ANY($1)
      `, [callIds]);

      console.log(`\n[✓] Marked ${callIds.length} jobs as "submitted"`);

      // Output curl command for direct execution
      console.log("\n📤 Manual Submission (if needed):");
      console.log("=".repeat(60));
      console.log("\nYou can submit this batch manually using curl:");
      console.log(`
curl -X POST https://demandgentic.ai/api/call-intelligence/transcription-gaps/regenerate \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    callIds: callIds,
    strategy: "telnyx_phone_lookup"
  })}'
      `);

      // Estimate remaining batches
      const remainingResult = await pool.query(`
        SELECT COUNT(*) as count 
        FROM transcription_regeneration_jobs 
        WHERE status = 'pending'
      `);

      const remaining = remainingResult.rows[0].count;
      const totalBatches = Math.ceil((batch.length + remaining) / BATCH_SIZE);
      const completedBatches = Math.ceil(batch.length / BATCH_SIZE);

      console.log("\n📊 Remaining Work:");
      console.log(`  Pending jobs: ${remaining}`);
      console.log(`  Total batches needed: ${totalBatches}`);
      console.log(`  Batches submitted: ${completedBatches}`);
      console.log(`  Remaining batches: ${totalBatches - completedBatches}`);
    }

    console.log("\n✅ Submission plan prepared.");
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

submitJobsViaDirect();
