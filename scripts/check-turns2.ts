import { pool } from '../server/db';

(async () => {
  const c = await pool.connect();
  try {
    // Transcripts are JSON arrays — count array elements as turns
    const dist = await c.query(`
      SELECT 
        CASE
          WHEN turns >= 30 THEN '30+'
          WHEN turns >= 20 THEN '20-29'
          WHEN turns >= 15 THEN '15-19'
          WHEN turns >= 10 THEN '10-14'
          WHEN turns >= 5 THEN '5-9'
          ELSE '0-4'
        END as bucket,
        COUNT(*) as total,
        SUM(CASE WHEN scored THEN 1 ELSE 0 END) as scored,
        SUM(CASE WHEN NOT scored THEN 1 ELSE 0 END) as unscored
      FROM (
        SELECT 
          l.id,
          CASE 
            WHEN l.transcript LIKE '[%' THEN jsonb_array_length(l.transcript::jsonb)
            ELSE (LENGTH(l.transcript) - LENGTH(REPLACE(l.transcript, E'\n', '')))
          END as turns,
          EXISTS (
            SELECT 1 FROM call_sessions cs 
            JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
            WHERE cs.telnyx_call_id = l.telnyx_call_id
          ) as scored
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
      ) sub
      GROUP BY 1 ORDER BY 1 DESC
    `);
    
    console.log('=== Turn count distribution ===');
    console.log('Bucket    | Total | Scored | Unscored');
    for (const row of dist.rows) {
      console.log(`${row.bucket.padEnd(9)} | ${String(row.total).padEnd(5)} | ${String(row.scored).padEnd(6)} | ${row.unscored}`);
    }

    // List unscored leads with 15+ turns
    const leads15 = await c.query(`
      SELECT 
        l.id, l.contact_name, l.qa_status, l.call_duration, l.ai_score,
        CASE 
          WHEN l.transcript LIKE '[%' THEN jsonb_array_length(l.transcript::jsonb)
          ELSE (LENGTH(l.transcript) - LENGTH(REPLACE(l.transcript, E'\n', '')))
        END as turns,
        CASE 
          WHEN l.notes ILIKE '%ai_agent%' THEN 'ai'
          WHEN l.notes ILIKE '%manual%' THEN 'manual'
          ELSE 'unknown'
        END as source
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
        AND NOT EXISTS (
          SELECT 1 FROM call_sessions cs 
          JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
          WHERE cs.telnyx_call_id = l.telnyx_call_id
        )
        AND CASE 
          WHEN l.transcript LIKE '[%' THEN jsonb_array_length(l.transcript::jsonb)
          ELSE (LENGTH(l.transcript) - LENGTH(REPLACE(l.transcript, E'\n', '')))
        END >= 15
      ORDER BY turns DESC
    `);
    
    console.log('\n=== Unscored leads with 15+ turns ===');
    console.log(`Found: ${leads15.rows.length}`);
    for (const row of leads15.rows) {
      const dur = row.call_duration ? `${row.call_duration}s` : 'n/a';
      console.log(`  ${row.turns} turns | ${row.contact_name} | ${row.source} | qa:${row.qa_status} | dur:${dur}`);
    }

    // Also show scored leads with 15+ turns for context
    const scored15 = await c.query(`
      SELECT COUNT(*) as cnt
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
        AND EXISTS (
          SELECT 1 FROM call_sessions cs 
          JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
          WHERE cs.telnyx_call_id = l.telnyx_call_id
        )
        AND CASE 
          WHEN l.transcript LIKE '[%' THEN jsonb_array_length(l.transcript::jsonb)
          ELSE (LENGTH(l.transcript) - LENGTH(REPLACE(l.transcript, E'\n', '')))
        END >= 15
    `);
    console.log(`\nAlready scored with 15+ turns: ${scored15.rows[0].cnt}`);

  } finally { c.release(); await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });
