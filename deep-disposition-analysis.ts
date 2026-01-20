import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function deepAnalysis() {
  console.log('=== DEEP DISPOSITION ANALYSIS ===\n');

  // 1. NO_ANSWER (5471 calls)
  console.log('--- NO_ANSWER (5471 calls) ---');
  const noAnswer = await db.execute(sql`
    SELECT 
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN '0s (never connected)'
        WHEN call_duration_seconds < 5 THEN '1-4s (quick hangup)'
        WHEN call_duration_seconds < 15 THEN '5-14s (rang, no pickup)'
        WHEN call_duration_seconds < 30 THEN '15-29s (long ring)'
        ELSE '30s+ (connected but no response)'
      END as duration_bucket,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'no_answer'
    GROUP BY duration_bucket
    ORDER BY cnt DESC
  `);
  for (const r of noAnswer.rows) {
    console.log(`  ${r.duration_bucket}: ${r.cnt}`);
  }

  // Check notes for no_answer
  const noAnswerNotes = await db.execute(sql`
    SELECT notes, COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'no_answer' AND notes IS NOT NULL AND notes != ''
    GROUP BY notes
    ORDER BY cnt DESC
    LIMIT 5
  `);
  if (noAnswerNotes.rows.length > 0) {
    console.log('\n  Top notes:');
    for (const r of noAnswerNotes.rows) {
      console.log(`    [${r.cnt}] ${(r.notes as string).substring(0, 100)}...`);
    }
  }

  // 2. NULL disposition (3807 calls)
  console.log('\n--- NULL DISPOSITION (3807 calls) ---');
  const nullDisp = await db.execute(sql`
    SELECT 
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN '0s (call never started)'
        WHEN call_duration_seconds < 5 THEN '1-4s'
        WHEN call_duration_seconds < 15 THEN '5-14s'
        WHEN call_duration_seconds < 30 THEN '15-29s'
        ELSE '30s+'
      END as duration_bucket,
      CASE WHEN call_started_at IS NULL THEN 'Never started' ELSE 'Started' END as started,
      CASE WHEN call_ended_at IS NULL THEN 'Never ended' ELSE 'Ended' END as ended,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition IS NULL
    GROUP BY duration_bucket, started, ended
    ORDER BY cnt DESC
  `);
  for (const r of nullDisp.rows) {
    console.log(`  ${r.duration_bucket} | ${r.started} | ${r.ended}: ${r.cnt}`);
  }

  // Check if NULL ones have call_session_id
  const nullSession = await db.execute(sql`
    SELECT 
      CASE WHEN call_session_id IS NULL THEN 'No session' ELSE 'Has session' END as has_session,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition IS NULL
    GROUP BY has_session
  `);
  console.log('\n  Session status:');
  for (const r of nullSession.rows) {
    console.log(`    ${r.has_session}: ${r.cnt}`);
  }

  // 3. INVALID_DATA (3471 calls)
  console.log('\n--- INVALID_DATA (3471 calls) ---');
  const invalidData = await db.execute(sql`
    SELECT 
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN '0s (blocked pre-dial)'
        WHEN call_duration_seconds < 5 THEN '1-4s (SIP/connection failure)'
        WHEN call_duration_seconds < 15 THEN '5-14s (quick interaction)'
        ELSE '15s+ (conversation happened)'
      END as duration_bucket,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'invalid_data'
    GROUP BY duration_bucket
    ORDER BY cnt DESC
  `);
  for (const r of invalidData.rows) {
    console.log(`  ${r.duration_bucket}: ${r.cnt}`);
  }

  // 4. VOICEMAIL (1200 calls)
  console.log('\n--- VOICEMAIL (1200 calls) ---');
  const voicemail = await db.execute(sql`
    SELECT 
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN '0s'
        WHEN call_duration_seconds < 10 THEN '1-9s (quick VM detection)'
        WHEN call_duration_seconds < 30 THEN '10-29s (left message?)'
        WHEN call_duration_seconds < 60 THEN '30-59s (full message)'
        ELSE '60s+ (long message)'
      END as duration_bucket,
      voicemail_detected,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'voicemail'
    GROUP BY duration_bucket, voicemail_detected
    ORDER BY cnt DESC
  `);
  for (const r of voicemail.rows) {
    console.log(`  ${r.duration_bucket} | VM detected: ${r.voicemail_detected}: ${r.cnt}`);
  }

  // 5. NOT_INTERESTED (1032 calls with connected=false)
  console.log('\n--- NOT_INTERESTED connected=false (1032 calls) ---');
  const notInterested = await db.execute(sql`
    SELECT 
      CASE 
        WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN '0s'
        WHEN call_duration_seconds < 10 THEN '1-9s (quick rejection)'
        WHEN call_duration_seconds < 30 THEN '10-29s (brief convo)'
        WHEN call_duration_seconds < 60 THEN '30-59s (engaged convo)'
        ELSE '60s+ (full conversation)'
      END as duration_bucket,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'not_interested' AND connected = false
    GROUP BY duration_bucket
    ORDER BY cnt DESC
  `);
  for (const r of notInterested.rows) {
    console.log(`  ${r.duration_bucket}: ${r.cnt}`);
  }

  // Check why not_interested has connected=false
  const niHumanCheck = await db.execute(sql`
    SELECT 
      CASE WHEN call_session_id IS NOT NULL THEN 'Has transcript session' ELSE 'No transcript' END as has_transcript,
      COUNT(*) as cnt
    FROM dialer_call_attempts
    WHERE disposition = 'not_interested' AND connected = false
    GROUP BY has_transcript
  `);
  console.log('\n  Transcript status:');
  for (const r of niHumanCheck.rows) {
    console.log(`    ${r.has_transcript}: ${r.cnt}`);
  }

  // Sample some not_interested with connected=false to see why
  const niSamples = await db.execute(sql`
    SELECT notes, call_duration_seconds
    FROM dialer_call_attempts
    WHERE disposition = 'not_interested' AND connected = false AND notes IS NOT NULL
    ORDER BY call_duration_seconds DESC
    LIMIT 3
  `);
  if (niSamples.rows.length > 0) {
    console.log('\n  Sample notes (longest calls):');
    for (const r of niSamples.rows) {
      console.log(`    [${r.call_duration_seconds}s] ${(r.notes as string).substring(0, 150)}...`);
    }
  }

  process.exit(0);
}

deepAnalysis();
