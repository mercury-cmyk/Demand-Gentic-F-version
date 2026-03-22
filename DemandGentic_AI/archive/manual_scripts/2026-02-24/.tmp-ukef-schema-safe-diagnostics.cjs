require('dotenv').config();
const { Pool } = require('pg');

async function getCols(client, table) {
  const r = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return new Set(r.rows.map(x => x.column_name));
}

function pick(cols, candidates) {
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const tables = ['campaigns','campaign_queue','agent_queue','dialer_call_attempts','call_sessions'];
    const colMap = {};
    for (const t of tables) colMap[t] = await getCols(client, t);

    console.log('SCHEMA_COLUMN_PRESENCE');
    for (const t of tables) {
      const arr = [...colMap[t]];
      console.log(`${t}: ${arr.length} columns`);
    }

    // Campaign lookup
    const cCols = colMap.campaigns;
    const idCol = pick(cCols, ['id']);
    const nameCol = pick(cCols, ['name']);
    const statusCol = pick(cCols, ['status']);
    const updatedCol = pick(cCols, ['updated_at','updatedat']);

    if (!idCol || !nameCol) throw new Error('campaigns table missing id/name');

    const optionalCampaignCols = ['type','dial_mode','auto_dial_enabled','execution_mode','started_at','ended_at','updated_at']
      .filter(c => cCols.has(c));

    const campaignSql = `
      SELECT ${[idCol, nameCol, ...(statusCol?[statusCol]:[]), ...optionalCampaignCols.filter(c=>c!==statusCol)].join(', ')}
      FROM campaigns
      WHERE ${nameCol} ILIKE '%UK Export Finance%' OR ${nameCol} ILIKE '%UKEF%'
      ${updatedCol ? `ORDER BY ${updatedCol} DESC` : ''}
      LIMIT 10
    `;

    const campaigns = await client.query(campaignSql);
    console.log('CAMPAIGNS_MATCH');
    console.table(campaigns.rows);

    if (campaigns.rows.length === 0) return;
    const campaignId = campaigns.rows[0][idCol];

    // campaign_queue stats
    const cqCols = colMap.campaign_queue;
    if (cqCols.has('campaign_id') && cqCols.has('status')) {
      const hasNext = cqCols.has('next_attempt_at');
      const qSql = `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='queued')::int AS queued,
          COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress,
          COUNT(*) FILTER (WHERE status='done')::int AS done,
          COUNT(*) FILTER (WHERE status='removed')::int AS removed
          ${hasNext ? ", COUNT(*) FILTER (WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at  NOW())::int AS deferred, MIN(next_attempt_at) FILTER (WHERE status='queued') AS next_queued_at" : ''}
        FROM campaign_queue
        WHERE campaign_id = $1
      `;
      const q = await client.query(qSql, [campaignId]);
      console.log('CAMPAIGN_QUEUE_STATS');
      console.table(q.rows);
    }

    // agent_queue stats
    const aqCols = colMap.agent_queue;
    if (aqCols.has('campaign_id')) {
      const stateCol = pick(aqCols, ['queue_state','status']);
      const schedCol = pick(aqCols, ['scheduled_for','next_attempt_at']);
      if (stateCol) {
        const aSql = `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ${stateCol}='queued')::int AS queued,
            COUNT(*) FILTER (WHERE ${stateCol}='dialing')::int AS dialing,
            COUNT(*) FILTER (WHERE ${stateCol}='completed')::int AS completed,
            COUNT(*) FILTER (WHERE ${stateCol}='removed')::int AS removed
            ${schedCol ? `, COUNT(*) FILTER (WHERE ${stateCol}='queued' AND (${schedCol} IS NULL OR ${schedCol}  NOW() - INTERVAL '24 hours'` : ''}
      `;
      const at = await client.query(attemptsSql, [campaignId]);
      console.log('DIALER_ATTEMPTS_24H');
      console.table(at.rows);

      if (errCol && createdCol) {
        const topErrSql = `
          SELECT LEFT(${errCol}::text, 180) AS error, COUNT(*)::int AS cnt
          FROM dialer_call_attempts
          WHERE campaign_id = $1
            AND ${createdCol} > NOW() - INTERVAL '7 days'
            AND ${errCol} IS NOT NULL
          GROUP BY 1
          ORDER BY cnt DESC
          LIMIT 10
        `;
        const te = await client.query(topErrSql, [campaignId]);
        console.log('TOP_ERRORS_7D');
        console.table(te.rows);
      }
    }

    // hard check: does call_sessions.direction exist?
    const hasDirection = colMap.call_sessions.has('direction');
    console.log('CALL_SESSIONS_DIRECTION_PRESENT', hasDirection);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});