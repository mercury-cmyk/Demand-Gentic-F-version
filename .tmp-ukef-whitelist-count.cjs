require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
    const r = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(enqueued_reason,'') ILIKE '%whitelist_fail%')::int AS whitelist_fail,
        COUNT(*) FILTER (WHERE removed_reason = 'country_not_whitelisted')::int AS removed_country_not_whitelisted,
        COUNT(*) FILTER (WHERE status='removed' AND COALESCE(enqueued_reason,'') ILIKE '%whitelist_fail%')::int AS removed_with_whitelist_fail
      FROM campaign_queue
      WHERE campaign_id = $1
    `, [campaignId]);
    console.log('WHITELIST_FAILURE_COUNTS');
    console.table(r.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{console.error(e);process.exit(1);});
