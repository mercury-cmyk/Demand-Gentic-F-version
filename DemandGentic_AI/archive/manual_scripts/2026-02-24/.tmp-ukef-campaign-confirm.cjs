require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const rows = await client.query(`
      SELECT id, name, status,
             (SELECT COUNT(*)::int FROM campaign_queue q WHERE q.campaign_id = c.id AND q.status = 'queued') AS queued_count,
             (SELECT COUNT(*)::int FROM dialer_call_attempts a WHERE a.campaign_id = c.id AND a.created_at > NOW() - INTERVAL '24 hours') AS attempts_24h
      FROM campaigns c
      WHERE name ILIKE '%UK Export Finance%'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log('UKEF_CAMPAIGN_CANDIDATES');
    console.table(rows.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{ console.error(e); process.exit(1); });