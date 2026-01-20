import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function deepVoicemailAnalysis() {
  console.log('=== DEEP VOICEMAIL & NOT_INTERESTED ANALYSIS ===\n');

  // 1. Voicemail with 60s+ duration but voicemail_detected=false (700 calls)
  console.log('--- VOICEMAIL 60s+ with VM_DETECTED=FALSE (Already retrieved) ---');
  console.log('KEY FINDING: All have "Vodafone voicemail service" or similar in notes');
  console.log('These are REAL voicemails where AI left a 4-minute message\n');

  // 2. Not interested with connected=false analysis - use correct column name
  console.log('\n--- NOT_INTERESTED CONNECTED=FALSE DEEP DIVE ---');
  
  // Get samples with transcripts
  const niWithTranscripts = await db.execute(sql`
    SELECT 
      dca.id,
      dca.call_duration_seconds,
      dca.notes,
      cs.ai_transcript,
      cs.disposition as session_disposition
    FROM dialer_call_attempts dca
    LEFT JOIN call_sessions cs ON dca.call_session_id = cs.id
    WHERE dca.disposition = 'not_interested' 
      AND dca.connected = false
      AND dca.call_session_id IS NOT NULL
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 10
  `);
  
  console.log('\nNot_interested (connected=false) WITH session - why not connected?');
  for (const r of niWithTranscripts.rows) {
    const transcript = (r.ai_transcript as string || '').substring(0, 300);
    console.log(`\n  [${r.call_duration_seconds}s] Session disposition: ${r.session_disposition}`);
    console.log(`  Transcript: ${transcript}...`);
  }

  // Get samples WITHOUT sessions
  const niWithoutTranscripts = await db.execute(sql`
    SELECT 
      dca.id,
      dca.call_duration_seconds,
      dca.notes,
      dca.created_at
    FROM dialer_call_attempts dca
    WHERE dca.disposition = 'not_interested' 
      AND dca.connected = false
      AND dca.call_session_id IS NULL
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 10
  `);
  
  console.log('\n\nNot_interested (connected=false) WITHOUT session - how did AI submit disposition?');
  for (const r of niWithoutTranscripts.rows) {
    const notes = (r.notes as string || '').substring(0, 300);
    console.log(`\n  [${r.call_duration_seconds}s] ${r.created_at}`);
    console.log(`  Notes: ${notes || 'NO NOTES'}`);
  }

  // 3. Analyze patterns in misclassified calls
  console.log('\n\n--- PATTERN ANALYSIS ---');
  
  // Check for voicemail keywords in not_interested transcripts
  const niVoicemailPatterns = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM dialer_call_attempts dca
    LEFT JOIN call_sessions cs ON dca.call_session_id = cs.id
    WHERE dca.disposition = 'not_interested' 
      AND dca.connected = false
      AND (
        cs.ai_transcript ILIKE '%voicemail%'
        OR cs.ai_transcript ILIKE '%leave a message%'
        OR cs.ai_transcript ILIKE '%not available%'
        OR cs.ai_transcript ILIKE '%after the tone%'
        OR cs.ai_transcript ILIKE '%beep%'
        OR cs.ai_transcript ILIKE '%mailbox%'
        OR cs.ai_transcript ILIKE '%please record%'
      )
  `);
  console.log(`Not_interested that contain voicemail keywords: ${niVoicemailPatterns.rows[0]?.cnt || 0}`);

  // Check notes for voicemail patterns (since many don't have sessions)
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

  // Check for IVR patterns
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

  // 4. Breakdown by what's in the notes
  console.log('\n\n--- NOT_INTERESTED NOTES CONTENT ANALYSIS ---');
  
  const niNotesBreakdown = await db.execute(sql`
    SELECT 
      CASE 
        WHEN notes ILIKE '%voicemail%' OR notes ILIKE '%mailbox%' THEN 'Contains voicemail'
        WHEN notes ILIKE '%not available%' OR notes ILIKE '%unavailable%' THEN 'Contains unavailable'
        WHEN notes ILIKE '%press%' OR notes ILIKE '%extension%' THEN 'Contains IVR'
        WHEN notes ILIKE '%wrong number%' OR notes ILIKE '%wrong person%' THEN 'Wrong number'
        WHEN notes ILIKE '%goodbye%' OR notes ILIKE '%bye%' THEN 'Contains goodbye'
        WHEN notes IS NULL OR notes = '' THEN 'NO NOTES'
        ELSE 'Other content'
      END as notes_category,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'not_interested' AND connected = false
    GROUP BY notes_category
    ORDER BY cnt DESC
  `);
  
  console.log('Notes content breakdown:');
  for (const r of niNotesBreakdown.rows) {
    console.log(`  ${r.notes_category}: ${r.cnt}`);
  }

  // 5. Check voicemail disposition - why voicemail_detected is false for most
  console.log('\n\n--- VOICEMAIL_DETECTED FLAG ANALYSIS ---');
  
  const vmDetectedAnalysis = await db.execute(sql`
    SELECT 
      voicemail_detected,
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN '0s'
        WHEN call_duration_seconds < 10 THEN '1-9s'
        WHEN call_duration_seconds < 30 THEN '10-29s'
        WHEN call_duration_seconds < 60 THEN '30-59s'
        ELSE '60s+'
      END as duration_bucket,
      CASE WHEN call_session_id IS NOT NULL THEN 'Has session' ELSE 'No session' END as has_session,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'voicemail'
    GROUP BY voicemail_detected, duration_bucket, has_session
    ORDER BY voicemail_detected DESC, cnt DESC
  `);
  
  console.log('Voicemail disposition breakdown:');
  console.log('VM_Detected | Duration | Session | Count');
  console.log('-'.repeat(50));
  for (const r of vmDetectedAnalysis.rows) {
    console.log(`${String(r.voicemail_detected).padEnd(11)} | ${String(r.duration_bucket).padEnd(8)} | ${String(r.has_session).padEnd(11)} | ${r.cnt}`);
  }

  // 6. Sample voicemail notes to understand the pattern
  console.log('\n\n--- VOICEMAIL NOTES SAMPLES ---');
  
  const vmNotesSamples = await db.execute(sql`
    SELECT 
      voicemail_detected,
      call_duration_seconds,
      LEFT(notes, 400) as notes_preview
    FROM dialer_call_attempts
    WHERE disposition = 'voicemail'
      AND voicemail_detected = false
      AND call_duration_seconds >= 30
    ORDER BY RANDOM()
    LIMIT 5
  `);
  
  console.log('Random samples of voicemail (VM_detected=false, 30s+):');
  for (const r of vmNotesSamples.rows) {
    console.log(`\n  [${r.call_duration_seconds}s] VM_detected: ${r.voicemail_detected}`);
    console.log(`  ${r.notes_preview}...`);
  }

  // 7. Check what sets voicemail_detected=true
  console.log('\n\n--- WHAT SETS VOICEMAIL_DETECTED=TRUE? ---');
  
  const vmTrueSamples = await db.execute(sql`
    SELECT 
      call_duration_seconds,
      LEFT(notes, 400) as notes_preview
    FROM dialer_call_attempts
    WHERE disposition = 'voicemail'
      AND voicemail_detected = true
    ORDER BY call_duration_seconds DESC
    LIMIT 5
  `);
  
  console.log('Samples where voicemail_detected=TRUE:');
  for (const r of vmTrueSamples.rows) {
    console.log(`\n  [${r.call_duration_seconds}s]`);
    console.log(`  ${r.notes_preview}...`);
  }

  process.exit(0);
}

deepVoicemailAnalysis();
