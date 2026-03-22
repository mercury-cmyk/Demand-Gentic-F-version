import { pool } from "./server/db";
import { getPresignedDownloadUrl, s3ObjectExists } from "./server/lib/s3";

async function checkS3Recordings() {
  console.log("========================================");
  console.log("CHECK S3/GCS RECORDINGS");
  console.log("========================================\n");

  // Check leads with S3 keys
  const result = await pool.query(`
    SELECT 
      id,
      contact_name,
      dialed_number,
      call_duration,
      recording_url,
      recording_s3_key,
      transcript IS NOT NULL as has_transcript,
      LENGTH(transcript) as transcript_length,
      created_at
    FROM leads
    WHERE created_at >= '2026-01-15'
      AND call_duration > 0
    ORDER BY updated_at DESC
    LIMIT 50
  `);

  console.log(`Total calls: ${result.rows.length}`);
  
  const withS3 = result.rows.filter(r => r.recording_s3_key);
  const withoutS3 = result.rows.filter(r => !r.recording_s3_key);

  console.log(`  With S3 keys: ${withS3.length}`);
  console.log(`  Without S3 keys: ${withoutS3.length}\n`);

  if (withS3.length > 0) {
    console.log("RECORDINGS WITH S3 KEYS:");
    console.log("================================");
    for (const row of withS3) {
      console.log(`\n${row.contact_name} (${row.dialed_number})`);
      console.log(`  S3 Key: ${row.recording_s3_key}`);
      console.log(`  Duration: ${row.call_duration}s`);
      console.log(`  Transcript: ${row.has_transcript ? `${row.transcript_length} chars` : 'NO'}`);
      
      // Check if it exists in S3
      try {
        const exists = await s3ObjectExists(row.recording_s3_key);
        if (exists) {
          console.log(`  ✓ EXISTS in S3`);
          
          // Generate presigned URL
          const url = await getPresignedDownloadUrl(row.recording_s3_key, 7 * 24 * 60 * 60);
          console.log(`  ✓ Presigned URL (7 days):`);
          console.log(`    ${url.substring(0, 100)}...`);
        } else {
          console.log(`  ✗ NOT FOUND in S3`);
        }
      } catch (error: any) {
        console.log(`  ✗ Error checking S3: ${error.message}`);
      }
    }
  }

  if (withoutS3.length > 0) {
    console.log("\n\nRECORDINGS WITHOUT S3 KEYS (need backfill):");
    console.log("================================");
    for (const row of withoutS3) {
      console.log(`\n${row.contact_name} (${row.dialed_number})`);
      console.log(`  Duration: ${row.call_duration}s`);
      console.log(`  Recording URL: ${row.recording_url ? 'EXISTS' : 'NULL'}`);
      console.log(`  Transcript: ${row.has_transcript ? `${row.transcript_length} chars` : 'NO'}`);
      console.log(`  Status: ⚠️  No permanent storage yet`);
    }
  }

  process.exit(0);
}

checkS3Recordings().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});