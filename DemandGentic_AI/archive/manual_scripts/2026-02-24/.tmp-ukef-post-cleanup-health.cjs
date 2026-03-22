require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
  const reason = 'autoclean_placeholder_uk_number_2026_02_18';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const q = await client.query(`
      WITH base AS (
        SELECT
          q.status,
          q.removed_reason,
          COALESCE(c.mobile_phone_e164, c.mobile_phone, c.direct_phone_e164, c.direct_phone, '') AS best_phone,
          c.mobile_phone,
          c.direct_phone
        FROM campaign_queue q
        JOIN contacts c ON c.id = q.contact_id
        WHERE q.campaign_id = $1
      )
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued_total,
        COUNT(*) FILTER (WHERE status = 'queued' AND best_phone ~ '^\\+44')::int AS queued_best_phone_uk,
        COUNT(*) FILTER (WHERE status = 'queued' AND best_phone ~ '^\\+44(0|1|2|3|7|8)0{6,}$')::int AS queued_strict_placeholder_remaining,
        COUNT(*) FILTER (WHERE status = 'queued' AND (COALESCE(mobile_phone,'') ~ '^44[0-9]E\\+[0-9]+$' OR COALESCE(direct_phone,'') ~ '^44[0-9]E\\+[0-9]+$'))::int AS queued_scinotation_source_rows,
        COUNT(*) FILTER (WHERE status = 'removed' AND removed_reason = $2)::int AS removed_by_latest_cleanup
      FROM base
    `, [campaignId, reason]);

    console.log('UKEF_POST_CLEANUP_QUEUE_HEALTH');
    console.table(q.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{ console.error(e); process.exit(1); });