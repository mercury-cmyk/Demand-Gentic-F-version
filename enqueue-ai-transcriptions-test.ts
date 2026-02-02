import { Queue } from 'bullmq';
import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';
import { getRedisConnectionAsync } from './server/lib/queue';

const startUtc = '2026-01-29 00:00:00+00';
const endUtc = '2026-02-01 00:00:00+00';
const TRANSCRIPT_MARKER = '[Call Transcript]';

async function run() {
  console.log('TEST enqueue 1 AI call');
  const connection = await getRedisConnectionAsync();
  console.log('redis connection:', connection ? connection.status : 'none');
  if (!connection) return;
  const queue = new Queue('auto-recording-sync', { connection });

  const rows = await db.execute(sql`
    SELECT dca.id AS call_attempt_id, dca.telnyx_call_id, dca.phone_dialed, dca.campaign_id, c.first_name AS contact_first_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at >= ${startUtc}
      AND dca.created_at < ${endUtc}
      AND dca.agent_type = 'ai'
      AND (dca.telnyx_call_id IS NOT NULL OR dca.phone_dialed IS NOT NULL)
      AND (dca.notes IS NULL OR dca.notes NOT LIKE ${'%' + TRANSCRIPT_MARKER + '%'})
    ORDER BY dca.created_at DESC
    LIMIT 1
  `);

  const row = rows.rows?.[0];
  if (!row) {
    console.log('No eligible rows');
    return;
  }

  await queue.add('fetch-and-transcribe', {
    callAttemptId: row.call_attempt_id,
    leadId: undefined,
    contactFirstName: row.contact_first_name || null,
    agentId: null,
    telnyxCallId: row.telnyx_call_id || null,
    dialedNumber: row.phone_dialed || null,
    campaignId: row.campaign_id || null,
  }, { jobId: `auto-sync-attempt-${row.call_attempt_id}` });

  console.log('Enqueued 1 job');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
