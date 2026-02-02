import { pool } from './server/db';

async function investigateAICallDispositions() {
  console.log('=== INVESTIGATING AI CALL DISPOSITIONS ===\n');
  
  // Focus on Proton UK which has call_sessions (AI calls)
  const protonId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';
  
  // 1. Overview
  console.log('📋 PROTON UK AI CALLS OVERVIEW:');
  console.log('─'.repeat(70));
  
  const overview = await pool.query(`
    SELECT 
      COUNT(*) as total_sessions,
      COUNT(CASE WHEN ai_disposition = 'qualified_lead' THEN 1 END) as qualified,
      COUNT(CASE WHEN ai_disposition = 'not_interested' THEN 1 END) as not_interested,
      COUNT(CASE WHEN ai_disposition = 'voicemail' THEN 1 END) as voicemail,
      COUNT(CASE WHEN ai_disposition = 'no_answer' THEN 1 END) as no_answer,
      COUNT(CASE WHEN ai_disposition IS NULL THEN 1 END) as null_disposition,
      COUNT(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 END) as with_recording,
      COUNT(CASE WHEN ai_transcript IS NOT NULL AND ai_transcript != '' AND ai_transcript != '[]' THEN 1 END) as with_transcript
    FROM call_sessions
    WHERE campaign_id = $1
  `, [protonId]);
  
  const o = overview.rows[0];
  console.log(`  Total Call Sessions: ${o?.total_sessions}`);
  console.log(`  Qualified Lead: ${o?.qualified}`);
  console.log(`  Not Interested: ${o?.not_interested}`);
  console.log(`  Voicemail: ${o?.voicemail}`);
  console.log(`  No Answer: ${o?.no_answer}`);
  console.log(`  NULL Disposition: ${o?.null_disposition}`);
  console.log(`  With Recording: ${o?.with_recording}`);
  console.log(`  With Transcript: ${o?.with_transcript}`);
  
  // 2. Check calls with good duration but not qualified
  console.log('\n\n🔍 LONG CALLS (>60s) NOT MARKED QUALIFIED:');
  console.log('─'.repeat(70));
  
  const longCalls = await pool.query(`
    SELECT 
      id, 
      ai_disposition, 
      duration_seconds,
      recording_url,
      ai_transcript,
      created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND duration_seconds > 60
      AND (ai_disposition IS NULL OR ai_disposition != 'qualified_lead')
    ORDER BY duration_seconds DESC
    LIMIT 15
  `, [protonId]);
  
  console.log(`Found ${longCalls.rows.length} long calls not marked qualified:\n`);
  
  for (const call of longCalls.rows) {
    console.log(`  Duration: ${call.duration_seconds}s | Disposition: ${call.ai_disposition || 'NULL'}`);
    console.log(`  Recording: ${call.recording_url ? 'YES' : 'NO'}`);
    
    // Show transcript preview if available
    let transcript = call.ai_transcript || '';
    try {
      if (transcript.startsWith('[')) {
        const parsed = JSON.parse(transcript);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const preview = parsed.slice(0, 3).map((t: any) => 
            `${t.role || t.speaker}: ${(t.content || t.text || t.message || '').substring(0, 80)}...`
          ).join('\n    ');
          console.log(`  Transcript Preview:\n    ${preview}`);
        }
      } else if (transcript.length > 0) {
        console.log(`  Transcript Preview: ${transcript.substring(0, 150)}...`);
      }
    } catch (e) {
      if (transcript.length > 0) {
        console.log(`  Transcript Preview: ${transcript.substring(0, 150)}...`);
      }
    }
    console.log('');
  }
  
  // 3. Check disposition distribution by duration
  console.log('\n\n📊 DISPOSITION BY CALL DURATION:');
  console.log('─'.repeat(70));
  
  const byDuration = await pool.query(`
    SELECT 
      CASE 
        WHEN duration_seconds IS NULL OR duration_seconds = 0 THEN '0s (no duration)'
        WHEN duration_seconds < 10 THEN '1-10s'
        WHEN duration_seconds < 30 THEN '10-30s'
        WHEN duration_seconds < 60 THEN '30-60s'
        WHEN duration_seconds < 120 THEN '60-120s'
        ELSE '120s+'
      END as duration_bucket,
      ai_disposition,
      COUNT(*) as count
    FROM call_sessions
    WHERE campaign_id = $1
    GROUP BY 1, ai_disposition
    ORDER BY 1, count DESC
  `, [protonId]);
  
  const buckets: Record<string, Record<string, number>> = {};
  for (const r of byDuration.rows) {
    if (!buckets[r.duration_bucket]) buckets[r.duration_bucket] = {};
    buckets[r.duration_bucket][r.ai_disposition || 'NULL'] = r.count;
  }
  
  for (const [bucket, dispositions] of Object.entries(buckets)) {
    console.log(`\n  ${bucket}:`);
    for (const [disp, count] of Object.entries(dispositions)) {
      console.log(`    ${disp}: ${count}`);
    }
  }
  
  // 4. Check what's happening with disposition logic
  console.log('\n\n🔬 CHECKING CALLS WITH RECORDINGS BUT NO QUALIFIED DISPOSITION:');
  console.log('─'.repeat(70));
  
  const withRecordingNotQualified = await pool.query(`
    SELECT 
      id,
      ai_disposition,
      duration_seconds,
      recording_url,
      ai_analysis,
      created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND recording_url IS NOT NULL 
      AND recording_url != ''
      AND (ai_disposition IS NULL OR ai_disposition NOT IN ('qualified_lead'))
    ORDER BY duration_seconds DESC
    LIMIT 10
  `, [protonId]);
  
  console.log(`Found ${withRecordingNotQualified.rows.length} calls with recordings but not qualified:\n`);
  
  for (const call of withRecordingNotQualified.rows) {
    console.log(`  ID: ${call.id}`);
    console.log(`  Duration: ${call.duration_seconds}s`);
    console.log(`  Disposition: ${call.ai_disposition || 'NULL'}`);
    console.log(`  Recording: ${call.recording_url?.substring(0, 60)}...`);
    if (call.ai_analysis) {
      const analysis = typeof call.ai_analysis === 'string' ? call.ai_analysis : JSON.stringify(call.ai_analysis);
      console.log(`  AI Analysis: ${analysis.substring(0, 200)}...`);
    }
    console.log('');
  }
  
  // 5. Check the 2 qualified leads - what made them different?
  console.log('\n\n✅ THE 2 CALLS THAT GOT QUALIFIED - WHAT MADE THEM DIFFERENT:');
  console.log('─'.repeat(70));
  
  const qualifiedCalls = await pool.query(`
    SELECT *
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_disposition = 'qualified_lead'
  `, [protonId]);
  
  for (const call of qualifiedCalls.rows) {
    console.log(`\n  Call ID: ${call.id}`);
    console.log(`  Duration: ${call.duration_seconds}s`);
    console.log(`  Created: ${call.created_at}`);
    console.log(`  Recording: ${call.recording_url ? 'YES' : 'NO'}`);
    
    // Show key fields
    const keys = ['ai_disposition', 'ai_analysis', 'ai_score', 'call_outcome', 'disposition_reason'];
    for (const k of keys) {
      if (call[k]) {
        const val = typeof call[k] === 'object' ? JSON.stringify(call[k]) : call[k];
        console.log(`  ${k}: ${String(val).substring(0, 200)}`);
      }
    }
  }
  
  // 6. Check if there's a mismatch between call_sessions and dialer_call_attempts
  console.log('\n\n🔄 COMPARING CALL_SESSIONS vs DIALER_CALL_ATTEMPTS:');
  console.log('─'.repeat(70));
  
  const dcaDispositions = await pool.query(`
    SELECT disposition, COUNT(*) as count
    FROM dialer_call_attempts
    WHERE campaign_id = $1
    GROUP BY disposition
    ORDER BY count DESC
  `, [protonId]);
  
  console.log('  dialer_call_attempts dispositions:');
  dcaDispositions.rows.forEach((r: any) => console.log(`    ${r.disposition || 'NULL'}: ${r.count}`));
  
  const csDispositions = await pool.query(`
    SELECT ai_disposition, COUNT(*) as count
    FROM call_sessions
    WHERE campaign_id = $1
    GROUP BY ai_disposition
    ORDER BY count DESC
  `, [protonId]);
  
  console.log('\n  call_sessions ai_dispositions:');
  csDispositions.rows.forEach((r: any) => console.log(`    ${r.ai_disposition || 'NULL'}: ${r.count}`));
  
  // 7. Check if disposition sync is happening
  console.log('\n\n🔗 CHECKING DISPOSITION SYNC:');
  console.log('─'.repeat(70));
  
  const syncCheck = await pool.query(`
    SELECT 
      cs.id as session_id,
      cs.ai_disposition,
      cs.duration_seconds,
      dca.id as attempt_id,
      dca.disposition as attempt_disposition
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    WHERE cs.campaign_id = $1
      AND cs.duration_seconds > 30
    ORDER BY cs.duration_seconds DESC
    LIMIT 10
  `, [protonId]);
  
  console.log('  Sample calls with duration > 30s:');
  for (const r of syncCheck.rows) {
    console.log(`    Session: ${r.ai_disposition || 'NULL'} | Attempt: ${r.attempt_disposition || 'NOT LINKED'} | ${r.duration_seconds}s`);
  }
  
  // 8. Check if recordings exist in Telnyx but disposition wasn't set
  console.log('\n\n📞 CALLS WITH TELNYX ID BUT NULL DISPOSITION:');
  console.log('─'.repeat(70));
  
  const nullDispWithTelnyx = await pool.query(`
    SELECT 
      id,
      telnyx_call_control_id,
      duration_seconds,
      recording_url,
      ai_disposition,
      created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_disposition IS NULL
      AND telnyx_call_control_id IS NOT NULL
      AND duration_seconds > 30
    ORDER BY duration_seconds DESC
    LIMIT 10
  `, [protonId]);
  
  console.log(`Found ${nullDispWithTelnyx.rows.length} calls with NULL disposition but have Telnyx ID and duration > 30s:\n`);
  for (const r of nullDispWithTelnyx.rows) {
    console.log(`  Telnyx ID: ${r.telnyx_call_control_id}`);
    console.log(`  Duration: ${r.duration_seconds}s`);
    console.log(`  Recording: ${r.recording_url ? 'YES' : 'NO'}`);
    console.log('');
  }
  
  console.log('\n\n📋 SUMMARY:');
  console.log('═'.repeat(70));
  console.log(`
Root Cause Analysis:
1. Total AI Call Sessions: ${o?.total_sessions}
2. Only ${o?.qualified} marked as qualified_lead
3. ${o?.null_disposition} have NULL disposition (never classified)
4. ${o?.with_recording} have recordings but disposition logic may not have run

The AI is NOT classifying calls as qualified. This could be because:
- Disposition logic is not running after call completion
- AI analysis is not triggering lead creation
- The qualification criteria is too strict
- Recording/transcript analysis is not happening
`);

  process.exit(0);
}

investigateAICallDispositions().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
