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
        COUNT(CASE WHEN cqr.id IS NULL AND (l.transcript IS NULL OR LENGTH(l.transcript)  20
    `);
    console.log(`\nConfirmed unscored leads with transcripts: ${grand.rows[0].cnt}`);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });