import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';

async function run() {
  const startUtc = '2026-01-29 00:00:00+00';
  const endUtc = '2026-02-01 00:00:00+00';
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dialer_call_attempts
    WHERE created_at >= ${startUtc}
      AND created_at < ${endUtc}
      AND agent_type = 'ai'
  `);
  console.log('count', r.rows?.[0]?.count ?? 0);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
