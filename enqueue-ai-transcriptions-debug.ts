import { Queue } from 'bullmq';
import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';
import { getRedisConnectionAsync } from './server/lib/queue';

const startUtc = '2026-01-29 00:00:00+00';
const endUtc = '2026-02-01 00:00:00+00';
const TRANSCRIPT_MARKER = '[Call Transcript]';
const limit = Number(process.argv[2] || 10);

async function run() {
  console.log(`DEBUG ENQUEUE AI CALL TRANSCRIPTIONS (UTC 2026-01-29 to 2026-01-31) | limit=${limit}`);

  const connection = await getRedisConnectionAsync();
  if (!connection) {
    console.error('[Enqueue] Redis connection unavailable.');
    process.exitCode = 1;
    return;
  }

  const queue = new Queue('auto-recording-sync', { connection });

  const rows = await db.execute(sql`
    SELECT
      dca.id AS call_attempt_id,
      dca.created_at,
      dca.telnyx_call_id,
      dca.phone_dialed,
      dca.recording_url,
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
    LIMIT ${limit}
  `);

  const batch = rows.rows || [];
  console.log(`Found ${batch.length} eligible attempts`);

  for (const row of batch) {
    const hasTranscript = (row.notes || '').includes(TRANSCRIPT_MARKER);
    console.log(
      'Attempt',
      row.call_attempt_id,
      '| created_at', row.created_at,
      '| telnyx', row.telnyx_call_id || 'null',
      '| dialed', row.phone_dialed || 'null',
      '| recording_url', row.recording_url || 'null',
      '| hasTranscript', hasTranscript
    );
  }

  if (batch.length === 0) {
    await queue.close();
    await connection.quit();
    return;
  }

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

  await queue.addBulk(jobs);
  console.log(`Enqueued ${jobs.length} jobs.`);

  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  console.log('Queue counts:', counts);

  await queue.close();
  await connection.quit();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
