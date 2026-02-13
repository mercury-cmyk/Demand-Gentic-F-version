import { pool } from '../server/db';
(async () => {
  const c = await pool.connect();
  try {
    // Leads without transcripts
    const r = await c.query(`
      SELECT 
        CASE 
          WHEN l.transcript IS NULL THEN 'null'
          WHEN l.transcript = '' THEN 'empty'
          WHEN LENGTH(l.transcript) < 20 THEN 'too_short'
          ELSE 'has_transcript'
        END as status,
        COUNT(*) as cnt
      FROM leads l
      WHERE l.deleted_at IS NULL
      GROUP BY 1 ORDER BY cnt DESC
    `);
    console.log('All leads - transcript status:');
    for (const row of r.rows) console.log('  ' + row.status + ': ' + row.cnt);

    // Leads without transcripts but WITH recordings
    const r2 = await c.query(`
      SELECT COUNT(*) as cnt
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND (l.transcript IS NULL OR l.transcript = '' OR LENGTH(l.transcript) < 20)
        AND l.recording_url IS NOT NULL AND l.recording_url != ''
    `);
    console.log('\nNo transcript but HAS recording_url: ' + r2.rows[0].cnt);

    // Leads without transcripts and without recordings
    const r3 = await c.query(`
      SELECT COUNT(*) as cnt
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND (l.transcript IS NULL OR l.transcript = '' OR LENGTH(l.transcript) < 20)
        AND (l.recording_url IS NULL OR l.recording_url = '')
    `);
    console.log('No transcript AND no recording: ' + r3.rows[0].cnt);

    // By qa_status
    const r4 = await c.query(`
      SELECT l.qa_status, COUNT(*) as cnt
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND (l.transcript IS NULL OR l.transcript = '' OR LENGTH(l.transcript) < 20)
      GROUP BY l.qa_status ORDER BY cnt DESC
    `);
    console.log('\nNo-transcript leads by QA status:');
    for (const row of r4.rows) console.log('  ' + row.qa_status + ': ' + row.cnt);

    // Total leads
    const r5 = await c.query(`SELECT COUNT(*) as cnt FROM leads WHERE deleted_at IS NULL`);
    console.log('\nTotal leads: ' + r5.rows[0].cnt);
  } finally { c.release(); await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });
