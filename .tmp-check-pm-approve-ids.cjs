require('dotenv').config();
const { Pool } = require('pg');

const ids = [
  'b599b3ef-6020-4d01-8e4b-3ee19d237bb9',
  'a5f8f02f-e31e-44cb-ae07-6e96ab9eca66',
  '135936ac-6157-4815-9a91-392d3a96daa0',
  '6268f1be-42a9-4c51-91f1-54699dc91027',
  '56dbe86d-1994-44d5-b20c-0f849dd8d37d'
];

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const q = await client.query(`
      SELECT
        id,
        qa_status,
        approved_at,
        pm_approved_at,
        recording_s3_key,
        recording_url,
        length(coalesce(transcript, ''))::int as transcript_len,
        CASE WHEN ai_analysis IS NULL THEN false ELSE true END as has_ai_analysis
      FROM leads
      WHERE id = ANY($1::text[])
      ORDER BY created_at DESC
    `, [ids]);
    console.table(q.rows.map(r => ({
      id: r.id,
      qa_status: r.qa_status,
      approved_at: r.approved_at,
      pm_approved_at: r.pm_approved_at,
      has_recording_s3_key: !!r.recording_s3_key,
      recording_url_prefix: r.recording_url ? String(r.recording_url).slice(0, 42) : null,
      transcript_len: r.transcript_len,
      has_ai_analysis: r.has_ai_analysis,
    })));
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch(e => { console.error(e); process.exit(1); });
