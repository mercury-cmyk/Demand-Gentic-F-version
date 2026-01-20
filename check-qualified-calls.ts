import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkQualifiedCalls() {
  console.log('=== Searching for Potentially Qualified Calls ===\n');

  // Check notes for qualified mentions
  const qualified = await pool.query(`
    SELECT id, contact_id, disposition, duration_seconds, notes, created_at
    FROM dialer_call_attempts
    WHERE notes ILIKE '%qualified%' 
       OR notes ILIKE '%lead%'
       OR notes ILIKE '%handoff%'
       OR notes ILIKE '%interested%'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  
  console.log(`Calls with qualified/lead/handoff/interested in notes: ${qualified.rowCount}`);
  for (const r of qualified.rows) {
    console.log('  ID:', r.id, '| Disp:', r.disposition, '| Dur:', r.duration_seconds, 's |', r.created_at);
    console.log('    Notes:', (r.notes || '').substring(0, 200));
  }
  
  // Check connected calls over 60 seconds (likely had conversation)
  const longCalls = await pool.query(`
    SELECT id, contact_id, disposition, duration_seconds, notes, created_at
    FROM dialer_call_attempts
    WHERE duration_seconds > 60
    ORDER BY duration_seconds DESC
    LIMIT 15
  `);
  
  console.log(`\n\nLong calls (>60s): ${longCalls.rowCount}`);
  for (const r of longCalls.rows) {
    console.log('  ID:', r.id, '| Disp:', r.disposition, '| Dur:', r.duration_seconds, 's');
    console.log('    Notes:', (r.notes || '').substring(0, 200));
  }

  // Check if any leads exist at all
  const leadsCount = await pool.query(`
    SELECT COUNT(*) as count FROM leads
  `);
  console.log(`\n\nTotal leads in database: ${leadsCount.rows[0].count}`);

  // Check recent leads
  const recentLeads = await pool.query(`
    SELECT id, contact_id, call_attempt_id, status, created_at
    FROM leads
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log(`\nRecent leads: ${recentLeads.rowCount}`);
  for (const r of recentLeads.rows) {
    console.log('  Lead', r.id, '| Contact:', r.contact_id, '| CallAttempt:', r.call_attempt_id, '| Status:', r.status, '|', r.created_at);
  }

  await pool.end();
}

checkQualifiedCalls().catch(console.error);
