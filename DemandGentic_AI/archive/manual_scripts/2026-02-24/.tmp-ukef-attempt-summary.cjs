require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';

    const attempts = await client.query(`
      SELECT
        COUNT(*)::int AS attempts_total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS attempts_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS attempts_7d,
        MAX(created_at) AS last_attempt_created,
        MAX(call_started_at) AS last_call_started,
        COUNT(*) FILTER (WHERE connected = true)::int AS connected_total
      FROM dialer_call_attempts
      WHERE campaign_id = $1
    `, [campaignId]);
    console.log('DIALER_ATTEMPT_SUMMARY');
    console.table(attempts.rows);

    const recent = await client.query(`
      SELECT id, created_at, call_started_at, connected, disposition, phone_dialed, call_session_id
      FROM dialer_call_attempts
      WHERE campaign_id = $1
      ORDER BY created_at DESC
      LIMIT 15
    `, [campaignId]);
    console.log('RECENT_DIALER_ATTEMPTS');
    console.table(recent.rows);

    const disp = await client.query(`
      SELECT COALESCE(disposition::text, 'NULL') AS disposition, COUNT(*)::int AS cnt
      FROM dialer_call_attempts
      WHERE campaign_id = $1
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 20
    `, [campaignId]);
    console.log('DISPOSITION_DISTRIBUTION');
    console.table(disp.rows);

    const orphanSessions = await client.query(`
      SELECT COUNT(*)::int AS sessions_24h
      FROM call_sessions
      WHERE campaign_id = $1
        AND created_at > NOW() - INTERVAL '24 hours'
    `, [campaignId]);
    console.log('CALL_SESSIONS_24H');
    console.table(orphanSessions.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });