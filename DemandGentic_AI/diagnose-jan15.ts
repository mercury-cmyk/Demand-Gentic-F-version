import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function diagnoseJan15() {
  console.log('========================================');
  console.log('DIAGNOSE JAN 15 MISSING CALL SESSIONS');
  console.log('========================================\n');

  // Check when call_sessions were last created
  const lastSessions = await db.execute(sql`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as count
    FROM call_sessions
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) DESC
    LIMIT 10
  `);

  console.log('Recent Call Sessions by Date:');
  console.log('-----------------------------');
  for (const row of lastSessions.rows) {
    const r = row as any;
    console.log(`  ${r.date}: ${r.count}`);
  }

  // Check if there are any call_sessions at all
  const totalSessions = await db.execute(sql`
    SELECT COUNT(*) as total FROM call_sessions
  `);
  console.log(`\nTotal call_sessions in DB: ${(totalSessions.rows[0] as any)?.total}`);

  // Check latest call_session timestamp
  const latestSession = await db.execute(sql`
    SELECT created_at FROM call_sessions ORDER BY created_at DESC LIMIT 1
  `);
  if (latestSession.rows.length > 0) {
    console.log(`Latest call_session: ${(latestSession.rows[0] as any)?.created_at}`);
  }

  // Check dialer_call_attempts by date
  const attemptsByDate = await db.execute(sql`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as count
    FROM dialer_call_attempts
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) DESC
    LIMIT 10
  `);

  console.log('\nDialer Call Attempts by Date:');
  console.log('-----------------------------');
  for (const row of attemptsByDate.rows) {
    const r = row as any;
    console.log(`  ${r.date}: ${r.count}`);
  }

  // Check Jan 15 attempts with more detail - are calls actually connecting?
  const jan15Details = await db.execute(sql`
    SELECT
      connected,
      voicemail_detected,
      call_duration_seconds IS NOT NULL as has_duration,
      call_ended_at IS NOT NULL as has_end_time,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
    GROUP BY connected, voicemail_detected, call_duration_seconds IS NOT NULL, call_ended_at IS NOT NULL
    ORDER BY count DESC
  `);

  console.log('\nJan 15 Call Attempt Details:');
  console.log('----------------------------');
  for (const row of jan15Details.rows) {
    const r = row as any;
    console.log(`  connected=${r.connected}, voicemail=${r.voicemail_detected}, has_duration=${r.has_duration}, has_end=${r.has_end_time}: ${r.count}`);
  }

  // Check if any Jan 15 calls have call_session_id set
  const jan15WithSessions = await db.execute(sql`
    SELECT
      call_session_id IS NOT NULL as has_session,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
    GROUP BY call_session_id IS NOT NULL
  `);

  console.log('\nJan 15 Attempts with call_session_id:');
  console.log('-------------------------------------');
  for (const row of jan15WithSessions.rows) {
    const r = row as any;
    console.log(`  has_session=${r.has_session}: ${r.count}`);
  }

  // Check the 1 qualified_lead from Jan 15
  const qualifiedLead = await db.execute(sql`
    SELECT
      dca.*,
      c.first_name,
      c.last_name,
      c.email
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.disposition = 'qualified_lead'
    LIMIT 5
  `);

  console.log('\nJan 15 Qualified Lead Details:');
  console.log('------------------------------');
  for (const row of qualifiedLead.rows) {
    const r = row as any;
    console.log(`  Name: ${r.first_name} ${r.last_name}`);
    console.log(`  Email: ${r.email}`);
    console.log(`  Duration: ${r.call_duration_seconds}s`);
    console.log(`  Connected: ${r.connected}`);
    console.log(`  Call Session ID: ${r.call_session_id || 'NULL'}`);
    console.log(`  Notes: ${r.notes?.substring(0, 200) || 'NULL'}`);
  }

  // Check the 2 not_interested from Jan 15
  const notInterested = await db.execute(sql`
    SELECT
      dca.*,
      c.first_name,
      c.last_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.disposition = 'not_interested'
  `);

  console.log('\nJan 15 Not Interested Details:');
  console.log('------------------------------');
  for (const row of notInterested.rows) {
    const r = row as any;
    console.log(`  Name: ${r.first_name} ${r.last_name}`);
    console.log(`  Duration: ${r.call_duration_seconds}s`);
    console.log(`  Call Session ID: ${r.call_session_id || 'NULL'}`);
  }

  process.exit(0);
}

diagnoseJan15().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});