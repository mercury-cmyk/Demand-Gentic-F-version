require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';

    const q = await client.query(`
      SELECT
        COUNT(*)::int AS queued_total,
        COUNT(*) FILTER (
          WHERE (
            COALESCE(c.mobile_phone_e164, c.mobile_phone, '') ~ '^\\+44'
            OR COALESCE(c.direct_phone_e164, c.direct_phone, '') ~ '^\\+44'
          )
        )::int AS queued_with_any_uk_phone,
        COUNT(*) FILTER (
          WHERE (
            COALESCE(c.mobile_phone_e164, c.mobile_phone, '') ~ '^\\+44(0|1|2|3|7|8)0{6,}$'
            OR COALESCE(c.direct_phone_e164, c.direct_phone, '') ~ '^\\+44(0|1|2|3|7|8)0{6,}$'
          )
        )::int AS queued_obvious_uk_placeholders
      FROM campaign_queue q
      JOIN contacts c ON c.id = q.contact_id
      WHERE q.campaign_id = $1
        AND q.status = 'queued'
    `, [campaignId]);
    console.log('CURRENT_QUEUED_UK_PLACEHOLDER_CHECK');
    console.table(q.rows);

    const sample = await client.query(`
      SELECT c.id AS contact_id,
             c.full_name,
             c.mobile_phone_e164,
             c.direct_phone_e164,
             c.mobile_phone,
             c.direct_phone
      FROM campaign_queue q
      JOIN contacts c ON c.id = q.contact_id
      WHERE q.campaign_id = $1
        AND q.status = 'queued'
        AND (
          COALESCE(c.mobile_phone_e164, c.mobile_phone, '') ~ '^\\+44(0|1|2|3|7|8)0{6,}$'
          OR COALESCE(c.direct_phone_e164, c.direct_phone, '') ~ '^\\+44(0|1|2|3|7|8)0{6,}$'
        )
      LIMIT 20
    `, [campaignId]);
    console.log('QUEUED_PLACEHOLDER_SAMPLES');
    console.table(sample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{console.error(e);process.exit(1);});