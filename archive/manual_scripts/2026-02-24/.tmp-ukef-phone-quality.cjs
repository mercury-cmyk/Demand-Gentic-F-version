require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';

    const q = await client.query(`
      SELECT
        COUNT(*)::int AS total_attempts_7d,
        COUNT(*) FILTER (WHERE phone_dialed !~ '^\\+[1-9][0-9]{7,14}$')::int AS not_e164,
        COUNT(*) FILTER (WHERE phone_dialed ~ '^\\+1(44|77|88|99)0{6,}$')::int AS obvious_placeholder,
        COUNT(*) FILTER (WHERE call_session_id IS NULL)::int AS no_session_link,
        COUNT(*) FILTER (WHERE call_started_at IS NULL)::int AS never_started
      FROM dialer_call_attempts
      WHERE campaign_id = $1
        AND created_at > NOW() - INTERVAL '7 days'
    `, [campaignId]);
    console.log('ATTEMPT_DATA_QUALITY_7D');
    console.table(q.rows);

    const samples = await client.query(`
      SELECT phone_dialed, COUNT(*)::int AS cnt
      FROM dialer_call_attempts
      WHERE campaign_id = $1
        AND created_at > NOW() - INTERVAL '7 days'
        AND (phone_dialed !~ '^\\+[1-9][0-9]{7,14}$' OR phone_dialed ~ '^\\+1(44|77|88|99)0{6,}$')
      GROUP BY phone_dialed
      ORDER BY cnt DESC
      LIMIT 20
    `, [campaignId]);
    console.log('BAD_PHONE_SAMPLES_7D');
    console.table(samples.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e)=>{console.error(e);process.exit(1);});
