import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { fetchTelnyxRecording } from './server/services/telnyx-recordings';
import { downloadAndStoreRecording, isRecordingStorageEnabled, getRecordingS3Key } from './server/services/recording-storage';
import { getPresignedDownloadUrl } from './server/lib/s3';

async function fetchFreshRecordings() {
  console.log('========================================');
  console.log('FETCH FRESH RECORDINGS FROM TELNYX');
  console.log('========================================\n');

  // Check S3 configuration
  const s3Enabled = isRecordingStorageEnabled();
  console.log(`S3 Storage Enabled: ${s3Enabled ? 'YES' : 'NO'}\n`);

  // Get the Jan 15 leads with telnyx_call_id
  const leadsToFetch = await db.execute(sql`
    SELECT
      id,
      contact_name,
      telnyx_call_id,
      recording_url,
      recording_s3_key,
      call_duration
    FROM leads
    WHERE created_at > NOW() - INTERVAL '1 day'
      AND telnyx_call_id IS NOT NULL
    ORDER BY created_at DESC
  `);

  console.log(`Found ${leadsToFetch.rows.length} leads with Telnyx call IDs:\n`);

  for (const row of leadsToFetch.rows) {
    const r = row as any;
    console.log(`\n========================================`);
    console.log(`Lead: ${r.contact_name}`);
    console.log(`  ID: ${r.id}`);
    console.log(`  Telnyx Call ID: ${r.telnyx_call_id}`);
    console.log(`  Current Recording URL: ${r.recording_url ? 'YES' : 'NO'}`);
    console.log(`  S3 Key: ${r.recording_s3_key || 'NONE'}`);
    console.log(`  Duration: ${r.call_duration}s`);

    try {
      // Fetch fresh recording URL from Telnyx
      console.log(`\n  Fetching fresh recording from Telnyx...`);
      const freshUrl = await fetchTelnyxRecording(r.telnyx_call_id);

      if (freshUrl) {
        console.log(`  ✅ Got fresh recording URL!`);

        if (s3Enabled) {
          // Download and store in S3
          console.log(`  Downloading and storing in S3...`);
          const s3Key = await downloadAndStoreRecording(freshUrl, r.id);

          if (s3Key) {
            // Update the lead with S3 key
            await db.execute(sql`
              UPDATE leads
              SET
                recording_s3_key = ${s3Key},
                recording_url = ${freshUrl}
              WHERE id = ${r.id}
            `);

            // Get presigned URL for verification
            const presignedUrl = await getPresignedDownloadUrl(s3Key, 7 * 24 * 60 * 60);
            console.log(`  ✅ Stored in S3: ${s3Key}`);
            console.log(`  Presigned URL (7 days): ${presignedUrl.substring(0, 80)}...`);
          } else {
            console.log(`  ⚠️ Failed to store in S3`);
          }
        } else {
          // Just update the recording URL
          await db.execute(sql`
            UPDATE leads
            SET recording_url = ${freshUrl}
            WHERE id = ${r.id}
          `);
          console.log(`  ⚠️ S3 not configured - updated recording_url only (will expire in 10 min)`);
        }
      } else {
        console.log(`  ❌ Recording not found in Telnyx`);
        console.log(`  Note: Telnyx recordings may expire after ~30 days`);
      }
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  console.log('\n\n========================================');
  console.log('VERIFICATION');
  console.log('========================================\n');

  const verifyLeads = await db.execute(sql`
    SELECT
      id,
      contact_name,
      telnyx_call_id,
      recording_url IS NOT NULL as has_recording_url,
      recording_s3_key
    FROM leads
    WHERE created_at > NOW() - INTERVAL '1 day'
    ORDER BY created_at DESC
  `);

  for (const row of verifyLeads.rows) {
    const r = row as any;
    console.log(`${r.contact_name}:`);
    console.log(`  Recording URL: ${r.has_recording_url ? 'YES' : 'NO'}`);
    console.log(`  S3 Key: ${r.recording_s3_key || 'NONE'}`);
    console.log('');
  }

  process.exit(0);
}

fetchFreshRecordings().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
