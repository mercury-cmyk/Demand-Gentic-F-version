import pkg from "pg";
const { Pool } = pkg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Simple query to check what we have
    const result = await pool.query(`
      SELECT COUNT(*) as total, status, COUNT(CASE WHEN status='pending' THEN 1 END) as pending
      FROM transcription_regeneration_jobs
      GROUP BY status
    `);

    console.log("Job status from database:");
    result.rows.forEach(row => {
      console.log(`  ${JSON.stringify(row)}`);
    });

    // Get a sample of pending jobs
    const sample = await pool.query(`
      SELECT call_id FROM transcription_regeneration_jobs 
      WHERE status = 'pending' 
      LIMIT 5
    `);

    console.log("\nSample pending job IDs:");
    sample.rows.forEach(row => {
      console.log(`  - ${row.call_id}`);
    });

    console.log("\nDatabase connection: OK");
  } catch (error) {
    console.error("Database error:", error instanceof Error ? error.message : error);
  } finally {
    await pool.end();
  }
}

main();