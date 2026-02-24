require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';

    const aqStates = await client.query(`
      SELECT queue_state::text AS queue_state, COUNT(*)::int AS cnt
      FROM agent_queue
      WHERE campaign_id = $1
      GROUP BY 1
      ORDER BY cnt DESC
    `, [campaignId]);
    console.log('AGENT_QUEUE_STATES');
    console.table(aqStates.rows);

    const attempts = await client.query(`
      SELECT
        COUNT(*)::int AS attempts_24h,
        COUNT(*) FILTER (WHERE error_message IS NOT NULL)::int AS errors_24h,
        MAX(created_at) AS last_attempt_at,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS attempts_7d
      FROM dialer_call_attempts
      WHERE campaign_id = $1
    `, [campaignId]);
    console.log('DIALER_ATTEMPTS');
    console.table(attempts.rows);

    const topErrors = await client.query(`
      SELECT LEFT(error_message, 180) AS error, COUNT(*)::int AS cnt
      FROM dialer_call_attempts
      WHERE campaign_id = $1
        AND created_at > NOW() - INTERVAL '14 days'
        AND error_message IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 20
    `, [campaignId]);
    console.log('TOP_ERRORS_14D');
    console.table(topErrors.rows);

    const csCols = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='call_sessions'
      ORDER BY ordinal_position
    `);
    const hasDirection = csCols.rows.some(r => r.column_name === 'direction');
    console.log('CALL_SESSIONS_HAS_DIRECTION', hasDirection);

    const recentFailures = await client.query(`
      SELECT id, created_at, status, error_message
      FROM dialer_call_attempts
      WHERE campaign_id = $1
        AND error_message IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 10
    `, [campaignId]);
    console.log('RECENT_FAILED_ATTEMPTS');
    console.table(recentFailures.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
