import { Queue } from 'bullmq';
import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';
import { getRedisConnectionAsync } from './server/lib/queue';

const TRANSCRIPT_MARKER = '[Call Transcript]';
const startUtc = '2026-01-29 00:00:00+00';
const endUtc = '2026-02-01 00:00:00+00'; // exclusive

async function run() {
  console.log('ENQUEUE AI CALL TRANSCRIPTIONS (UTC 2026-01-29 to 2026-01-31)');

  const connection = await getRedisConnectionAsync();
  if (!connection) {
    console.error('[Enqueue] Redis connection unavailable.');
    process.exitCode = 1;
    return;
  }

  const queue = new Queue('auto-recording-sync', { connection });

  const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dialer_call_attempts dca
    WHERE dca.created_at >= ${startUtc}
      AND dca.created_at < ${endUtc}
      AND dca.agent_type = 'ai'
      AND (dca.telnyx_call_id IS NOT NULL OR dca.phone_dialed IS NOT NULL)
      AND (dca.notes IS NULL OR dca.notes NOT LIKE ${'%' + TRANSCRIPT_MARKER + '%'})
  `);
  const total = totalResult.rows?.[0]?.count ?? 0;
  console.log('Eligible AI call attempts:', total);

  const batchSize = 500;
  let enqueued = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    const rows = await db.execute(sql`
      SELECT
        dca.id AS call_attempt_id,
        dca.telnyx_call_id,
        dca.phone_dialed,
        dca.notes,
        dca.campaign_id,
        c.first_name AS contact_first_name
      FROM dialer_call_attempts dca
      LEFT JOIN contacts c ON c.id = dca.contact_id
      WHERE dca.created_at >= ${startUtc}
        AND dca.created_at < ${endUtc}
        AND dca.agent_type = 'ai'
        AND (dca.telnyx_call_id IS NOT NULL OR dca.phone_dialed IS NOT NULL)
        AND (dca.notes IS NULL OR dca.notes NOT LIKE ${'%' + TRANSCRIPT_MARKER + '%'})
      ORDER BY dca.created_at DESC
      LIMIT ${batchSize} OFFSET ${offset}
    `);

    const batch = rows.rows || [];
    const jobs = batch.map((row: any) => ({
      name: 'fetch-and-transcribe',
      data: {
        callAttemptId: row.call_attempt_id,
        leadId: undefined,
        contactFirstName: row.contact_first_name || null,
        agentId: null,
        telnyxCallId: row.telnyx_call_id || null,
        dialedNumber: row.phone_dialed || null,
        campaignId: row.campaign_id || null,
      },
      opts: {
        jobId: `auto-sync-attempt-${row.call_attempt_id}`,
        delay: 0,
      }
    }));

    if (jobs.length > 0) {
      await queue.addBulk(jobs);
      enqueued += jobs.length;
      console.log(`Enqueued ${enqueued}/${total}...`);
    }
  }

  console.log('\nResults:');
  console.log('  enqueued for transcription:', enqueued);

  await queue.close();
  await connection.quit();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
