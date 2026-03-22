import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function checkRecordingStorage() {
  console.log('========================================');
  console.log('RECORDING STORAGE ANALYSIS');
  console.log('========================================\n');

  // Check call_sessions recordings
  const sessionStats = await db.execute(sql`
    SELECT 
      COUNT(*) as total_calls,
      COUNT(recording_s3_key) as with_s3_key,
      COUNT(recording_url) as with_url,
      COUNT(telnyx_recording_id) as with_telnyx_id,
      COUNT(ai_transcript) as with_transcript
    FROM call_sessions
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `);

  console.log('CALL_SESSIONS (Last 30 days):');
  const s = sessionStats.rows[0] as any;
  console.log(`  Total calls: ${s.total_calls}`);
  console.log(`  With recording_s3_key: ${s.with_s3_key}`);
  console.log(`  With recording_url: ${s.with_url}`);
  console.log(`  With telnyx_recording_id: ${s.with_telnyx_id}`);
  console.log(`  With ai_transcript: ${s.with_transcript}`);
  console.log();

  // Sample recording URLs to see format
  const samples = await db.execute(sql`
    SELECT 
      id,
      recording_s3_key,
      recording_url,
      telnyx_recording_id,
      CASE WHEN ai_transcript IS NOT NULL THEN 'yes' ELSE 'no' END as has_transcript
    FROM call_sessions
    WHERE recording_url IS NOT NULL OR recording_s3_key IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5
  `);

  console.log('SAMPLE RECORDING PATHS:');
  samples.rows.forEach((row: any) => {
    console.log(`\nCall ID: ${row.id}`);
    console.log(`  S3 Key: ${row.recording_s3_key || 'none'}`);
    console.log(`  URL: ${(row.recording_url || 'none').substring(0, 100)}`);
    console.log(`  Telnyx ID: ${row.telnyx_recording_id || 'none'}`);
    console.log(`  Has transcript: ${row.has_transcript}`);
  });
  console.log();

  // Check dialer_call_attempts
  const dialerStats = await db.execute(sql`
    SELECT 
      COUNT(*) as total_calls,
      COUNT(recording_url) as with_url,
      COUNT(telnyx_recording_id) as with_telnyx_id,
      COUNT(transcript) as with_transcript
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '30 days'
      AND call_duration_seconds > 0
  `);

  console.log('DIALER_CALL_ATTEMPTS (Last 30 days):');
  const d = dialerStats.rows[0] as any;
  console.log(`  Total calls: ${d.total_calls}`);
  console.log(`  With recording_url: ${d.with_url}`);
  console.log(`  With telnyx_recording_id: ${d.with_telnyx_id}`);
  console.log(`  With transcript: ${d.with_transcript}`);
  console.log();

  // Check URL patterns
  const patterns = await db.execute(sql`
    SELECT 
      CASE 
        WHEN recording_url LIKE 'gs://%' THEN 'gs://'
        WHEN recording_url LIKE 'gcs-internal://%' THEN 'gcs-internal://'
        WHEN recording_url LIKE 'https://storage.googleapis.com/%' THEN 'GCS public URL'
        WHEN recording_url LIKE 'https://%.telnyx.com/%' THEN 'Telnyx URL'
        WHEN recording_url LIKE 'https://%' THEN 'Other HTTPS'
        ELSE 'Other'
      END as url_type,
      COUNT(*) as count
    FROM call_sessions
    WHERE recording_url IS NOT NULL
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY url_type
    ORDER BY count DESC
  `);

  console.log('RECORDING URL PATTERNS (call_sessions, last 30 days):');
  patterns.rows.forEach((row: any) => {
    console.log(`  ${row.url_type}: ${row.count}`);
  });
  console.log();

  process.exit(0);
}

checkRecordingStorage().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});