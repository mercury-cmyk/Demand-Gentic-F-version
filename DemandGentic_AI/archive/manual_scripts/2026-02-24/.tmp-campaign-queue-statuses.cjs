require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const statuses = await client.query(`
      SELECT status::text, COUNT(*)::int AS cnt
      FROM campaign_queue
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 20
    `);
    console.log('CAMPAIGN_QUEUE_STATUSES');
    console.table(statuses.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{ console.error(e); process.exit(1); });