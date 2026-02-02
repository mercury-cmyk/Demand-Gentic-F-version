import { pool } from './server/db';

async function main() {
  const protonId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';
  
  console.log('=== AI CALL DISPOSITION ANALYSIS ===\n');
  
  // Overview
  const overview = await pool.query(`
    SELECT 
      COUNT(*) as total_sessions,
      COUNT(CASE WHEN ai_disposition = 'qualified_lead' THEN 1 END) as qualified,
      COUNT(CASE WHEN ai_disposition = 'not_interested' THEN 1 END) as not_interested,
      COUNT(CASE WHEN ai_disposition = 'voicemail' THEN 1 END) as voicemail,
      COUNT(CASE WHEN ai_disposition = 'no_answer' THEN 1 END) as no_answer,
      COUNT(CASE WHEN ai_disposition IS NULL THEN 1 END) as null_disposition,
      COUNT(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 END) as with_recording,
      COUNT(CASE WHEN ai_transcript IS NOT NULL AND ai_transcript != '' THEN 1 END) as with_transcript
    FROM call_sessions
    WHERE campaign_id = $1
  `, [protonId]);
  
  const o = overview.rows[0];
  console.log('📋 OVERVIEW:');
  console.log(`  Total Sessions: ${o.total_sessions}`);
  console.log(`  Qualified: ${o.qualified}`);
  console.log(`  Not Interested: ${o.not_interested}`);
  console.log(`  Voicemail: ${o.voicemail}`);
  console.log(`  No Answer: ${o.no_answer}`);
  console.log(`  NULL Disposition: ${o.null_disposition}`);
  console.log(`  With Recording: ${o.with_recording}`);
  console.log(`  With Transcript: ${o.with_transcript}`);
  
  // Long calls not qualified
  console.log('\n\n🔍 LONG CALLS (>60s) NOT MARKED QUALIFIED:');
  const longCalls = await pool.query(`
    SELECT id, ai_disposition, duration_sec, recording_url, ai_transcript
    FROM call_sessions
    WHERE campaign_id = $1
      AND duration_sec > 60
      AND (ai_disposition IS NULL OR ai_disposition != 'qualified_lead')
    ORDER BY duration_sec DESC
    LIMIT 10
  `, [protonId]);
  
  console.log(`Found ${longCalls.rows.length} long calls not qualified:\n`);
  for (const c of longCalls.rows) {
    console.log(`  ${c.duration_sec}s | ${c.ai_disposition || 'NULL'} | Recording: ${c.recording_url ? 'YES' : 'NO'} | Transcript: ${c.ai_transcript ? 'YES' : 'NO'}`);
  }
  
  // Calls with transcripts - show sample
  console.log('\n\n📝 SAMPLE TRANSCRIPT FROM LONG CALL:');
  const withTranscript = await pool.query(`
    SELECT id, ai_disposition, duration_sec, ai_transcript
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_transcript IS NOT NULL
      AND ai_transcript != ''
      AND duration_sec > 30
    ORDER BY duration_sec DESC
    LIMIT 3
  `, [protonId]);
  
  for (const c of withTranscript.rows) {
    console.log(`\n  Duration: ${c.duration_sec}s | Disposition: ${c.ai_disposition || 'NULL'}`);
    let transcript = c.ai_transcript;
    try {
      if (typeof transcript === 'string' && transcript.startsWith('[')) {
        const parsed = JSON.parse(transcript);
        transcript = parsed.slice(0, 5).map((t: any) => 
          `${t.role || 'unknown'}: ${(t.content || t.message || '').substring(0, 100)}`
        ).join('\n    ');
      }
    } catch(e) {}
    console.log(`  Transcript:\n    ${String(transcript).substring(0, 500)}`);
  }
  
  // Check disposition by duration bucket
  console.log('\n\n📊 DISPOSITION BY DURATION:');
  const byDuration = await pool.query(`
    SELECT 
      CASE 
        WHEN duration_sec IS NULL OR duration_sec = 0 THEN '0s'
        WHEN duration_sec < 10 THEN '1-10s'
        WHEN duration_sec < 30 THEN '10-30s'
        WHEN duration_sec < 60 THEN '30-60s'
        WHEN duration_sec < 120 THEN '60-120s'
        ELSE '120s+'
      END as duration_bucket,
      ai_disposition,
      COUNT(*) as count
    FROM call_sessions
    WHERE campaign_id = $1
    GROUP BY 1, ai_disposition
    ORDER BY 1, count DESC
  `, [protonId]);
  
  const buckets: Record<string, any[]> = {};
  for (const r of byDuration.rows) {
    if (!buckets[r.duration_bucket]) buckets[r.duration_bucket] = [];
    buckets[r.duration_bucket].push({ disp: r.ai_disposition || 'NULL', count: r.count });
  }
  
  for (const [bucket, items] of Object.entries(buckets)) {
    console.log(`\n  ${bucket}:`);
    items.forEach(i => console.log(`    ${i.disp}: ${i.count}`));
  }
  
  // Check the 2 qualified calls
  console.log('\n\n✅ THE 2 QUALIFIED CALLS:');
  const qualified = await pool.query(`
    SELECT id, duration_sec, recording_url, ai_transcript, ai_analysis, created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_disposition = 'qualified_lead'
  `, [protonId]);
  
  for (const q of qualified.rows) {
    console.log(`\n  ID: ${q.id}`);
    console.log(`  Duration: ${q.duration_sec}s`);
    console.log(`  Recording: ${q.recording_url ? 'YES' : 'NO'}`);
    console.log(`  Created: ${q.created_at}`);
    if (q.ai_analysis) {
      console.log(`  AI Analysis: ${JSON.stringify(q.ai_analysis).substring(0, 200)}`);
    }
  }
  
  // Check if there's ai_analysis for long calls
  console.log('\n\n🧠 AI ANALYSIS FOR LONG CALLS:');
  const withAnalysis = await pool.query(`
    SELECT id, duration_sec, ai_disposition, ai_analysis
    FROM call_sessions
    WHERE campaign_id = $1
      AND duration_sec > 60
      AND ai_analysis IS NOT NULL
    LIMIT 5
  `, [protonId]);
  
  console.log(`Found ${withAnalysis.rows.length} long calls with AI analysis`);
  for (const a of withAnalysis.rows) {
    console.log(`\n  Duration: ${a.duration_sec}s | Disposition: ${a.ai_disposition || 'NULL'}`);
    console.log(`  Analysis: ${JSON.stringify(a.ai_analysis).substring(0, 300)}`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
