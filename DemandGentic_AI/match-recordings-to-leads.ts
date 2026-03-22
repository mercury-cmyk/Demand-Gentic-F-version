import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { downloadAndStoreRecording, isRecordingStorageEnabled } from './server/services/recording-storage';
import { getPresignedDownloadUrl } from './server/lib/s3';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

interface TelnyxRecording {
  id: string;
  call_control_id: string | null;
  call_leg_id: string;
  call_session_id: string;
  channels: string;
  created_at: string;
  download_urls: {
    mp3?: string;
    wav?: string;
  };
  duration_millis: number;
  recording_started_at: string;
  recording_ended_at: string;
  status: string;
}

async function matchRecordingsToLeads() {
  console.log('========================================');
  console.log('MATCH RECORDINGS TO LEADS BY DURATION');
  console.log('========================================\n');

  const s3Enabled = isRecordingStorageEnabled();
  console.log(`S3 Storage Enabled: ${s3Enabled ? 'YES' : 'NO'}\n`);

  // Get actual call times from dialer_call_attempts for Jan 15 qualified/not_interested calls
  const callAttempts = await db.execute(sql`
    SELECT
      dca.id,
      dca.contact_id,
      dca.phone_dialed,
      dca.call_duration_seconds,
      dca.call_started_at,
      dca.call_ended_at,
      dca.created_at,
      dca.disposition,
      c.first_name,
      c.last_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.disposition IN ('qualified_lead', 'not_interested')
      AND dca.call_duration_seconds > 0
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log('Jan 15 Connected Calls:');
  for (const row of callAttempts.rows) {
    const r = row as any;
    console.log(`  ${r.first_name} ${r.last_name}: ${r.call_duration_seconds}s (${r.phone_dialed}) @ ${r.created_at}`);
  }

  // Get all Jan 15 recordings from Telnyx
  console.log('\n\nFetching ALL Jan 15 recordings from Telnyx...');

  const jan15Start = new Date('2026-01-15T00:00:00Z');
  const jan15End = new Date('2026-01-15T23:59:59Z');

  const params = new URLSearchParams();
  params.append('filter[created_at][gte]', jan15Start.toISOString());
  params.append('filter[created_at][lte]', jan15End.toISOString());
  params.append('page[size]', '100');

  const response = await fetch(`https://api.telnyx.com/v2/recordings?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.log(`API Error: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json();
  const recordings: TelnyxRecording[] = data.data || [];

  console.log(`Found ${recordings.length} total recordings\n`);

  // Try to match by duration
  console.log('Attempting to match by call duration...\n');

  for (const row of callAttempts.rows) {
    const call = row as any;
    const callDuration = call.call_duration_seconds;
    const contactName = `${call.first_name} ${call.last_name}`;

    console.log(`\n========================================`);
    console.log(`Looking for: ${contactName} (${callDuration}s)`);

    // Find recordings with matching or similar duration (within 5 seconds)
    const matchingRecordings = recordings.filter(r => {
      const recDuration = Math.floor(r.duration_millis / 1000);
      return Math.abs(recDuration - callDuration)  0) {
      // Sort by closest match
      matchingRecordings.sort((a, b) => {
        const aDiff = Math.abs(Math.floor(a.duration_millis / 1000) - callDuration);
        const bDiff = Math.abs(Math.floor(b.duration_millis / 1000) - callDuration);
        return aDiff - bDiff;
      });

      for (const rec of matchingRecordings) {
        const recDuration = Math.floor(rec.duration_millis / 1000);
        console.log(`\n  Candidate Recording: ${rec.id}`);
        console.log(`    Duration: ${recDuration}s (target: ${callDuration}s, diff: ${Math.abs(recDuration - callDuration)}s)`);
        console.log(`    Created: ${rec.created_at}`);
        console.log(`    Status: ${rec.status}`);
        console.log(`    Has MP3: ${rec.download_urls?.mp3 ? 'YES' : 'NO'}`);
      }

      // Use the best match
      const bestMatch = matchingRecordings[0];
      const downloadUrl = bestMatch.download_urls?.mp3 || bestMatch.download_urls?.wav;

      if (downloadUrl && bestMatch.status === 'completed') {
        // Get the lead for this contact
        const leadResult = await db.execute(sql`
          SELECT id FROM leads WHERE contact_id = ${call.contact_id} LIMIT 1
        `);

        if (leadResult.rows.length > 0) {
          const leadId = (leadResult.rows[0] as any).id;
          console.log(`\n  Found lead: ${leadId}`);

          if (s3Enabled) {
            console.log(`  Downloading and storing in S3...`);
            const s3Key = await downloadAndStoreRecording(downloadUrl, leadId);

            if (s3Key) {
              await db.execute(sql`
                UPDATE leads
                SET
                  recording_s3_key = ${s3Key},
                  recording_url = ${downloadUrl}
                WHERE id = ${leadId}
              `);

              const presignedUrl = await getPresignedDownloadUrl(s3Key, 7 * 24 * 60 * 60);
              console.log(`  ✅ Stored: ${s3Key}`);
              console.log(`  Presigned URL: ${presignedUrl.substring(0, 100)}...`);
            }
          }
        }
      }
    } else {
      console.log(`  ❌ No matching recordings found`);
    }
  }

  // Final verification
  console.log('\n\n========================================');
  console.log('FINAL VERIFICATION');
  console.log('========================================\n');

  const verifyLeads = await db.execute(sql`
    SELECT
      id,
      contact_name,
      call_duration,
      recording_s3_key,
      recording_url IS NOT NULL as has_recording_url
    FROM leads
    WHERE created_at > NOW() - INTERVAL '1 day'
    ORDER BY created_at DESC
  `);

  for (const row of verifyLeads.rows) {
    const r = row as any;
    console.log(`${r.contact_name}:`);
    console.log(`  Duration: ${r.call_duration}s`);
    console.log(`  S3 Key: ${r.recording_s3_key || 'NONE'}`);
    console.log(`  Has Recording URL: ${r.has_recording_url ? 'YES' : 'NO'}`);
    console.log('');
  }

  process.exit(0);
}

matchRecordingsToLeads().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});