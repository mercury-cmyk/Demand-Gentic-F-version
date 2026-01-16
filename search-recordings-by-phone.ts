import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { searchRecordingsByDialedNumber } from './server/services/telnyx-recordings';
import { downloadAndStoreRecording, isRecordingStorageEnabled } from './server/services/recording-storage';
import { getPresignedDownloadUrl } from './server/lib/s3';

async function searchRecordingsByPhone() {
  console.log('========================================');
  console.log('SEARCH RECORDINGS BY PHONE NUMBER');
  console.log('========================================\n');

  const s3Enabled = isRecordingStorageEnabled();
  console.log(`S3 Storage Enabled: ${s3Enabled ? 'YES' : 'NO'}\n`);

  // Get the Jan 15 leads with their dialed numbers
  const leadsToSearch = await db.execute(sql`
    SELECT
      l.id,
      l.contact_name,
      l.dialed_number,
      l.created_at,
      l.call_duration,
      l.recording_s3_key,
      c.direct_phone,
      c.mobile_phone
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    WHERE l.created_at > NOW() - INTERVAL '1 day'
    ORDER BY l.created_at DESC
  `);

  console.log(`Found ${leadsToSearch.rows.length} leads to search:\n`);

  for (const row of leadsToSearch.rows) {
    const r = row as any;
    const dialedNumber = r.dialed_number || r.direct_phone || r.mobile_phone;

    console.log(`\n========================================`);
    console.log(`Lead: ${r.contact_name}`);
    console.log(`  ID: ${r.id}`);
    console.log(`  Dialed Number: ${dialedNumber || 'UNKNOWN'}`);
    console.log(`  Created At: ${r.created_at}`);
    console.log(`  Duration: ${r.call_duration}s`);
    console.log(`  Current S3 Key: ${r.recording_s3_key || 'NONE'}`);

    if (!dialedNumber) {
      console.log(`  ⚠️ No phone number to search by`);
      continue;
    }

    try {
      // Search for recordings within 1 hour window
      const createdAt = new Date(r.created_at);
      const searchStart = new Date(createdAt.getTime() - 60 * 60 * 1000); // 1 hour before
      const searchEnd = new Date(createdAt.getTime() + 60 * 60 * 1000); // 1 hour after

      console.log(`\n  Searching Telnyx for recordings...`);
      console.log(`  Phone: ${dialedNumber}`);
      console.log(`  Time window: ${searchStart.toISOString()} to ${searchEnd.toISOString()}`);

      const recordings = await searchRecordingsByDialedNumber(dialedNumber, searchStart, searchEnd);

      console.log(`  Found ${recordings.length} recordings`);

      if (recordings.length > 0) {
        for (const recording of recordings) {
          console.log(`\n    Recording ID: ${recording.id}`);
          console.log(`    Status: ${recording.status}`);
          console.log(`    Duration: ${Math.floor(recording.duration_millis / 1000)}s`);
          console.log(`    Call Control ID: ${recording.call_control_id}`);
          console.log(`    Has MP3: ${recording.download_urls?.mp3 ? 'YES' : 'NO'}`);
          console.log(`    Has WAV: ${recording.download_urls?.wav ? 'YES' : 'NO'}`);

          // If completed and has download URL, try to download
          if (recording.status === 'completed') {
            const downloadUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;
            if (downloadUrl && s3Enabled) {
              console.log(`\n    Downloading and storing in S3...`);
              const s3Key = await downloadAndStoreRecording(downloadUrl, r.id);
              if (s3Key) {
                await db.execute(sql`
                  UPDATE leads
                  SET
                    recording_s3_key = ${s3Key},
                    recording_url = ${downloadUrl},
                    telnyx_call_id = ${recording.call_control_id}
                  WHERE id = ${r.id}
                `);
                const presignedUrl = await getPresignedDownloadUrl(s3Key, 7 * 24 * 60 * 60);
                console.log(`    ✅ Stored: ${s3Key}`);
                console.log(`    Presigned URL: ${presignedUrl.substring(0, 80)}...`);
              }
            }
          }
        }
      } else {
        console.log(`  ❌ No recordings found for this phone number in the time range`);
      }
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  // Also check what recordings exist at all in the time period
  console.log('\n\n========================================');
  console.log('ALL JAN 15 RECORDINGS IN TELNYX');
  console.log('========================================\n');

  try {
    // Search for all recordings on Jan 15
    const jan15Start = new Date('2026-01-15T00:00:00Z');
    const jan15End = new Date('2026-01-15T23:59:59Z');

    console.log(`Searching all recordings from ${jan15Start.toISOString()} to ${jan15End.toISOString()}...`);

    // Use a generic search without phone filter
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    const params = new URLSearchParams();
    params.append('filter[created_at][gte]', jan15Start.toISOString());
    params.append('filter[created_at][lte]', jan15End.toISOString());
    params.append('page[size]', '50');

    const response = await fetch(`https://api.telnyx.com/v2/recordings?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`Found ${data.data?.length || 0} total recordings on Jan 15`);

      if (data.data && data.data.length > 0) {
        for (const recording of data.data) {
          console.log(`\n  Recording: ${recording.id}`);
          console.log(`    Status: ${recording.status}`);
          console.log(`    Duration: ${Math.floor(recording.duration_millis / 1000)}s`);
          console.log(`    Created: ${recording.created_at}`);
          console.log(`    Call Control ID: ${recording.call_control_id}`);
        }
      }
    } else {
      console.log(`API Error: ${response.status}`);
    }
  } catch (error: any) {
    console.log(`Error searching all recordings: ${error.message}`);
  }

  process.exit(0);
}

searchRecordingsByPhone().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
