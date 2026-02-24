require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';

    const markerCounts = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE enqueued_reason ILIKE '%whitelist_fail%')::int AS whitelist_fail,
        COUNT(*) FILTER (WHERE enqueued_reason ILIKE '%whitelist_fail%' AND c.country IN ('UK','GB','United Kingdom','England','Scotland','Wales'))::int AS whitelist_fail_uk_country,
        COUNT(*) FILTER (WHERE enqueued_reason ILIKE '%whitelist_fail%' AND c.country IS NULL)::int AS whitelist_fail_country_null
      FROM campaign_queue q
      LEFT JOIN contacts c ON c.id = q.contact_id
      WHERE q.campaign_id = $1
    `, [campaignId]);
    console.log('WHITELIST_COUNTS_BY_CONTACT_COUNTRY');
    console.table(markerCounts.rows);

    const whitelistByDialedPrefix = await client.query(`
      SELECT
        CASE
          WHEN a.phone_dialed LIKE '+44%' THEN '+44'
          WHEN a.phone_dialed LIKE '+1%' THEN '+1'
          WHEN a.phone_dialed LIKE '+61%' THEN '+61'
          WHEN a.phone_dialed IS NULL THEN 'NULL'
          ELSE 'OTHER'
        END AS dial_prefix,
        COUNT(*)::int AS cnt
      FROM dialer_call_attempts a
      JOIN campaign_queue q ON q.id = a.queue_item_id
      WHERE a.campaign_id = $1
        AND q.enqueued_reason ILIKE '%whitelist_fail%'
      GROUP BY 1
      ORDER BY cnt DESC
    `, [campaignId]);
    console.log('WHITELIST_FAIL_BY_DIALED_PREFIX');
    console.table(whitelistByDialedPrefix.rows);

    const recentWhitelistPhones = await client.query(`
      SELECT a.phone_dialed, COUNT(*)::int AS cnt
      FROM dialer_call_attempts a
      JOIN campaign_queue q ON q.id = a.queue_item_id
      WHERE a.campaign_id = $1
        AND q.enqueued_reason ILIKE '%whitelist_fail%'
      GROUP BY a.phone_dialed
      ORDER BY cnt DESC
      LIMIT 25
    `, [campaignId]);
    console.log('TOP_WHITELIST_FAIL_PHONES');
    console.table(recentWhitelistPhones.rows);

    const ukAttemptHealth = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE phone_dialed LIKE '+44%')::int AS uk_attempts,
        COUNT(*) FILTER (WHERE phone_dialed LIKE '+44%' AND call_started_at IS NOT NULL)::int AS uk_started,
        COUNT(*) FILTER (WHERE phone_dialed LIKE '+44%' AND call_started_at IS NULL)::int AS uk_not_started
      FROM dialer_call_attempts
      WHERE campaign_id = $1
        AND created_at > NOW() - INTERVAL '7 days'
    `, [campaignId]);
    console.log('UK_ATTEMPT_HEALTH_7D');
    console.table(ukAttemptHealth.rows);

  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{console.error(e);process.exit(1);});
