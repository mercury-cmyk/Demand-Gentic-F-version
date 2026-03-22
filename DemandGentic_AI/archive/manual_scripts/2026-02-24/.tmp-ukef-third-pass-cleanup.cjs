require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

async function run() {
  const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
  const reason = 'autoclean_placeholder_residual_2026_02_18';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const before = await client.query(`
      WITH base AS (
        SELECT
          q.id,
          q.status,
          COALESCE(
            NULLIF(c.mobile_phone_e164, ''),
            NULLIF(c.direct_phone_e164, ''),
            NULLIF(c.mobile_phone, ''),
            NULLIF(c.direct_phone, ''),
            ''
          ) AS best_phone
        FROM campaign_queue q
        JOIN contacts c ON c.id = q.contact_id
        WHERE q.campaign_id = $1
      )
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued_total,
        COUNT(*) FILTER (WHERE status = 'queued' AND best_phone ~ '^\\+44(0|1|2|3|7|8)0{6,}$')::int AS queued_strict_placeholder_remaining
      FROM base
    `, [campaignId]);

    const updated = await client.query(`
      WITH targets AS (
        SELECT q.id
        FROM campaign_queue q
        JOIN contacts c ON c.id = q.contact_id
        WHERE q.campaign_id = $1
          AND q.status = 'queued'
          AND COALESCE(
            NULLIF(c.mobile_phone_e164, ''),
            NULLIF(c.direct_phone_e164, ''),
            NULLIF(c.mobile_phone, ''),
            NULLIF(c.direct_phone, ''),
            ''
          ) ~ '^\\+44(0|1|2|3|7|8)0{6,}$'
      )
      UPDATE campaign_queue q
      SET status = 'removed',
          removed_reason = $2,
          updated_at = NOW()
      FROM targets t
      WHERE q.id = t.id
      RETURNING q.id
    `, [campaignId, reason]);

    const after = await client.query(`
      WITH base AS (
        SELECT
          q.status,
          q.removed_reason,
          COALESCE(
            NULLIF(c.mobile_phone_e164, ''),
            NULLIF(c.direct_phone_e164, ''),
            NULLIF(c.mobile_phone, ''),
            NULLIF(c.direct_phone, ''),
            ''
          ) AS best_phone
        FROM campaign_queue q
        JOIN contacts c ON c.id = q.contact_id
        WHERE q.campaign_id = $1
      )
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued_total,
        COUNT(*) FILTER (WHERE status = 'queued' AND best_phone ~ '^\\+44(0|1|2|3|7|8)0{6,}$')::int AS queued_strict_placeholder_remaining,
        COUNT(*) FILTER (WHERE status = 'removed' AND removed_reason = $2)::int AS removed_by_this_job
      FROM base
    `, [campaignId, reason]);

    await client.query('COMMIT');

    const result = {
      executedAt: new Date().toISOString(),
      campaignId,
      reason,
      before: before.rows[0],
      updatedRows: updated.rowCount,
      after: after.rows[0]
    };

    fs.writeFileSync('.tmp-ukef-third-pass-cleanup-result.json', JSON.stringify(result, null, 2));
    console.log('WROTE .tmp-ukef-third-pass-cleanup-result.json');
    console.log('UPDATED_ROWS', updated.rowCount);
    console.log('RESULT', result);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e)=>{ console.error(e); process.exit(1); });