import { pool } from './server/db';

async function checkRecordingsAndTranscripts() {
  const protonId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';
  
  console.log('=== CHECKING RECORDINGS AND TRANSCRIPTS ===\n');
  
  // 1. Check what recording_url looks like
  console.log('📼 SAMPLE RECORDING URLS:');
  const recordings = await pool.query(`
    SELECT id, recording_url, recording_s3_key, recording_status, telnyx_call_id, ai_disposition
    FROM call_sessions
    WHERE campaign_id = $1
      AND recording_url IS NOT NULL
      AND recording_url != ''
    LIMIT 10
  `, [protonId]);
  
  console.log(`Found ${recordings.rows.length} sessions with recording_url:\n`);
  for (const r of recordings.rows) {
    console.log(`  ID: ${r.id}`);
    console.log(`  Telnyx Call ID: ${r.telnyx_call_id}`);
    console.log(`  Recording URL: ${r.recording_url}`);
    console.log(`  S3 Key: ${r.recording_s3_key || 'NONE'}`);
    console.log(`  Status: ${r.recording_status || 'NONE'}`);
    console.log(`  Disposition: ${r.ai_disposition || 'NULL'}`);
    console.log('');
  }
  
  // 2. Check how many have telnyx_call_id
  console.log('\n📞 TELNYX CALL IDS:');
  const telnyxIds = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(telnyx_call_id) as with_telnyx_id,
      COUNT(CASE WHEN telnyx_call_id IS NOT NULL AND telnyx_call_id != '' THEN 1 END) as with_actual_telnyx_id
    FROM call_sessions
    WHERE campaign_id = $1
  `, [protonId]);
  
  console.log(`  Total: ${telnyxIds.rows[0].total}`);
  console.log(`  With Telnyx ID: ${telnyxIds.rows[0].with_actual_telnyx_id}`);
  
  // 3. Check sample Telnyx IDs for sessions without recordings
  console.log('\n\n🔍 SESSIONS WITH TELNYX ID BUT NO RECORDING:');
  const noRecording = await pool.query(`
    SELECT id, telnyx_call_id, ai_disposition, duration_sec, created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND telnyx_call_id IS NOT NULL
      AND telnyx_call_id != ''
      AND (recording_url IS NULL OR recording_url = '')
    ORDER BY created_at DESC
    LIMIT 10
  `, [protonId]);
  
  console.log(`Found ${noRecording.rows.length} sessions with Telnyx ID but no recording:\n`);
  for (const r of noRecording.rows) {
    console.log(`  Telnyx ID: ${r.telnyx_call_id}`);
    console.log(`  Disposition: ${r.ai_disposition || 'NULL'}`);
    console.log(`  Duration: ${r.duration_sec}s`);
    console.log(`  Created: ${r.created_at}`);
    console.log('');
  }
  
  // 4. Check what ai_transcript looks like
  console.log('\n📝 SAMPLE TRANSCRIPTS:');
  const transcripts = await pool.query(`
    SELECT id, ai_transcript, ai_disposition, recording_url
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_transcript IS NOT NULL
      AND ai_transcript != ''
      AND ai_transcript != '[]'
    LIMIT 5
  `, [protonId]);
  
  for (const t of transcripts.rows) {
    console.log(`\n  ID: ${t.id}`);
    console.log(`  Disposition: ${t.ai_disposition || 'NULL'}`);
    console.log(`  Has Recording: ${t.recording_url ? 'YES' : 'NO'}`);
    console.log(`  Transcript (first 500 chars):`);
    console.log(`    ${String(t.ai_transcript).substring(0, 500)}`);
  }
  
  // 5. Check dates of calls
  console.log('\n\n📅 CALL DATES:');
  const dates = await pool.query(`
    SELECT 
      DATE(created_at) as call_date,
      COUNT(*) as count,
      COUNT(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 END) as with_recording
    FROM call_sessions
    WHERE campaign_id = $1
    GROUP BY DATE(created_at)
    ORDER BY call_date DESC
    LIMIT 15
  `, [protonId]);
  
  for (const d of dates.rows) {
    console.log(`  ${d.call_date}: ${d.count} calls, ${d.with_recording} with recording`);
  }
  
  // 6. Check if there are calls in dialer_call_attempts that have recordings
  console.log('\n\n🔄 CHECKING DIALER_CALL_ATTEMPTS FOR RECORDINGS:');
  const dcaRecordings = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 END) as with_recording
    FROM dialer_call_attempts
    WHERE campaign_id = $1
  `, [protonId]);
  
  console.log(`  DCA Total: ${dcaRecordings.rows[0].total}`);
  console.log(`  DCA With Recording: ${dcaRecordings.rows[0].with_recording}`);
  
  // 7. Check if there's a linked DCA with recording for call_sessions without
  console.log('\n\n🔗 CHECKING LINKED DCA FOR CALL_SESSIONS:');
  const linkedCheck = await pool.query(`
    SELECT 
      cs.id as session_id,
      cs.recording_url as session_recording,
      dca.id as dca_id,
      dca.recording_url as dca_recording
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    WHERE cs.campaign_id = $1
    LIMIT 10
  `, [protonId]);
  
  for (const l of linkedCheck.rows) {
    console.log(`  Session: ${l.session_id}`);
    console.log(`    Session Recording: ${l.session_recording ? 'YES' : 'NO'}`);
    console.log(`    Linked DCA: ${l.dca_id || 'NONE'}`);
    console.log(`    DCA Recording: ${l.dca_recording ? 'YES' : 'NO'}`);
    console.log('');
  }
  
  process.exit(0);
}

checkRecordingsAndTranscripts().catch(e => { console.error(e); process.exit(1); });