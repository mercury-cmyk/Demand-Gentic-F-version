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
          q.status,
          c.full_name,
          COALESCE(c.mobile_phone_e164, c.mobile_phone, c.direct_phone_e164, c.direct_phone, '') AS best_phone,
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
          WHERE COALESCE(mobile_phone,'') ~ '^44[0-9]E\\+[0-9]+$' OR COALESCE(direct_phone,'') ~ '^44[0-9]E\\+[0-9]+$'
        )::int AS scinotation_rows,
        COUNT(*) FILTER (
          WHERE (COALESCE(mobile_phone,'') ~ '^44[0-9]E\\+[0-9]+$' OR COALESCE(direct_phone,'') ~ '^44[0-9]E\\+[0-9]+$')
            AND best_phone ~ '^\\+44'
        )::int AS scinotation_rows_bestphone_uk
      FROM base
    `, [campaignId]);

    const sample = await client.query(`
      SELECT
        q.id AS queue_id,
        c.id AS contact_id,
        c.full_name,
        c.mobile_phone,
        c.direct_phone,
        c.mobile_phone_e164,
        c.direct_phone_e164,
        COALESCE(c.mobile_phone_e164, c.mobile_phone, c.direct_phone_e164, c.direct_phone, '') AS best_phone
      FROM campaign_queue q
      JOIN contacts c ON c.id = q.contact_id
      WHERE q.campaign_id = $1
        AND q.status = 'queued'
        AND (
          COALESCE(c.mobile_phone,'') ~ '^44[0-9]E\\+[0-9]+$'
          OR COALESCE(c.direct_phone,'') ~ '^44[0-9]E\\+[0-9]+$'
        )
      ORDER BY q.id
      LIMIT 20
    `, [campaignId]);

    console.log('UKEF_SECOND_PASS_DRYRUN_COUNTS');
    console.table(counts.rows);
    console.log('UKEF_SECOND_PASS_DRYRUN_SAMPLE');
    console.table(sample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{ console.error(e); process.exit(1); });
