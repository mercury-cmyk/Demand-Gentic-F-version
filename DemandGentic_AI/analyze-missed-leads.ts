/**
 * Deep Analysis: Find Missed Qualified Leads
 * 
 * Checks multiple signals to identify calls that should have been qualified:
 * 1. Positive notes but not qualified_lead disposition
 * 2. Long connected calls that weren't qualified
 * 3. AI marked positive but call attempt has different disposition
 * 4. Transcript signals indicating interest
 */

import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function analyze() {
  console.log('=== Deep Analysis: Finding Missed Qualified Leads ===\n');

  // 1. Calls with positive notes but NOT qualified_lead disposition
  const positiveNotes = await pool.query(`
    SELECT dca.id, dca.contact_id, dca.disposition, dca.call_duration_seconds, 
           dca.notes, dca.created_at, cs.ai_disposition, cs.ai_analysis
    FROM dialer_call_attempts dca
    LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE dca.disposition != 'qualified_lead'
      AND (
        dca.notes ILIKE '%interested%'
        OR dca.notes ILIKE '%qualified%'
        OR dca.notes ILIKE '%meeting%'
        OR dca.notes ILIKE '%callback%'
        OR dca.notes ILIKE '%follow up%'
        OR dca.notes ILIKE '%send info%'
        OR dca.notes ILIKE '%demo%'
        OR cs.ai_analysis::text ILIKE '%interested%'
        OR cs.ai_analysis::text ILIKE '%qualified%'
      )
    ORDER BY dca.created_at DESC
    LIMIT 20
  `);
  
  console.log('1. Calls with positive signals but NOT qualified_lead:');
  console.log('   Count:', positiveNotes.rowCount);
  for (const r of positiveNotes.rows) {
    console.log(`   ID: ${r.id} | Disp: ${r.disposition} | AI: ${r.ai_disposition || 'n/a'} | Dur: ${r.call_duration_seconds}s`);
    console.log(`      Notes: ${(r.notes || '').substring(0, 150)}`);
  }

  // 2. Long connected calls (>45s) that are NOT qualified
  const longNotQualified = await pool.query(`
    SELECT dca.id, dca.contact_id, dca.disposition, dca.call_duration_seconds,
           dca.notes, dca.connected, cs.ai_disposition, cs.ai_transcript
    FROM dialer_call_attempts dca
    LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE dca.call_duration_seconds > 45
      AND dca.disposition NOT IN ('qualified_lead', 'voicemail')
      AND dca.connected = true
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 15
  `);

  console.log('\n2. Long connected calls (>45s) NOT qualified:');
  console.log('   Count:', longNotQualified.rowCount);
  for (const r of longNotQualified.rows) {
    console.log(`   ID: ${r.id} | Disp: ${r.disposition} | AI: ${r.ai_disposition || 'n/a'} | Dur: ${r.call_duration_seconds}s | Connected: ${r.connected}`);
    const transcript = (r.ai_transcript || '').substring(0, 200);
    if (transcript) console.log(`      Transcript: ${transcript}...`);
  }

  // 3. AI sessions marked as Meeting Booked or positive but call attempt has different disposition
  const aiMismatch = await pool.query(`
    SELECT cs.id as session_id, cs.ai_disposition, cs.ai_analysis,
           dca.id as attempt_id, dca.disposition as attempt_disp,
           dca.call_duration_seconds, cs.started_at
    FROM call_sessions cs
    JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    WHERE cs.ai_disposition IN ('qualified_lead', 'Qualified Lead', 'Meeting Booked', 'Callback Requested')
      AND dca.disposition != 'qualified_lead'
    ORDER BY cs.started_at DESC
    LIMIT 15
  `);

  console.log('\n3. AI marked positive but call attempt has different disposition:');
  console.log('   Count:', aiMismatch.rowCount);
  for (const r of aiMismatch.rows) {
    console.log(`   Session: ${r.session_id} | AI: ${r.ai_disposition} | Attempt: ${r.attempt_disp} | Dur: ${r.call_duration_seconds}s`);
  }

  // 4. Check transcripts for interest signals
  const transcriptSignals = await pool.query(`
    SELECT dca.id, dca.disposition, dca.call_duration_seconds, 
           cs.ai_transcript, cs.ai_disposition
    FROM dialer_call_attempts dca
    JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE dca.disposition NOT IN ('qualified_lead')
      AND cs.ai_transcript IS NOT NULL
      AND (
        cs.ai_transcript ILIKE '%yes%send%'
        OR cs.ai_transcript ILIKE '%interested%'
        OR cs.ai_transcript ILIKE '%tell me more%'
        OR cs.ai_transcript ILIKE '%sounds good%'
        OR cs.ai_transcript ILIKE '%call me back%'
        OR cs.ai_transcript ILIKE '%email me%'
      )
    ORDER BY dca.created_at DESC
    LIMIT 15
  `);

  console.log('\n4. Transcripts with interest signals but NOT qualified:');
  console.log('   Count:', transcriptSignals.rowCount);
  for (const r of transcriptSignals.rows) {
    console.log(`   ID: ${r.id} | Disp: ${r.disposition} | AI: ${r.ai_disposition} | Dur: ${r.call_duration_seconds}s`);
    console.log(`      Transcript excerpt: ${(r.ai_transcript || '').substring(0, 200)}...`);
  }

  // 5. Summary stats
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total_attempts,
      COUNT(*) FILTER (WHERE disposition = 'qualified_lead') as qualified,
      COUNT(*) FILTER (WHERE disposition = 'not_interested') as not_interested,
      COUNT(*) FILTER (WHERE disposition = 'voicemail') as voicemail,
      COUNT(*) FILTER (WHERE disposition = 'no_answer') as no_answer,
      COUNT(*) FILTER (WHERE connected = true) as connected_calls,
      COUNT(*) FILTER (WHERE call_duration_seconds > 30) as calls_over_30s,
      COUNT(*) FILTER (WHERE call_duration_seconds > 60) as calls_over_60s
    FROM dialer_call_attempts
  `);

  console.log('\n5. Overall Stats:');
  const s = stats.rows[0];
  console.log(`   Total attempts: ${s.total_attempts}`);
  console.log(`   Qualified: ${s.qualified}`);
  console.log(`   Not Interested: ${s.not_interested}`);
  console.log(`   Voicemail: ${s.voicemail}`);
  console.log(`   No Answer: ${s.no_answer}`);
  console.log(`   Connected calls: ${s.connected_calls}`);
  console.log(`   Calls >30s: ${s.calls_over_30s}`);
  console.log(`   Calls >60s: ${s.calls_over_60s}`);

  // 6. Leads table check
  const leadsStats = await pool.query(`
    SELECT 
      COUNT(*) as total_leads,
      COUNT(*) FILTER (WHERE call_attempt_id IS NOT NULL) as with_call_attempt,
      COUNT(*) FILTER (WHERE call_attempt_id IS NULL) as without_call_attempt
    FROM leads
  `);

  console.log('\n6. Leads Table:');
  const ls = leadsStats.rows[0];
  console.log(`   Total leads: ${ls.total_leads}`);
  console.log(`   With call_attempt_id: ${ls.with_call_attempt}`);
  console.log(`   Without call_attempt_id: ${ls.without_call_attempt}`);

  await pool.end();
}

analyze().catch(console.error);