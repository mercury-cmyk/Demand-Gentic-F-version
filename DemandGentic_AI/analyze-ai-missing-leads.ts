import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';

const targetDate = process.argv[2] ?? '2026-01-30'; // default to last Friday based on current date
const dateStart = `${targetDate} 00:00:00`;
const dateEnd = `${targetDate} 23:59:59.999`;

async function run() {
  console.log(`AI QUALIFIED CALLS WITHOUT LEADS (campaigns on ${targetDate})`);

  const summary = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dialer_call_attempts dca
    JOIN dialer_runs dr ON dr.id = dca.dialer_run_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.agent_type = 'ai'
      AND dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND COALESCE(dr.started_at, dr.created_at) BETWEEN ${dateStart} AND ${dateEnd}
  `);
  const total = summary.rows?.[0]?.count ?? 0;
  console.log('Missing AI leads:', total);

  const samples = await db.execute(sql`
    SELECT
      dca.id AS call_attempt_id,
      dca.contact_id,
      dca.campaign_id,
      dca.created_at,
      dca.call_duration_seconds,
      dr.id AS dialer_run_id,
      dr.started_at,
      c.full_name AS contact_name,
      camp.name AS campaign_name
    FROM dialer_call_attempts dca
    JOIN dialer_runs dr ON dr.id = dca.dialer_run_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN campaigns camp ON camp.id = dca.campaign_id
    WHERE dca.agent_type = 'ai'
      AND dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND COALESCE(dr.started_at, dr.created_at) BETWEEN ${dateStart} AND ${dateEnd}
    ORDER BY dca.created_at DESC
    LIMIT 20
  `);

  if (samples.rows?.length) {
    console.log('\nSamples:');
    samples.rows.forEach(r => {
      console.log('  -', r.call_attempt_id?.slice(0, 8), '|', r.contact_name ?? 'unknown', '|', r.campaign_name ?? 'unknown', '|', r.call_duration_seconds, 'sec');
    });
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});