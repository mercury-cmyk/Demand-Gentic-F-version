require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const q = await client.query(`
      SELECT id, qa_status, pm_approved_at, published_at, created_at
      FROM leads
      WHERE qa_status IN ('approved','pending_pm_review')
        AND pm_approved_at IS NULL
      ORDER BY created_at DESC
      LIMIT 40
    `);
    console.log('PM review queue candidates:', q.rowCount);
    console.table(q.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch(e => { console.error(e); process.exit(1); });