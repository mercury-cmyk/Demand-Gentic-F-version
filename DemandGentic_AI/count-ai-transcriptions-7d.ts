import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';

async function run() {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dialer_call_attempts dca
    WHERE dca.created_at >= NOW() - INTERVAL '7 days'
      AND dca.agent_type = 'ai'
      AND (dca.telnyx_call_id IS NOT NULL OR dca.phone_dialed IS NOT NULL)
      AND (dca.notes IS NULL OR dca.notes NOT LIKE ${'%[Call Transcript]%'} )
  `);
  console.log('Eligible AI call attempts (7d) needing transcript:', rows.rows?.[0]?.count ?? 0);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});