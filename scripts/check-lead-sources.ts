import { pool } from '../server/db';
(async () => {
  const c = await pool.connect();
  try {
    const r = await c.query(`
      SELECT 
        CASE 
          WHEN l.notes ILIKE '%ai_agent%' THEN 'ai'
          WHEN l.notes ILIKE '%manual%' THEN 'manual'
          WHEN dca.agent_type::text = 'ai' THEN 'ai'
          WHEN dca.agent_type::text = 'human' THEN 'manual'
          ELSE 'no_match'
        END as source,
        COUNT(*) as cnt
      FROM leads l
      LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
      WHERE l.deleted_at IS NULL
      GROUP BY 1 ORDER BY cnt DESC
    `);
    console.log('Lead sources:');
    for (const row of r.rows) console.log('  ' + row.source + ': ' + row.cnt);

    const r2 = await c.query(`
      SELECT 
        CASE 
          WHEN l.notes ILIKE '%ai_agent%' THEN 'ai'
          WHEN l.notes ILIKE '%manual%' THEN 'manual'
          WHEN dca.agent_type::text = 'ai' THEN 'ai'
          WHEN dca.agent_type::text = 'human' THEN 'manual'
          ELSE 'no_match'
        END as source,
        COUNT(*) as cnt
      FROM leads l
      LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
      JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
      WHERE l.deleted_at IS NULL
      GROUP BY 1 ORDER BY cnt DESC
    `);
    console.log('\nScored lead sources:');
    for (const row of r2.rows) console.log('  ' + row.source + ': ' + row.cnt);
  } finally { c.release(); await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });
