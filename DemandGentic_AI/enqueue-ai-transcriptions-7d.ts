import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';
import { autoRecordingSyncQueue } from './server/lib/auto-recording-sync-queue';

const TRANSCRIPT_MARKER = '[Call Transcript]';

async function run() {
  console.log('ENQUEUE AI CALL TRANSCRIPTIONS (last 7 days)');

  if (!autoRecordingSyncQueue) {
    console.error('[Enqueue] Redis not configured; auto-recording-sync queue unavailable.');
    process.exitCode = 1;
    return;
  }

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
    WHERE dca.created_at >= NOW() - INTERVAL '7 days'
      AND dca.agent_type = 'ai'
      AND (dca.telnyx_call_id IS NOT NULL OR dca.phone_dialed IS NOT NULL)
      AND (dca.notes IS NULL OR dca.notes NOT LIKE ${'%' + TRANSCRIPT_MARKER + '%'})
    ORDER BY dca.created_at DESC
  `);

  const total = rows.rows?.length || 0;
  let enqueued = 0;

  const batchSize = 250;
  for (let i = 0; i  ({
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
      await autoRecordingSyncQueue.addBulk(jobs);
      enqueued += jobs.length;
      console.log(`Enqueued ${enqueued}/${total}...`);
    }
  }

  console.log('\nResults:');
  console.log('  total AI call attempts (7d) eligible:', total);
  console.log('  enqueued for transcription:', enqueued);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});