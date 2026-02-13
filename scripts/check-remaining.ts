import { pool } from '../server/db';
async function main() {
  const c = await pool.connect();
  try {
    const r = await c.query(`
      SELECT l.qa_status, COUNT(*) as unscored
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND l.transcript IS NOT NULL AND l.transcript != ''
        AND NOT EXISTS (
          SELECT 1 FROM call_sessions cs
          JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
          WHERE cs.telnyx_call_id = l.telnyx_call_id
        )
      GROUP BY l.qa_status ORDER BY unscored DESC
    `);
    let total = 0;
    for (const row of r.rows) { total += parseInt(row.unscored); console.log(row.qa_status + ': ' + row.unscored); }
    console.log('TOTAL unscored with transcripts: ' + total);
  } finally { c.release(); await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
