import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkLeads() {
  console.log('========================================');
  console.log('QUALIFIED LEADS ANALYSIS');
  console.log('========================================\n');

  // Check qualified_lead dispositions
  const qualifiedAttempts = await db.execute(sql`
    SELECT
      dca.id,
      dca.disposition,
      dca.contact_id,
      dca.campaign_id,
      dca.call_duration_seconds,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.direct_phone_e164
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.disposition = 'qualified_lead'
    ORDER BY dca.created_at DESC
    LIMIT 20
  `);

  console.log('Qualified Lead Dispositions (All Time):');
  console.log('----------------------------------------');
  if (qualifiedAttempts.rows.length === 0) {
    console.log('  NO QUALIFIED LEADS FOUND IN dialer_call_attempts');
  } else {
    for (const row of qualifiedAttempts.rows) {
      const r = row as any;
      const date = r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : 'N/A';
      console.log(`  ${date} | ${r.first_name || 'Unknown'} ${r.last_name || ''} | duration=${r.call_duration_seconds || 0}s`);
    }
  }

  // Check total leads in table
  const totalLeads = await db.execute(sql`
    SELECT COUNT(*) as total FROM leads
  `);
  console.log(`\nTotal leads in leads table: ${(totalLeads.rows[0] as any)?.total}`);

  // Check recent leads
  const recentLeads = await db.execute(sql`
    SELECT
      id,
      contact_id,
      campaign_id,
      qa_status,
      created_at
    FROM leads
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('\nMost Recent Leads:');
  console.log('------------------');
  if (recentLeads.rows.length === 0) {
    console.log('  NO LEADS IN TABLE');
  } else {
    for (const row of recentLeads.rows) {
      const r = row as any;
      const date = r.created_at ? new Date(r.created_at).toISOString() : 'N/A';
      console.log(`  ${date} | qa_status=${r.qa_status || 'NULL'} | contact=${r.contact_id?.substring(0,8) || 'NULL'}...`);
    }
  }

  // Check disposition breakdown for calls with duration > 30s (likely conversations)
  console.log('\n\nCalls with Duration > 30 seconds (likely real conversations):');
  console.log('--------------------------------------------------------------');
  const longCalls = await db.execute(sql`
    SELECT
      disposition,
      COUNT(*) as count,
      AVG(call_duration_seconds) as avg_duration,
      MAX(call_duration_seconds) as max_duration
    FROM dialer_call_attempts
    WHERE call_duration_seconds > 30
    GROUP BY disposition
    ORDER BY count DESC
  `);

  if (longCalls.rows.length === 0) {
    console.log('  NO CALLS > 30 seconds found');
  } else {
    for (const row of longCalls.rows) {
      const r = row as any;
      console.log(`  disposition=${r.disposition || 'NULL'}: ${r.count} calls (avg ${Math.round(r.avg_duration)}s, max ${r.max_duration}s)`);
    }
  }

  // Check call_sessions for engaged calls
  console.log('\n\nCall Sessions with Transcripts (AI conversations):');
  console.log('---------------------------------------------------');
  const sessionsWithTranscripts = await db.execute(sql`
    SELECT
      ai_disposition,
      COUNT(*) as count,
      AVG(duration_sec) as avg_duration
    FROM call_sessions
    WHERE ai_transcript IS NOT NULL
      AND ai_transcript != ''
      AND LENGTH(ai_transcript) > 50
    GROUP BY ai_disposition
    ORDER BY count DESC
  `);

  if (sessionsWithTranscripts.rows.length === 0) {
    console.log('  NO SESSIONS WITH TRANSCRIPTS FOUND');
  } else {
    for (const row of sessionsWithTranscripts.rows) {
      const r = row as any;
      console.log(`  ai_disposition=${r.ai_disposition || 'NULL'}: ${r.count} sessions (avg ${Math.round(r.avg_duration || 0)}s)`);
    }
  }

  // Check ALL dispositions ever recorded
  console.log('\n\nAll Dispositions Ever Recorded:');
  console.log('--------------------------------');
  const allDispositions = await db.execute(sql`
    SELECT
      disposition,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE disposition IS NOT NULL
    GROUP BY disposition
    ORDER BY count DESC
  `);

  for (const row of allDispositions.rows) {
    const r = row as any;
    console.log(`  ${r.disposition}: ${r.count}`);
  }

  // Check not_interested calls - these had real conversations
  console.log('\n\nNot Interested Calls (had real conversations):');
  console.log('-----------------------------------------------');
  const notInterested = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.created_at,
      c.first_name,
      c.last_name,
      cs.ai_transcript
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN call_sessions cs ON cs.contact_id = dca.contact_id
    WHERE dca.disposition = 'not_interested'
    ORDER BY dca.created_at DESC
    LIMIT 5
  `);

  if (notInterested.rows.length === 0) {
    console.log('  NO not_interested calls found');
  } else {
    for (const row of notInterested.rows) {
      const r = row as any;
      const date = r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : 'N/A';
      const transcriptPreview = r.ai_transcript ? r.ai_transcript.substring(0, 100) + '...' : 'NO TRANSCRIPT';
      console.log(`  ${date} | ${r.first_name || 'Unknown'} | duration=${r.call_duration_seconds || 0}s`);
      console.log(`    Transcript: ${transcriptPreview}`);
    }
  }

  process.exit(0);
}

checkLeads().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});