/**
 * Quick check: all leads with qa_status='new' (including soft-deleted)
 */
import { pool } from '../server/db';

async function check() {
  const c = await pool.connect();
  try {
    const r = await c.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active,
             COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted
      FROM leads WHERE qa_status = 'new'
    `);
    console.log('All new leads:', r.rows[0]);

    const r2 = await c.query(`
      SELECT l.id, l.contact_name, l.account_name, c.name as campaign,
             l.call_duration, l.created_at::date as created,
             CASE WHEN l.transcript IS NOT NULL AND length(l.transcript) > 20 THEN 'Yes' ELSE 'No' END as has_transcript,
             l.deleted_at IS NOT NULL as is_deleted
      FROM leads l
      LEFT JOIN campaigns c ON l.campaign_id = c.id
      WHERE l.qa_status = 'new'
      ORDER BY l.deleted_at NULLS FIRST, l.created_at DESC
    `);
    console.log('\nAll leads with qa_status=new (' + r2.rows.length + '):');
    for (const row of r2.rows) {
      const del = row.is_deleted ? ' [DELETED]' : '';
      console.log('  ' + (row.contact_name||'?').padEnd(25) + ' | ' + (row.campaign||'?').substring(0,30).padEnd(32) + ' | ' + (row.created||'?') + ' | T:' + row.has_transcript + ' | ' + (row.call_duration||'?') + 's' + del);
    }
  } finally {
    c.release();
    await pool.end();
  }
}
check().catch(e => { console.error(e); process.exit(1); });
