require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const counts = await client.query(`
      WITH base AS (
        SELECT
          q.id AS queue_id,
          q.contact_id,
          COALESCE(c.mobile_phone_e164, c.mobile_phone, c.direct_phone_e164, c.direct_phone, '') AS best_phone,
          c.mobile_phone_e164,
          c.direct_phone_e164,
          c.mobile_phone,
          c.direct_phone
        FROM campaign_queue q
        JOIN contacts c ON c.id = q.contact_id
        WHERE q.campaign_id = $1
          AND q.status = 'queued'
      )
      SELECT
        COUNT(*)::int AS queued_total,
        COUNT(*) FILTER (WHERE best_phone ~ '^\\+44')::int AS queued_bestphone_uk,
        COUNT(*) FILTER (
          WHERE best_phone ~ '^\\+44(0|1|2|3|7|8)0{6,}$'
        )::int AS strict_placeholder_matches,
        COUNT(*) FILTER (
          WHERE COALESCE(mobile_phone,'') ~ '^44[0-9]E\\+[0-9]+$' OR COALESCE(direct_phone,'') ~ '^44[0-9]E\\+[0-9]+$'
        )::int AS scientific_notation_source_rows
      FROM base
    `, [campaignId]);

    const sample = await client.query(`
      WITH base AS (
        SELECT
          q.id AS queue_id,
          q.contact_id,
          c.full_name,
          COALESCE(c.mobile_phone_e164, c.mobile_phone, c.direct_phone_e164, c.direct_phone, '') AS best_phone,
          c.mobile_phone_e164,
          c.direct_phone_e164,
          c.mobile_phone,
          c.direct_phone
        FROM campaign_queue q
        JOIN contacts c ON c.id = q.contact_id
        WHERE q.campaign_id = $1
          AND q.status = 'queued'
      )
      SELECT *
      FROM base
      WHERE best_phone ~ '^\\+44(0|1|2|3|7|8)0{6,}$'
      ORDER BY queue_id
      LIMIT 25
    `, [campaignId]);

    console.log('UKEF_DRY_RUN_COUNTS');
    console.table(counts.rows);
    console.log('UKEF_DRY_RUN_SAMPLE_STRICT_PLACEHOLDERS');
    console.table(sample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{ console.error(e); process.exit(1); });
