import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';

async function run() {
  console.log('GENUINE LEADS FROM CALL ANALYSIS (last 7 days, duration > 40s)');

  const window = await db.execute(sql`
    SELECT NOW() - INTERVAL '7 days' AS start_time, NOW() AS end_time
  `);
  const startTime = window.rows?.[0]?.start_time;
  const endTime = window.rows?.[0]?.end_time;
  console.log('Window:', startTime, '?', endTime);

  const totals = await db.execute(sql`
    WITH base AS (
      SELECT
        cqr.id AS record_id,
        cqr.call_session_id,
        cqr.dialer_call_attempt_id,
        cqr.campaign_id,
        cqr.contact_id,
        cqr.qualification_met,
        cqr.qualification_score,
        cqr.created_at,
        cs.duration_sec
      FROM call_quality_records cqr
      JOIN call_sessions cs ON cs.id = cqr.call_session_id
      WHERE cqr.created_at >= NOW() - INTERVAL '7 days'
        AND cs.duration_sec > 40
    )
    SELECT
      COUNT(*)::int AS total_analyzed_calls,
      SUM(CASE WHEN qualification_met = TRUE THEN 1 ELSE 0 END)::int AS qualified_calls,
      SUM(CASE WHEN qualification_met = FALSE THEN 1 ELSE 0 END)::int AS not_qualified_calls,
      SUM(CASE WHEN qualification_met IS NULL THEN 1 ELSE 0 END)::int AS unknown_calls
    FROM base;
  `);
  const t = totals.rows?.[0] || {};
  console.log('\nTotals:');
  console.log('  analyzed calls (>40s):', t.total_analyzed_calls ?? 0);
  console.log('  qualified (qualification_met=true):', t.qualified_calls ?? 0);
  console.log('  not qualified:', t.not_qualified_calls ?? 0);
  console.log('  unknown qualification:', t.unknown_calls ?? 0);

  const byCampaign = await db.execute(sql`
    WITH base AS (
      SELECT
        cqr.dialer_call_attempt_id,
        cqr.campaign_id,
        cqr.qualification_met
      FROM call_quality_records cqr
      JOIN call_sessions cs ON cs.id = cqr.call_session_id
      WHERE cqr.created_at >= NOW() - INTERVAL '7 days'
        AND cs.duration_sec > 40
    )
    SELECT
      b.campaign_id,
      camp.name AS campaign_name,
      camp.success_criteria,
      COUNT(*)::int AS total_calls,
      SUM(CASE WHEN b.qualification_met = TRUE THEN 1 ELSE 0 END)::int AS qualified_calls
    FROM base b
    LEFT JOIN campaigns camp ON camp.id = b.campaign_id
    GROUP BY b.campaign_id, camp.name, camp.success_criteria
    ORDER BY qualified_calls DESC, total_calls DESC
    LIMIT 50;
  `);

  console.log('\nQualified calls by campaign (top 50):');
  byCampaign.rows?.forEach(r => {
    console.log('  -', r.campaign_name ?? r.campaign_id ?? 'unknown', '| qualified:', r.qualified_calls, '| total:', r.total_calls);
  });

  const missingLeads = await db.execute(sql`
    WITH base AS (
      SELECT
        cqr.dialer_call_attempt_id,
        cqr.campaign_id,
        cqr.contact_id,
        cqr.created_at
      FROM call_quality_records cqr
      JOIN call_sessions cs ON cs.id = cqr.call_session_id
      WHERE cqr.created_at >= NOW() - INTERVAL '7 days'
        AND cs.duration_sec > 40
        AND cqr.qualification_met = TRUE
        AND cqr.dialer_call_attempt_id IS NOT NULL
    )
    SELECT COUNT(*)::int AS count
    FROM base b
    LEFT JOIN leads l ON l.call_attempt_id = b.dialer_call_attempt_id
    WHERE l.id IS NULL;
  `);
  console.log('\nQualified calls (>40s) with missing leads:', missingLeads.rows?.[0]?.count ?? 0);

  const sample = await db.execute(sql`
    WITH base AS (
      SELECT
        cqr.call_session_id,
        cqr.dialer_call_attempt_id,
        cqr.campaign_id,
        cqr.contact_id,
        cqr.qualification_score,
        cqr.created_at,
        cs.duration_sec
      FROM call_quality_records cqr
      JOIN call_sessions cs ON cs.id = cqr.call_session_id
      WHERE cqr.created_at >= NOW() - INTERVAL '7 days'
        AND cs.duration_sec > 40
        AND cqr.qualification_met = TRUE
    )
    SELECT
      b.call_session_id,
      b.dialer_call_attempt_id,
      b.campaign_id,
      camp.name AS campaign_name,
      b.contact_id,
      c.full_name AS contact_name,
      b.duration_sec,
      b.qualification_score,
      b.created_at
    FROM base b
    LEFT JOIN campaigns camp ON camp.id = b.campaign_id
    LEFT JOIN contacts c ON c.id = b.contact_id
    ORDER BY b.created_at DESC
    LIMIT 20;
  `);

  if (sample.rows?.length) {
    console.log('\nSample qualified calls (>40s):');
    sample.rows.forEach(r => {
      console.log('  -', r.call_session_id?.slice(0, 8), '|', r.contact_name ?? 'unknown', '|', r.campaign_name ?? 'unknown', '| dur:', r.duration_sec, '| score:', r.qualification_score ?? 'n/a');
    });
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
