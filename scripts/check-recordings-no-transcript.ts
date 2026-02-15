import { pool } from '../server/db';
(async () => {
  const c = await pool.connect();
  try {
    const r = await c.query(`
      SELECT 
        l.id, l.contact_name, l.qa_status, l.recording_url,
        l.call_duration, l.telnyx_call_id,
        CASE 
          WHEN l.notes ILIKE '%ai_agent%' THEN 'ai'
          WHEN l.notes ILIKE '%manual%' THEN 'manual'
          ELSE 'unknown'
        END as source
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND (l.transcript IS NULL OR l.transcript = '' OR LENGTH(l.transcript) < 20)
        AND l.recording_url IS NOT NULL AND l.recording_url != ''
      ORDER BY l.call_duration DESC NULLS LAST
    `);
    console.log(`${r.rows.length} leads with recording but NO transcript:\n`);
    for (const row of r.rows) {
      const dur = row.call_duration ? `${row.call_duration}s` : 'n/a';
      const rec = row.recording_url?.substring(0, 80);
      console.log(`  ${row.contact_name} | ${row.source} | qa:${row.qa_status} | dur:${dur} | ${rec}`);
    }
  } finally { c.release(); await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });
