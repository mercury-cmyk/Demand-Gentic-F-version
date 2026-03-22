require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
    const r = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='queued')::int AS queued,
        COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE COALESCE(enqueued_reason,'') ILIKE '%init_fail:%')::int AS with_init_fail,
        COUNT(*) FILTER (WHERE COALESCE(enqueued_reason,'') ILIKE '%pool_busy%')::int AS with_pool_busy,
        COUNT(*) FILTER (WHERE COALESCE(enqueued_reason,'') ILIKE '%pool_error_requeue%')::int AS with_pool_error_requeue,
        COUNT(*) FILTER (WHERE COALESCE(enqueued_reason,'') ILIKE '%invalid_phone%')::int AS with_invalid_phone_marker
      FROM campaign_queue
      WHERE campaign_id = $1
    `, [campaignId]);
    console.log('QUEUE_FAILURE_MARKERS');
    console.table(r.rows);

    const top = await client.query(`
      SELECT LEFT(COALESCE(enqueued_reason,''), 180) AS reason_prefix, COUNT(*)::int AS cnt
      FROM campaign_queue
      WHERE campaign_id = $1
        AND enqueued_reason IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 20
    `, [campaignId]);
    console.log('TOP_ENQUEUED_REASON_PREFIXES');
    console.table(top.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{console.error(e);process.exit(1);});