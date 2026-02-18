require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';

    const q = await client.query(`
      SELECT
        COUNT(*)::int AS attempts_7d,
        COUNT(*) FILTER (WHERE call_started_at IS NULL)::int AS never_started,
        COUNT(*) FILTER (WHERE call_started_at IS NULL AND caller_number_id IS NULL)::int AS never_started_missing_caller_id,
        COUNT(*) FILTER (WHERE call_started_at IS NULL AND from_did IS NULL)::int AS never_started_missing_from_did,
        COUNT(*) FILTER (WHERE call_started_at IS NULL AND caller_number_id IS NULL AND from_did IS NULL)::int AS never_started_missing_both,
        COUNT(*) FILTER (WHERE call_started_at IS NOT NULL)::int AS started
      FROM dialer_call_attempts
      WHERE campaign_id = $1
        AND created_at > NOW() - INTERVAL '7 days'
    `, [campaignId]);
    console.log('FAILED_START_ATTRS_7D');
    console.table(q.rows);

    const sample = await client.query(`
      SELECT id, created_at, phone_dialed, caller_number_id, from_did, call_started_at, call_session_id, disposition
      FROM dialer_call_attempts
      WHERE campaign_id = $1
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 20
    `, [campaignId]);
    console.log('RECENT_ATTEMPT_SAMPLE_24H');
    console.table(sample.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e)=>{console.error(e);process.exit(1);});
