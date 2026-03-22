/**
 * Check all QA-related counts across leads, call_sessions, and dialer_call_attempts
 * to find where the 115 "new" leads are.
 */
import { pool } from '../server/db';

async function check() {
  const c = await pool.connect();
  try {
    // Check leads table
    const r1 = await c.query(`
      SELECT qa_status, COUNT(*) as cnt, 
             COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active
      FROM leads 
      GROUP BY qa_status 
      ORDER BY cnt DESC
    `);
    console.log('=== LEADS TABLE by qa_status ===');
    let totalActive = 0;
    for (const row of r1.rows) {
      console.log(`  ${(row.qa_status||'null').padEnd(20)} total: ${String(row.cnt).padStart(4)}  active: ${String(row.active).padStart(4)}`);
      totalActive += parseInt(row.active);
    }
    console.log(`  TOTAL active: ${totalActive}`);

    // Check call_sessions without leads
    const r2 = await c.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN l.id IS NULL THEN 1 END) as no_lead
      FROM call_sessions cs
      LEFT JOIN leads l ON l.telnyx_call_id = cs.telnyx_call_id
      WHERE cs.ai_disposition IS NOT NULL
    `);
    console.log('\n=== CALL SESSIONS with disposition but no lead ===');
    console.log('  Total sessions with disposition:', r2.rows[0].total);
    console.log('  Sessions without a lead record:', r2.rows[0].no_lead);

    // Check dialer_call_attempts without leads
    const r3 = await c.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN l.id IS NULL THEN 1 END) as no_lead
      FROM dialer_call_attempts dca
      LEFT JOIN leads l ON l.call_attempt_id = dca.id
      WHERE dca.status = 'completed'
    `);
    console.log('\n=== DIALER CALL ATTEMPTS completed but no lead ===');
    console.log('  Total completed attempts:', r3.rows[0].total);
    console.log('  Attempts without a lead record:', r3.rows[0].no_lead);

    // Check if there's a different "new" concept in call_sessions
    const r4 = await c.query(`
      SELECT cs.status, COUNT(*) as cnt
      FROM call_sessions cs
      GROUP BY cs.status
      ORDER BY cnt DESC
    `);
    console.log('\n=== CALL SESSIONS by status ===');
    for (const row of r4.rows) {
      console.log(`  ${(row.status||'null').padEnd(20)} ${row.cnt}`);
    }

    // Check QA-specific: leads that show in QA page (new + under_review)
    const r5 = await c.query(`
      SELECT COUNT(*) as cnt
      FROM leads 
      WHERE qa_status IN ('new', 'under_review')
        AND deleted_at IS NULL
    `);
    console.log('\n=== QA PENDING (new + under_review, active) ===');
    console.log('  Count:', r5.rows[0].cnt);

    // Check if "New" in the UI actually maps to a different field or includes more statuses
    const r6 = await c.query(`
      SELECT qa_status, ai_qualification_status, COUNT(*) as cnt
      FROM leads
      WHERE deleted_at IS NULL
      GROUP BY qa_status, ai_qualification_status
      ORDER BY cnt DESC
    `);
    console.log('\n=== LEADS by qa_status + ai_qualification_status ===');
    for (const row of r6.rows) {
      console.log(`  ${(row.qa_status||'null').padEnd(20)} ${(row.ai_qualification_status||'null').padEnd(20)} ${row.cnt}`);
    }

    // Total active leads count
    const r7 = await c.query(`SELECT COUNT(*) as cnt FROM leads WHERE deleted_at IS NULL`);
    console.log('\n=== TOTAL ACTIVE LEADS ===');
    console.log('  Count:', r7.rows[0].cnt);

  } finally {
    c.release();
    await pool.end();
  }
}
check().catch(e => { console.error(e); process.exit(1); });