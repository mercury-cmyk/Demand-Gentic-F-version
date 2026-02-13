import { pool } from '../server/db';

async function main() {
  const client = await pool.connect();
  try {
    // Count unscored leads with transcripts by qa_status
    const res = await client.query(`
      SELECT 
        l.qa_status,
        COUNT(*) as total,
        COUNT(CASE WHEN cqr.id IS NOT NULL THEN 1 END) as scored,
        COUNT(CASE WHEN cqr.id IS NULL AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20 THEN 1 END) as unscored_with_transcript,
        COUNT(CASE WHEN cqr.id IS NULL AND (l.transcript IS NULL OR LENGTH(l.transcript) <= 20) THEN 1 END) as unscored_no_transcript
      FROM leads l
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
      WHERE l.deleted_at IS NULL
      GROUP BY l.qa_status
      ORDER BY total DESC
    `);

    console.log('\n=== LEAD SCORING STATUS BY QA STATUS ===\n');
    let totalUnscored = 0;
    for (const r of res.rows) {
      console.log(`${r.qa_status}: ${r.total} total | ${r.scored} scored | ${r.unscored_with_transcript} unscored+transcript | ${r.unscored_no_transcript} unscored-no-transcript`);
      totalUnscored += parseInt(r.unscored_with_transcript);
    }
    console.log(`\nTotal unscored with transcripts: ${totalUnscored}`);

    // Grand total
    const grand = await client.query(`
      SELECT COUNT(*) as cnt
      FROM leads l
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
      WHERE l.deleted_at IS NULL
        AND cqr.id IS NULL
        AND l.transcript IS NOT NULL
        AND LENGTH(l.transcript) > 20
    `);
    console.log(`\nConfirmed unscored leads with transcripts: ${grand.rows[0].cnt}`);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
