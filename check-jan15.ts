import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkJan15() {
  console.log('========================================');
  console.log('JANUARY 15, 2026 CALLS ANALYSIS');
  console.log('========================================\n');

  // Check dialer_call_attempts for Jan 15
  const attempts = await db.execute(sql`
    SELECT
      disposition,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
    GROUP BY disposition
    ORDER BY count DESC
  `);

  console.log('Dialer Call Attempts (Jan 15):');
  console.log('------------------------------');
  let totalAttempts = 0;
  for (const row of attempts.rows) {
    const r = row as any;
    totalAttempts += parseInt(r.count);
    console.log(`  disposition=${r.disposition || 'NULL'}: ${r.count}`);
  }
  console.log(`  TOTAL: ${totalAttempts}`);

  // Check call_sessions for Jan 15
  const sessions = await db.execute(sql`
    SELECT
      ai_disposition,
      COUNT(*) as count
    FROM call_sessions
    WHERE created_at::date = '2026-01-15'
    GROUP BY ai_disposition
    ORDER BY count DESC
  `);

  console.log('\nCall Sessions (Jan 15):');
  console.log('-----------------------');
  let totalSessions = 0;
  for (const row of sessions.rows) {
    const r = row as any;
    totalSessions += parseInt(r.count);
    console.log(`  ai_disposition=${r.ai_disposition || 'NULL'}: ${r.count}`);
  }
  console.log(`  TOTAL: ${totalSessions}`);

  // Check high-value dispositions on Jan 15
  const highValue = await db.execute(sql`
    SELECT
      cs.ai_disposition,
      cs.created_at,
      cs.contact_id,
      cs.ai_transcript,
      c.first_name,
      c.last_name,
      c.email,
      a.name as company
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE cs.created_at::date = '2026-01-15'
      AND cs.ai_disposition IN ('Meeting Booked', 'Qualified Lead', 'Callback Requested', 'Not Interested')
    ORDER BY cs.created_at DESC
  `);

  console.log('\nHigh-Value Calls on Jan 15:');
  console.log('---------------------------');
  if (highValue.rows.length === 0) {
    console.log('  None found');
  } else {
    for (const row of highValue.rows) {
      const r = row as any;
      const time = new Date(r.created_at).toISOString().split('T')[1].substring(0,8);
      console.log(`  ${time} | ${r.ai_disposition} | ${r.first_name || ''} ${r.last_name || ''} @ ${r.company || 'N/A'}`);
      if (r.email) console.log(`           Email: ${r.email}`);
    }
  }

  // Check leads created on Jan 15
  const leads = await db.execute(sql`
    SELECT
      l.id,
      l.contact_id,
      l.qa_status,
      l.created_at,
      c.first_name,
      c.last_name
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    WHERE l.created_at::date = '2026-01-15'
    ORDER BY l.created_at DESC
  `);

  console.log('\nLeads Created on Jan 15:');
  console.log('------------------------');
  console.log(`  Total: ${leads.rows.length}`);
  for (const row of leads.rows) {
    const r = row as any;
    console.log(`  - ${r.first_name || ''} ${r.last_name || ''} (qa_status=${r.qa_status || 'NULL'})`);
  }

  // Check campaign_queue updates on Jan 15
  const queueUpdates = await db.execute(sql`
    SELECT
      status,
      removed_reason,
      COUNT(*) as count
    FROM campaign_queue
    WHERE updated_at::date = '2026-01-15'
    GROUP BY status, removed_reason
    ORDER BY count DESC
  `);

  console.log('\nCampaign Queue Updates (Jan 15):');
  console.log('--------------------------------');
  for (const row of queueUpdates.rows) {
    const r = row as any;
    console.log(`  status=${r.status || 'NULL'} / reason=${r.removed_reason || 'NULL'}: ${r.count}`);
  }

  // Sample some actual call attempts from Jan 15
  const sampleAttempts = await db.execute(sql`
    SELECT
      dca.id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.connected,
      dca.voicemail_detected,
      dca.created_at,
      c.first_name,
      c.last_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at::date = '2026-01-15'
    ORDER BY dca.created_at DESC
    LIMIT 20
  `);

  console.log('\nSample Call Attempts (Jan 15):');
  console.log('------------------------------');
  for (const row of sampleAttempts.rows) {
    const r = row as any;
    const time = new Date(r.created_at).toISOString().split('T')[1].substring(0,8);
    console.log(`  ${time} | ${r.first_name || 'Unknown'} ${r.last_name || ''} | disp=${r.disposition || 'NULL'} | duration=${r.call_duration_seconds || 0}s`);
  }

  process.exit(0);
}

checkJan15().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
