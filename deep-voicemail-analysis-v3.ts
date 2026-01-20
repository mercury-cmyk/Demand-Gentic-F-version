import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function deepVoicemailAnalysis() {
  console.log('=== DEEP VOICEMAIL & NOT_INTERESTED ANALYSIS ===\n');

  // 1. Not interested with connected=false - samples with sessions
  console.log('--- NOT_INTERESTED CONNECTED=FALSE WITH SESSION ---');
  
  const niWithTranscripts = await db.execute(sql`
    SELECT 
      dca.id,
      dca.call_duration_seconds,
      dca.notes,
      cs.ai_transcript,
      cs.ai_disposition as session_disposition
    FROM dialer_call_attempts dca
    LEFT JOIN call_sessions cs ON dca.call_session_id = cs.id
    WHERE dca.disposition = 'not_interested' 
      AND dca.connected = false
      AND dca.call_session_id IS NOT NULL
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 8
  `);
  
  console.log('Not_interested (connected=false) WITH session:');
  for (const r of niWithTranscripts.rows) {
    const transcript = (r.ai_transcript as string || '').substring(0, 250);
    console.log(`\n  [${r.call_duration_seconds}s] Session AI disposition: ${r.session_disposition || 'NULL'}`);
    console.log(`  Transcript: ${transcript}...`);
  }

  // 2. Not interested WITHOUT sessions - samples
  console.log('\n\n--- NOT_INTERESTED CONNECTED=FALSE WITHOUT SESSION ---');
  
  const niWithoutSessions = await db.execute(sql`
    SELECT 
      dca.id,
      dca.call_duration_seconds,
      dca.notes
    FROM dialer_call_attempts dca
    WHERE dca.disposition = 'not_interested' 
      AND dca.connected = false
      AND dca.call_session_id IS NULL
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 8
  `);
  
  console.log('Not_interested (connected=false) WITHOUT session:');
  for (const r of niWithoutSessions.rows) {
    const notes = (r.notes as string || '').substring(0, 300);
    console.log(`\n  [${r.call_duration_seconds}s]`);
    console.log(`  Notes: ${notes || 'NO NOTES'}...`);
  }

  // 3. Keyword analysis
  console.log('\n\n--- KEYWORD PATTERN ANALYSIS ---');
  
  const niNotesVmPatterns = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM dialer_call_attempts dca
    WHERE dca.disposition = 'not_interested' 
      AND dca.connected = false
      AND (
        dca.notes ILIKE '%voicemail%'
        OR dca.notes ILIKE '%leave a message%'
        OR dca.notes ILIKE '%not available%'
        OR dca.notes ILIKE '%after the tone%'
        OR dca.notes ILIKE '%mailbox%'
        OR dca.notes ILIKE '%please record%'
      )
  `);
  console.log(`Not_interested with voicemail keywords in NOTES: ${niNotesVmPatterns.rows[0]?.cnt || 0}`);

  const niIvrPatterns = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM dialer_call_attempts dca
    WHERE dca.disposition = 'not_interested' 
      AND dca.connected = false
      AND (
        dca.notes ILIKE '%press 1%'
        OR dca.notes ILIKE '%press 2%'
        OR dca.notes ILIKE '%dial by name%'
        OR dca.notes ILIKE '%extension%'
        OR dca.notes ILIKE '%directory%'
        OR dca.notes ILIKE '%automated%'
      )
  `);
  console.log(`Not_interested with IVR keywords in NOTES: ${niIvrPatterns.rows[0]?.cnt || 0}`);

  // 4. Notes content breakdown
  console.log('\n\n--- NOT_INTERESTED NOTES CONTENT BREAKDOWN ---');
  
  const niNotesBreakdown = await db.execute(sql`
    SELECT 
      CASE 
        WHEN notes ILIKE '%voicemail%' OR notes ILIKE '%mailbox%' THEN 'Voicemail keyword'
        WHEN notes ILIKE '%not available%' OR notes ILIKE '%unavailable%' THEN 'Unavailable keyword'
        WHEN notes ILIKE '%press%' OR notes ILIKE '%extension%' THEN 'IVR keyword'
        WHEN notes ILIKE '%wrong number%' OR notes ILIKE '%wrong person%' THEN 'Wrong number'
        WHEN notes ILIKE '%goodbye%' OR notes ILIKE '%bye%' THEN 'Goodbye keyword'
        WHEN notes IS NULL OR notes = '' THEN 'NO NOTES'
        ELSE 'Other'
      END as category,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'not_interested' AND connected = false
    GROUP BY category
    ORDER BY cnt DESC
  `);
  
  for (const r of niNotesBreakdown.rows) {
    console.log(`  ${r.category}: ${r.cnt}`);
  }

  // 5. Voicemail breakdown
  console.log('\n\n--- VOICEMAIL_DETECTED FLAG BREAKDOWN ---');
  
  const vmDetectedAnalysis = await db.execute(sql`
    SELECT 
      voicemail_detected,
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN '0s'
        WHEN call_duration_seconds < 10 THEN '1-9s'
        WHEN call_duration_seconds < 30 THEN '10-29s'
        WHEN call_duration_seconds < 60 THEN '30-59s'
        ELSE '60s+'
      END as duration,
      CASE WHEN call_session_id IS NOT NULL THEN 'Session' ELSE 'No session' END as session,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'voicemail'
    GROUP BY voicemail_detected, duration, session
    ORDER BY voicemail_detected DESC, cnt DESC
  `);
  
  console.log('VM_Detected | Duration | Session    | Count');
  console.log('-'.repeat(50));
  for (const r of vmDetectedAnalysis.rows) {
    console.log(`${String(r.voicemail_detected).padEnd(11)} | ${String(r.duration).padEnd(8)} | ${String(r.session).padEnd(10)} | ${r.cnt}`);
  }

  // 6. Sample voicemail notes (VM_detected=false, 30s+)
  console.log('\n\n--- VOICEMAIL VM_DETECTED=FALSE SAMPLES (30s+) ---');
  
  const vmNotesSamples = await db.execute(sql`
    SELECT 
      call_duration_seconds,
      LEFT(notes, 350) as notes_preview
    FROM dialer_call_attempts
    WHERE disposition = 'voicemail'
      AND voicemail_detected = false
      AND call_duration_seconds >= 30
    LIMIT 5
  `);
  
  for (const r of vmNotesSamples.rows) {
    console.log(`\n  [${r.call_duration_seconds}s]`);
    console.log(`  ${r.notes_preview}...`);
  }

  // 7. Sample voicemail notes (VM_detected=true)
  console.log('\n\n--- VOICEMAIL VM_DETECTED=TRUE SAMPLES ---');
  
  const vmTrueSamples = await db.execute(sql`
    SELECT 
      call_duration_seconds,
      LEFT(notes, 350) as notes_preview
    FROM dialer_call_attempts
    WHERE disposition = 'voicemail'
      AND voicemail_detected = true
    LIMIT 5
  `);
  
  for (const r of vmTrueSamples.rows) {
    console.log(`\n  [${r.call_duration_seconds}s]`);
    console.log(`  ${r.notes_preview}...`);
  }

  process.exit(0);
}

deepVoicemailAnalysis();
