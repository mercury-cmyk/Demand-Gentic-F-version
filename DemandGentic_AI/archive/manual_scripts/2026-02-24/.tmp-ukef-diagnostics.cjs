require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const campaign = await client.query(`
      SELECT id, name, status, type, dial_mode, auto_dial_enabled, started_at, ended_at, updated_at
      FROM campaigns
      WHERE name ILIKE '%UK Export Finance%' OR name ILIKE '%UKEF%'
      ORDER BY updated_at DESC
      LIMIT 5
    `);
    console.log('CAMPAIGNS');
    console.table(campaign.rows);

    if (campaign.rows.length === 0) return;
    const campaignId = campaign.rows[0].id;

    const queue = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status = 'removed')::int AS removed,
        COUNT(*) FILTER (WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at  NOW())::int AS deferred,
        MIN(next_attempt_at) FILTER (WHERE status='queued') AS next_queued_at
      FROM campaign_queue
      WHERE campaign_id = $1
    `, [campaignId]);
    console.log('CAMPAIGN_QUEUE');
    console.table(queue.rows);

    const agentQueue = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE queue_state = 'queued')::int AS queued,
        COUNT(*) FILTER (WHERE queue_state = 'dialing')::int AS dialing,
        COUNT(*) FILTER (WHERE queue_state = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE queue_state = 'removed')::int AS removed,
        COUNT(*) FILTER (WHERE queue_state='queued' AND (scheduled_for IS NULL OR scheduled_for  NOW() - INTERVAL '24 hours'
    `, [campaignId]);
    console.log('DIALER_ATTEMPTS_24H');
    console.table(attempts.rows);

    const topErrors = await client.query(`
      SELECT
        LEFT(error_message, 140) AS error,
        COUNT(*)::int AS cnt
      FROM dialer_call_attempts
      WHERE campaign_id = $1
        AND created_at > NOW() - INTERVAL '7 days'
        AND error_message IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 10
    `, [campaignId]);
    console.log('TOP_ERRORS_7D');
    console.table(topErrors.rows);

    const rawErrorProbe = await client.query(`
      SELECT
        COUNT(*)::int AS direction_error_cnt
      FROM call_attempt_logs
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND (error ILIKE '%column "direction" of relation "call_sessions" does not exist%'
          OR message ILIKE '%column "direction" of relation "call_sessions" does not exist%')
    `).catch(() => ({ rows: [{ direction_error_cnt: null }] }));
    console.log('DIRECTION_ERROR_PROBE');
    console.table(rawErrorProbe.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});