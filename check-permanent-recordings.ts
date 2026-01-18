import { pool } from "./server/db";

async function checkPermanentRecordings() {
  console.log("========================================");
  console.log("PERMANENT RECORDING STORAGE CHECK");
  console.log("========================================\n");

  // Check leads with S3 keys
  const leadsS3Result = await pool.query(`
    SELECT 
      id,
      recording_s3_key,
      recording_url,
      call_duration,
      transcript IS NOT NULL AS has_transcript,
      LENGTH(transcript) AS transcript_len
    FROM leads
    WHERE updated_at >= '2026-01-15'
      AND call_duration > 0
    ORDER BY updated_at DESC
  `);

  console.log("LEADS:");
  console.log(`  Total calls: ${leadsS3Result.rows.length}`);
  console.log(`  With S3 key: ${leadsS3Result.rows.filter(r => r.recording_s3_key).length}`);
  console.log(`  With transcript: ${leadsS3Result.rows.filter(r => r.has_transcript).length}`);
  console.log("");

  for (const row of leadsS3Result.rows.slice(0, 5)) {
    console.log(`ID: ${row.id}`);
    console.log(`  S3 Key: ${row.recording_s3_key || 'NULL'}`);
    console.log(`  URL: ${row.recording_url ? row.recording_url.substring(0, 80) + '...' : 'NULL'}`);
    console.log(`  Transcript: ${row.has_transcript ? `${row.transcript_len} chars` : 'NULL'}`);
    console.log("");
  }

  // Check if we have GCS buckets configured
  console.log("========================================");
  console.log("GCS RECORDING CHECK");
  console.log("========================================\n");
  
  const gcsResult = await pool.query(`
    SELECT 
      id,
      telnyx_call_id,
      recording_url,
      call_duration
    FROM leads
    WHERE updated_at >= '2026-01-15'
      AND call_duration > 0
      AND telnyx_call_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 10
  `);

  console.log(`Leads with telnyx_call_id: ${gcsResult.rows.length}`);
  for (const row of gcsResult.rows.slice(0, 3)) {
    console.log(`\nID: ${row.id}`);
    console.log(`  Telnyx Call ID: ${row.telnyx_call_id}`);
    console.log(`  Duration: ${row.call_duration}s`);
  }

  process.exit(0);
}

checkPermanentRecordings().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
