/**
 * Check Call Intelligence Status
 * Verifies recordings, transcripts, and quality analysis
 */

import { db } from './server/db';
import { callSessions, callQualityRecords, dialerCallAttempts } from './shared/schema';
import { desc, sql, isNotNull } from 'drizzle-orm';

async function checkStatus() {
  console.log('\n========================================');
  console.log('CALL INTELLIGENCE STATUS CHECK');
  console.log('========================================\n');

  // Check call_sessions
  const sessionStats = await db.execute(sql`
    SELECT 
      count(*) as total,
      count(case when recording_url is not null then 1 end) as with_recording_url,
      count(case when recording_s3_key is not null then 1 end) as with_s3_key,
      count(case when recording_status = 'stored' then 1 end) as stored_status,
      count(case when ai_transcript is not null then 1 end) as with_transcript
    FROM call_sessions
  `);
  
  console.log('=== CALL SESSIONS ===');
  console.log('Total sessions:', sessionStats.rows[0].total);
  console.log('With recording URL:', sessionStats.rows[0].with_recording_url);
  console.log('With S3/GCS key:', sessionStats.rows[0].with_s3_key);
  console.log('Status stored:', sessionStats.rows[0].stored_status);
  console.log('With transcript:', sessionStats.rows[0].with_transcript);

  // Check dialer_call_attempts
  const dialerStats = await db.execute(sql`
    SELECT 
      count(*) as total,
      count(case when recording_url is not null then 1 end) as with_recording_url,
      count(case when full_transcript is not null then 1 end) as with_transcript
    FROM dialer_call_attempts
  `);
  
  console.log('\n=== DIALER CALL ATTEMPTS ===');
  console.log('Total attempts:', dialerStats.rows[0].total);
  console.log('With recording URL:', dialerStats.rows[0].with_recording_url);
  console.log('With transcript:', dialerStats.rows[0].with_transcript);

  // Check quality records
  const qualityStats = await db.execute(sql`
    SELECT 
      count(*) as total,
      count(case when overall_quality_score is not null then 1 end) as with_score,
      count(case when full_transcript is not null then 1 end) as with_transcript
    FROM call_quality_records
  `);
  
  console.log('\n=== QUALITY RECORDS ===');
  console.log('Total quality records:', qualityStats.rows[0].total);
  console.log('With quality score:', qualityStats.rows[0].with_score);
  console.log('With transcript stored:', qualityStats.rows[0].with_transcript);

  // Sample recent sessions
  const recentSessions = await db.execute(sql`
    SELECT 
      id,
      started_at,
      recording_url is not null as has_recording_url,
      recording_s3_key is not null as has_s3_key,
      recording_status,
      ai_transcript is not null as has_transcript,
      ai_disposition
    FROM call_sessions
    ORDER BY started_at DESC
    LIMIT 5
  `);
  
  console.log('\n=== RECENT CALL SESSIONS (Last 5) ===');
  for (const row of recentSessions.rows) {
    const recSource = row.has_s3_key ? 'GCS' : (row.has_recording_url ? 'URL' : 'NONE');
    console.log(`ID: ${String(row.id).substring(0,8)}... | Recording: ${recSource} | Status: ${row.recording_status || 'null'} | Transcript: ${row.has_transcript} | Disposition: ${row.ai_disposition || 'null'}`);
  }

  // Check for issues
  console.log('\n=== POTENTIAL ISSUES ===');
  
  // Sessions with recording URL but not stored in GCS
  const notStoredCount = await db.execute(sql`
    SELECT count(*) as count
    FROM call_sessions
    WHERE recording_url is not null 
    AND recording_s3_key is null
  `);
  console.log(`Sessions with URL but not in GCS: ${notStoredCount.rows[0].count}`);

  // Sessions with recording but no transcript
  const noTranscriptCount = await db.execute(sql`
    SELECT count(*) as count
    FROM call_sessions
    WHERE (recording_url is not null OR recording_s3_key is not null)
    AND ai_transcript is null
  `);
  console.log(`Sessions with recording but no transcript: ${noTranscriptCount.rows[0].count}`);

  // Sessions with transcript but no quality analysis
  const noAnalysisCount = await db.execute(sql`
    SELECT count(*) as count
    FROM call_sessions cs
    WHERE cs.ai_transcript is not null
    AND NOT EXISTS (
      SELECT 1 FROM call_quality_records cqr 
      WHERE cqr.call_session_id = cs.id
    )
  `);
  console.log(`Sessions with transcript but no quality analysis: ${noAnalysisCount.rows[0].count}`);

  console.log('\n========================================');
  console.log('STATUS CHECK COMPLETE');
  console.log('========================================\n');

  process.exit(0);
}

checkStatus().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
