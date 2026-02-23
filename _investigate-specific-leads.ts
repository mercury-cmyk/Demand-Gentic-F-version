import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function main() {
  const emails = [
    'denise.madrigale@esis.com',
    'eschafer@pauldavis.com',
    'jsteele@incomm.com',
    'evan.langweiler@nbcuni.com',
    'shelley.risk@helloheart.com',
    'mika.javanainen@m-files.com',
    'dfernald@jpshealth.org',
    'molly.mcevily@ventasreit.com',
    'razar@symplr.com',
    'steve.elkhatib@heritage-enviro.com',
    'chris.bailey@innovasolutions.com',
    'edia@wohlsen.com',
    'chris.toppin@aarcorp.com',
    'avirothkopf@tupperware.com',
    'c.hodgson@heathus.com'
  ];

  // First get the leads table columns
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='leads' ORDER BY ordinal_position`);
  console.log('LEADS COLUMNS:', cols.rows.map(r => r.column_name).join(', '));

  // Get full lead details with call session data
  const result = await pool.query(
    `SELECT 
      l.id as lead_id,
      l.contact_name,
      l.contact_email,
      l.account_name as company_name,
      l.qa_status,
      l.call_duration,
      l.created_at as lead_created,
      l.call_attempt_id,
      l.notes,
      dca.id as attempt_id,
      dca.call_duration_seconds as attempt_duration,
      dca.disposition as attempt_disposition,
      dca.call_session_id,
      cs.started_at as call_started,
      cs.ended_at as call_ended,
      cs.id as session_id,
      cs.duration_sec as session_duration,
      cs.ai_disposition,
      cs.ai_transcript,
      cs.recording_url
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE l.contact_email = ANY($1)
      AND l.created_at >= '2026-02-23'::date
    ORDER BY l.created_at DESC`,
    [emails]
  );

  console.log('LEADS FOUND:', result.rows.length);
  console.log('='.repeat(100));

  for (const r of result.rows) {
    const transcript = (r.ai_transcript || 'NONE').replace(/\n/g, ' ');
    // Count turns
    const agentTurns = (transcript.match(/\[Agent\]/gi) || []).length;
    const contactTurns = (transcript.match(/\[Contact\]/gi) || []).length;
    
    console.log(`\nLEAD: ${r.contact_name} (${r.contact_email})`);
    console.log(`  Company: ${r.company_name || 'N/A'}`);
    console.log(`  Lead ID: ${r.lead_id}`);
    console.log(`  QA Status: ${r.qa_status}`);
    console.log(`  Lead call_duration: ${r.call_duration}`);
    console.log(`  Attempt ID: ${r.attempt_id}`);
    console.log(`  Attempt Duration: ${r.attempt_duration}s`);
    console.log(`  Attempt Disposition: ${r.attempt_disposition}`);
    console.log(`  Session ID: ${r.session_id}`);
    console.log(`  Session Duration: ${r.session_duration}s`);
    console.log(`  AI Disposition: ${r.ai_disposition}`);
    console.log(`  Recording: ${r.recording_url ? 'YES' : 'NONE'}`);
    console.log(`  Call Started: ${r.call_started}`);
    console.log(`  Call Ended: ${r.call_ended}`);
    console.log(`  Turns: ${agentTurns} agent, ${contactTurns} contact`);
    console.log(`  Notes: ${(r.notes || 'NONE').substring(0, 200)}`);
    console.log(`  Transcript (first 500): ${transcript.substring(0, 500)}`);
    console.log('-'.repeat(100));
  }

  // Also check: How many more leads were created today with short durations?
  const todayLeads = await pool.query(`
    SELECT 
      l.contact_name,
      l.contact_email,
      l.qa_status,
      COALESCE(cs.duration_sec, dca.call_duration_seconds, l.call_duration) as effective_duration,
      cs.ai_disposition,
      l.created_at
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE l.created_at >= '2026-02-23'::date
    ORDER BY COALESCE(cs.duration_sec, dca.call_duration_seconds, l.call_duration) ASC NULLS FIRST
  `);

  console.log('\n\n' + '='.repeat(100));
  console.log('ALL LEADS CREATED TODAY:');
  console.log('='.repeat(100));
  for (const r of todayLeads.rows) {
    const flag = (r.effective_duration === null || r.effective_duration < 45) ? '❌ FALSE' : '✅ OK';
    console.log(`  ${flag} | ${r.effective_duration || 'NULL'}s | ${r.qa_status} | ${r.ai_disposition || 'N/A'} | ${r.contact_name} (${r.contact_email})`);
  }
  console.log(`\nTotal leads today: ${todayLeads.rows.length}`);

  // Check which code path created these leads
  const creationCheck = await pool.query(`
    SELECT 
      l.id,
      l.contact_name,
      l.contact_email,
      l.notes,
      l.call_attempt_id,
      dca.disposition,
      dca.call_session_id IS NOT NULL as has_session,
      cs.ai_disposition
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE l.contact_email = ANY($1)
      AND l.created_at >= '2026-02-23'::date
  `, [emails]);

  console.log('\n\n' + '='.repeat(100));
  console.log('LEAD CREATION SOURCE ANALYSIS:');
  console.log('='.repeat(100));
  for (const r of creationCheck.rows) {
    console.log(`  ${r.contact_name} | Attempt Disp: ${r.disposition || 'N/A'} | AI Disp: ${r.ai_disposition || 'N/A'} | Has Session: ${r.has_session} | Notes: ${(r.notes || 'NONE').substring(0, 200)}`);
  }

  await pool.end();
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
