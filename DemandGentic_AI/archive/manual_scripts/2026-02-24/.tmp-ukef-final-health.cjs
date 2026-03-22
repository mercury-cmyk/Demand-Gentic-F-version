require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
  const reason1 = 'autoclean_placeholder_uk_number_2026_02_18';
  const reason2 = 'autoclean_scinotation_phone_artifact_2026_02_18';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const q = await client.query(`
      WITH base AS (
        SELECT
          q.status,
          q.removed_reason,
          NULLIF(COALESCE(c.mobile_phone_e164, ''), '') AS mobile_e164,
          NULLIF(COALESCE(c.direct_phone_e164, ''), '') AS direct_e164,
          NULLIF(COALESCE(c.mobile_phone, ''), '') AS mobile_raw,
          NULLIF(COALESCE(c.direct_phone, ''), '') AS direct_raw
        FROM campaign_queue q
        JOIN contacts c ON c.id = q.contact_id
        WHERE q.campaign_id = $1
      ), normalized AS (
        SELECT
          status,
          removed_reason,
          COALESCE(mobile_e164, direct_e164, mobile_raw, direct_raw, '') AS best_phone,
          mobile_raw,
          direct_raw
        FROM base
      )
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued_total,
        COUNT(*) FILTER (WHERE status = 'queued' AND best_phone ~ '^\\+44')::int AS queued_best_phone_uk,
        COUNT(*) FILTER (WHERE status = 'queued' AND best_phone ~ '^\\+44(0|1|2|3|7|8)0{6,}$')::int AS queued_strict_placeholder_remaining,
        COUNT(*) FILTER (WHERE status = 'queued' AND (COALESCE(mobile_raw,'') ~ '^44[0-9]E\\+[0-9]+$' OR COALESCE(direct_raw,'') ~ '^44[0-9]E\\+[0-9]+$'))::int AS queued_scinotation_remaining,
        COUNT(*) FILTER (WHERE status = 'removed' AND removed_reason = $2)::int AS removed_first_pass,
        COUNT(*) FILTER (WHERE status = 'removed' AND removed_reason = $3)::int AS removed_second_pass
      FROM normalized
    `, [campaignId, reason1, reason2]);

    console.log('UKEF_FINAL_QUEUE_HEALTH_AFTER_TWO_PASSES');
    console.table(q.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{ console.error(e); process.exit(1); });