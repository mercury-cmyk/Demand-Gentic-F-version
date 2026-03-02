import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { Storage } from '@google-cloud/storage';

const GCS_BUCKET = process.env.GCS_BUCKET || 'demandgentic-ai-storage';
const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET);

async function checkGCSRecordings() {
  console.log('========================================');
  console.log('CHECK GOOGLE CLOUD STORAGE RECORDINGS');
  console.log('========================================\n');

  // Check if GCS is configured
  console.log(`GCS Bucket: ${GCS_BUCKET}`);

  try {
    const [exists] = await bucket.exists();
    console.log(`GCS Bucket Status: ${exists ? 'EXISTS ✓' : 'NOT FOUND ✗'}\n`);
  } catch (error: any) {
    console.log(`GCS Bucket Status: ERROR - ${error.message}\n`);
  }

  // Check dialer_call_attempts table structure
  const tableInfo = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'dialer_call_attempts'
      AND column_name LIKE '%recording%'
    ORDER BY ordinal_position
  `);

  console.log('Recording-related columns in dialer_call_attempts:');
  tableInfo.rows.forEach((row: any) => {
    console.log(`  - ${row.column_name}: ${row.data_type}`);
  });
  console.log();

  // Check Jan 15 recordings
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(recording_url) as with_url,
      COUNT(CASE WHEN notes LIKE '%[Call Transcript]%' THEN 1 END) as transcribed
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
      AND call_duration_seconds >= 60
  `);

  const s = stats.rows[0] as any;
  console.log('Jan 15 Calls (>60s):');
  console.log(`  Total: ${s.total}`);
  console.log(`  With recording_url: ${s.with_url}`);
  console.log(`  Already transcribed: ${s.transcribed}`);
  console.log(`  Need transcription: ${parseInt(s.total) - parseInt(s.transcribed)}`);
  console.log();

  // Try to test if URLs still work
  console.log('Testing recording URL access...');
  const sampleCall = await db.execute(sql`
    SELECT id, recording_url
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
      AND call_duration_seconds >= 60
      AND recording_url IS NOT NULL
    LIMIT 1
  `);

  if (sampleCall.rows.length > 0) {
    const call = sampleCall.rows[0] as any;
    console.log(`Sample call ID: ${call.id}`);
    console.log(`URL: ${call.recording_url.substring(0, 100)}...`);

    // Test if URL is accessible
    try {
      const testFetch = await fetch(call.recording_url, { method: 'HEAD' });
      if (testFetch.ok) {
        console.log('✅ URL is ACCESSIBLE!');
        console.log('   Status:', testFetch.status);
        console.log('   Content-Type:', testFetch.headers.get('content-type'));
        console.log('\n🎉 GREAT NEWS: Recording URLs are still valid!');
        console.log('   You can proceed with transcription.');
      } else {
        console.log('❌ URL returned error:', testFetch.status, testFetch.statusText);
        if (testFetch.status === 403) {
          console.log('   Likely reason: Pre-signed URL has expired (they expire after 10 minutes)');
        }
      }
    } catch (error: any) {
      console.log('❌ Failed to fetch:', error.message);
    }
  }

  // Check if any recordings exist in GCS
  console.log('\nChecking GCS for stored recordings...');
  try {
    const [files] = await bucket.getFiles({ prefix: 'recordings/', maxResults: 10 });

    if (files.length > 0) {
      console.log(`✅ Found ${files.length} recordings in GCS (showing first 10):`);
      files.forEach(file => {
        console.log(`  - ${file.name}`);
      });
    } else {
      console.log('❌ No recordings found in GCS bucket');
      console.log('   Recordings would be at: recordings/{attempt_id}.{mp3|wav}');
    }
  } catch (error: any) {
    console.log(`❌ Failed to list GCS files: ${error.message}`);
  }

  console.log('\n========================================');
  console.log('RECOMMENDATIONS');
  console.log('========================================\n');

  console.log('Current situation:');
  console.log('  - External recording URLs (telephony-recorder-prod) have EXPIRED');
  console.log('  - Cannot download recordings from expired URLs');
  console.log('  - Need fresh URLs from your telephony provider\n');

  console.log('Solutions:');
  console.log('  1. Contact your telephony provider to get fresh download URLs');
  console.log('  2. Download recordings manually and upload to GCS');
  console.log('  3. Set up webhook to auto-store in GCS immediately after calls');
  console.log('  4. Focus on the 115 already-transcribed calls for analysis\n');

  console.log('For future calls:');
  console.log('  - Enable recording_auto_sync_enabled in campaigns');
  console.log('  - Store recordings in GCS within seconds of call completion');
  console.log('  - Transcribe before URLs expire');

  process.exit(0);
}

checkGCSRecordings();