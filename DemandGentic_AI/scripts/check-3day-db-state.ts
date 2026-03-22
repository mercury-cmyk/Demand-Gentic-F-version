import "dotenv/config";
import { pool } from "../server/db";

async function main() {
  try {
    // Check leads columns
    const r1 = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' ORDER BY column_name`
    );
    console.log("=== LEADS COLUMNS ===");
    console.log(r1.rows.map((x: any) => x.column_name).join(", "));

    // Check call_sessions columns
    const r2 = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'call_sessions' ORDER BY column_name`
    );
    console.log("\n=== CALL_SESSIONS COLUMNS ===");
    console.log(r2.rows.map((x: any) => x.column_name).join(", "));

    // Check dialer_call_attempts
    const r3 = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'dialer_call_attempts' ORDER BY column_name`
    );
    console.log("\n=== DIALER_CALL_ATTEMPTS COLUMNS ===");
    console.log(r3.rows.map((x: any) => x.column_name).join(", "));

    // Count recent records
    const since = new Date();
    since.setDate(since.getDate() - 3);

    const leadsCount = await pool.query(
      `SELECT count(*) as total,
              count(recording_url) as with_recording,
              count(transcript) FILTER (WHERE length(transcript) > 20) as with_transcript
       FROM leads WHERE created_at >= $1`,
      [since.toISOString()]
    );
    console.log("\n=== LEADS LAST 3 DAYS ===");
    console.log(JSON.stringify(leadsCount.rows[0]));

    const csCount = await pool.query(
      `SELECT count(*) as total,
              count(recording_url) as with_recording,
              count(ai_transcript) FILTER (WHERE length(ai_transcript) > 20) as with_transcript
       FROM call_sessions WHERE started_at >= $1`,
      [since.toISOString()]
    );
    console.log("\n=== CALL_SESSIONS LAST 3 DAYS ===");
    console.log(JSON.stringify(csCount.rows[0]));

  } catch (e) {
    console.error("ERROR:", e);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();