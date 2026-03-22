import { pool } from '../server/db';

async function main() {
  const client = await pool.connect();
  try {
    const r1 = await client.query(`
      SELECT 
        qa_status,
        COUNT(*) as total,
        COUNT(ai_score) as has_score,
        COUNT(*) - COUNT(ai_score) as missing_score
      FROM leads 
      WHERE deleted_at IS NULL
      GROUP BY qa_status
      ORDER BY total DESC
    `);
    console.log('Leads ai_score coverage by QA status:');
    console.table(r1.rows);

    const r2 = await client.query(`
      SELECT COUNT(*) as unscored_with_transcript
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND l.transcript IS NOT NULL
        AND l.transcript != ''
        AND NOT EXISTS (
          SELECT 1 FROM call_sessions cs
          JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
          WHERE cs.telnyx_call_id = l.telnyx_call_id
        )
    `);
    console.log('Leads with transcripts but no quality scores:', r2.rows[0].unscored_with_transcript);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });