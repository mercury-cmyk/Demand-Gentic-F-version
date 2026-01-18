import "dotenv/config";
import { pool } from "./server/db";

async function main() {
  const result = await pool.query(`
    SELECT id, contact_email, telnyx_call_id, transcript, recording_url, recording_s3_key, created_at
    FROM leads
    WHERE created_at >= '2026-01-15'::date
      AND created_at < '2026-01-17'::date
      AND (recording_url IS NOT NULL OR telnyx_call_id IS NOT NULL)
    ORDER BY created_at DESC
  `);

  console.log("Real calls from Jan 15-16:");
  for (const row of result.rows) {
    console.log(`\n📞 ${row.contact_email}`);
    console.log(
      `   Transcript: ${row.transcript ? row.transcript.substring(0, 80) + "..." : "MISSING"}`
    );
    console.log(`   Recording URL: ${row.recording_url ? "✓" : "✗"}`);
    console.log(`   S3 Key: ${row.recording_s3_key ? "✓" : "✗"}`);
    console.log(`   Telnyx ID: ${row.telnyx_call_id ? "✓" : "✗"}`);
  }

  process.exit(0);
}
main();
