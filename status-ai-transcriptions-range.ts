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
      AND dca.created_at < ${endUtc}
      AND dca.agent_type = 'ai'
  `);
  const total = totalResult.rows?.[0]?.count ?? 0;

  const withTranscript = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dialer_call_attempts dca
    WHERE dca.created_at >= ${startUtc}
      AND dca.created_at < ${endUtc}
      AND dca.agent_type = 'ai'
      AND dca.notes LIKE ${'%' + TRANSCRIPT_MARKER + '%'}
  `);

  const withRecording = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dialer_call_attempts dca
    WHERE dca.created_at >= ${startUtc}
      AND dca.created_at < ${endUtc}
      AND dca.agent_type = 'ai'
      AND dca.recording_url IS NOT NULL
  `);

  console.log('\nDB Progress:');
  console.log('  total AI attempts:', total);
  console.log('  with transcript marker:', withTranscript.rows?.[0]?.count ?? 0);
  console.log('  with recording_url:', withRecording.rows?.[0]?.count ?? 0);

  const connection = await getRedisConnectionAsync();
  if (!connection) {
    console.log('\nQueue: Redis unavailable');
    return;
  }

  const queue = new Queue('auto-recording-sync', { connection });
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

  console.log('\nQueue Status (auto-recording-sync):');
  console.log('  waiting:', counts.waiting ?? 0);
  console.log('  active:', counts.active ?? 0);
  console.log('  completed:', counts.completed ?? 0);
  console.log('  failed:', counts.failed ?? 0);
  console.log('  delayed:', counts.delayed ?? 0);

  await queue.close();
  await connection.quit();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
