import { pool } from './server/db';

async function deepDive() {
  const protonId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';
  
  console.log('=== DEEP DIVE: WHY NO QUALIFIED LEADS ===\n');
  
  // 1. Check recording_duration_sec vs duration_sec
  console.log('📊 DURATION FIELDS COMPARISON:');
  const durationCheck = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN duration_sec > 0 THEN 1 END) as has_duration_sec,
      COUNT(CASE WHEN recording_duration_sec > 0 THEN 1 END) as has_recording_duration,
      AVG(CASE WHEN recording_duration_sec > 0 THEN recording_duration_sec END) as avg_recording_duration,
      MAX(recording_duration_sec) as max_recording_duration
    FROM call_sessions
    WHERE campaign_id = $1
  `, [protonId]);
  
  const d = durationCheck.rows[0];
  console.log(`  Total sessions: ${d.total}`);
  console.log(`  Has duration_sec > 0: ${d.has_duration_sec}`);
  console.log(`  Has recording_duration_sec > 0: ${d.has_recording_duration}`);
  console.log(`  Avg recording duration: ${Math.round(d.avg_recording_duration || 0)}s`);
  console.log(`  Max recording duration: ${d.max_recording_duration}s`);
  
  // 2. Check calls by recording_duration_sec
  console.log('\n\n🎙️ CALLS BY RECORDING DURATION:');
  const byRecDuration = await pool.query(`
    SELECT 
      CASE 
        WHEN recording_duration_sec IS NULL OR recording_duration_sec = 0 THEN 'No recording'
        WHEN recording_duration_sec  = {};
  for (const r of byRecDuration.rows) {
    if (!buckets[r.rec_bucket]) buckets[r.rec_bucket] = [];
    buckets[r.rec_bucket].push({ disp: r.ai_disposition || 'NULL', count: r.count });
  }
  
  for (const [bucket, items] of Object.entries(buckets)) {
    console.log(`\n  ${bucket}:`);
    items.forEach(i => console.log(`    ${i.disp}: ${i.count}`));
  }
  
  // 3. Find calls with LONG recordings not marked qualified
  console.log('\n\n🔍 LONG RECORDINGS (>60s) NOT MARKED QUALIFIED:');
  const longRecordings = await pool.query(`
    SELECT id, ai_disposition, recording_duration_sec, recording_url, ai_transcript
    FROM call_sessions
    WHERE campaign_id = $1
      AND recording_duration_sec > 60
      AND (ai_disposition IS NULL OR ai_disposition != 'qualified_lead')
    ORDER BY recording_duration_sec DESC
    LIMIT 10
  `, [protonId]);
  
  console.log(`Found ${longRecordings.rows.length} long recordings not qualified:\n`);
  for (const c of longRecordings.rows) {
    console.log(`  ${c.recording_duration_sec}s | ${c.ai_disposition || 'NULL'} | Has Transcript: ${c.ai_transcript ? 'YES' : 'NO'}`);
    console.log(`  Recording: ${c.recording_url?.substring(0, 80)}...`);
  }
  
  // 4. Show transcripts from long recordings
  console.log('\n\n📝 TRANSCRIPTS FROM LONGEST RECORDINGS:');
  const longWithTranscript = await pool.query(`
    SELECT id, ai_disposition, recording_duration_sec, ai_transcript
    FROM call_sessions
    WHERE campaign_id = $1
      AND recording_duration_sec > 30
      AND ai_transcript IS NOT NULL
      AND ai_transcript != ''
    ORDER BY recording_duration_sec DESC
    LIMIT 5
  `, [protonId]);
  
  for (const c of longWithTranscript.rows) {
    console.log(`\n  Duration: ${c.recording_duration_sec}s | Disposition: ${c.ai_disposition || 'NULL'}`);
    let transcript = c.ai_transcript;
    try {
      if (typeof transcript === 'string' && (transcript.startsWith('[') || transcript.startsWith('{'))) {
        const parsed = JSON.parse(transcript);
        if (Array.isArray(parsed)) {
          transcript = parsed.map((t: any) => 
            `${t.role || t.speaker || 'unknown'}: ${(t.content || t.message || t.text || '').substring(0, 150)}`
          ).join('\n    ');
        } else if (parsed.messages) {
          transcript = parsed.messages.map((t: any) => 
            `${t.role || 'unknown'}: ${(t.content || '').substring(0, 150)}`
          ).join('\n    ');
        }
      }
    } catch(e) {}
    console.log(`  Transcript:\n    ${String(transcript).substring(0, 800)}`);
  }
  
  // 5. Check if there are conversations with back-and-forth
  console.log('\n\n🗣️ LOOKING FOR REAL CONVERSATIONS:');
  const withTranscripts = await pool.query(`
    SELECT id, ai_disposition, recording_duration_sec, ai_transcript
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_transcript IS NOT NULL
      AND ai_transcript != ''
      AND ai_transcript != '[]'
    ORDER BY recording_duration_sec DESC
    LIMIT 30
  `, [protonId]);
  
  let realConversations = 0;
  let voicemailMisclassified = 0;
  let shortCalls = 0;
  
  for (const c of withTranscripts.rows) {
    let transcript = String(c.ai_transcript).toLowerCase();
    
    // Check for voicemail indicators
    const voicemailIndicators = ['leave a message', 'voicemail', 'after the beep', 'not available', 'record your message', 'mailbox'];
    const isVoicemail = voicemailIndicators.some(v => transcript.includes(v));
    
    // Check for real conversation (multiple speakers)
    const hasAgent = transcript.includes('agent:') || transcript.includes('assistant:');
    const hasContact = transcript.includes('contact:') || transcript.includes('user:') || transcript.includes('human:');
    
    // Count speaking turns
    const agentTurns = (transcript.match(/agent:|assistant:/g) || []).length;
    const contactTurns = (transcript.match(/contact:|user:|human:/g) || []).length;
    
    if (isVoicemail && c.ai_disposition !== 'voicemail') {
      voicemailMisclassified++;
    } else if (agentTurns > 2 && contactTurns > 2) {
      realConversations++;
      console.log(`\n  ✅ REAL CONVERSATION FOUND:`);
      console.log(`  Duration: ${c.recording_duration_sec}s | Disposition: ${c.ai_disposition || 'NULL'}`);
      console.log(`  Agent turns: ${agentTurns}, Contact turns: ${contactTurns}`);
    }
  }
  
  console.log(`\n\n📋 SUMMARY:`);
  console.log(`  Calls analyzed: ${withTranscripts.rows.length}`);
  console.log(`  Real conversations (back-and-forth): ${realConversations}`);
  console.log(`  Voicemail misclassified as other: ${voicemailMisclassified}`);
  
  // 6. Check what the AI analysis says for long calls
  console.log('\n\n🧠 AI ANALYSIS ON CALLS WITH TRANSCRIPTS:');
  const withAnalysis = await pool.query(`
    SELECT id, ai_disposition, recording_duration_sec, ai_analysis
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_analysis IS NOT NULL
    ORDER BY recording_duration_sec DESC
    LIMIT 10
  `, [protonId]);
  
  for (const a of withAnalysis.rows) {
    console.log(`\n  Duration: ${a.recording_duration_sec}s | Disposition: ${a.ai_disposition || 'NULL'}`);
    try {
      const analysis = typeof a.ai_analysis === 'string' ? JSON.parse(a.ai_analysis) : a.ai_analysis;
      console.log(`  Outcome: ${analysis.outcome || 'N/A'}`);
      console.log(`  Summary: ${(analysis.summary || 'N/A').substring(0, 150)}`);
      if (analysis.qualification) {
        console.log(`  Qualification: ${JSON.stringify(analysis.qualification)}`);
      }
    } catch(e) {
      console.log(`  Analysis: ${JSON.stringify(a.ai_analysis).substring(0, 200)}`);
    }
  }
  
  process.exit(0);
}

deepDive().catch(e => { console.error(e); process.exit(1); });