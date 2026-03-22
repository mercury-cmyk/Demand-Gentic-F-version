require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const q = await client.query(`
      SELECT id, qa_status, approved_at, pm_approved_at, created_at,
             length(coalesce(transcript, ''))::int as transcript_len,
             (structured_transcript IS NOT NULL) as has_structured_transcript,
             (recording_s3_key IS NOT NULL OR recording_url IS NOT NULL) as has_recording,
             (ai_analysis IS NOT NULL) as has_ai_analysis
      FROM leads
      WHERE qa_status IN ('approved', 'pending_pm_review')
        AND coalesce(transcript, '') = ''
        AND structured_transcript IS NULL
      ORDER BY created_at DESC
      LIMIT 27
    `);

    console.log('Candidate leads:', q.rowCount);
    console.table(q.rows.map(r => ({
      id: r.id,
      qa_status: r.qa_status,
      transcript_len: r.transcript_len,
      has_structured_transcript: r.has_structured_transcript,
      has_recording: r.has_recording,
      has_ai_analysis: r.has_ai_analysis,
      created_at: r.created_at,
    })));
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });