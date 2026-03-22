import { pool } from "./server/db";
import { downloadAndStoreRecording } from "./server/services/recording-storage";

async function testAccessAndDownload() {
  console.log("========================================");
  console.log("TEST RECORDING ACCESSIBILITY");
  console.log("========================================\n");

  const result = await pool.query(`
    SELECT 
      id,
      contact_name,
      recording_url,
      call_duration
    FROM leads
    WHERE created_at >= '2026-01-15'
      AND recording_url IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 10
  `);

  console.log(`Testing ${result.rows.length} recordings:\n`);

  let accessible = 0;
  let expired = 0;
  let errors = 0;

  for (const row of result.rows) {
    console.log(`Testing: ${row.contact_name} (${row.call_duration}s)`);
    
    try {
      const response = await fetch(row.recording_url, { method: 'HEAD' });
      
      if (response.ok) {
        console.log(`  ✓ ACCESSIBLE (${response.status})`);
        accessible++;
        
        // Try to download and store
        console.log(`  Downloading and storing to GCS...`);
        try {
          const s3Key = await downloadAndStoreRecording(row.recording_url, row.id);
          if (s3Key) {
            console.log(`  ✓ STORED: ${s3Key}`);
          } else {
            console.log(`  ✗ Store failed`);
          }
        } catch (storageError: any) {
          console.log(`  ✗ Storage error: ${storageError.message}`);
        }
      } else if (response.status === 403) {
        console.log(`  ✗ EXPIRED (403 Forbidden)`);
        expired++;
      } else {
        console.log(`  ✗ ERROR (${response.status})`);
        errors++;
      }
    } catch (error: any) {
      console.log(`  ✗ CONNECTION ERROR: ${error.message}`);
      errors++;
    }
    
    console.log('');
  }

  console.log("========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Accessible: ${accessible}`);
  console.log(`Expired: ${expired}`);
  console.log(`Errors: ${errors}`);

  process.exit(0);
}

testAccessAndDownload().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});