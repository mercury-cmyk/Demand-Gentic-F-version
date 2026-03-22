import { Queue } from 'bullmq';
import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';
import { getRedisConnectionAsync } from './server/lib/queue';

const startUtc = '2026-01-29 00:00:00+00';
const endUtc = '2026-02-01 00:00:00+00';
const TRANSCRIPT_MARKER = '[Call Transcript]';

async function run() {
  console.log('AI TRANSCRIPTION STATUS (UTC 2026-01-29 to 2026-01-31)');

  const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dialer_call_attempts dca
    WHERE dca.created_at >= ${startUtc}
      AND dca.created_at = ${startUtc}
      AND dca.created_at = ${startUtc}
      AND dca.created_at  {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});