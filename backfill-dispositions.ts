import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkBackfillOptions() {
  console.log('========================================');
  console.log('BACKFILL OPTIONS FOR NULL DISPOSITIONS');
  console.log('========================================\n');

  // Check call_sessions with dispositions
  const callSessionsWithDisp = await db.execute(sql`
    SELECT
      ai_disposition,
      COUNT(*) as count
    FROM call_sessions
    WHERE created_at > NOW() - INTERVAL '7 days'
      AND agent_type = 'ai'
    GROUP BY ai_disposition
    ORDER BY count DESC
  `);

  console.log('Call Sessions (AI) - Dispositions Recorded:');
  console.log('--------------------------------------------');
  for (const row of callSessionsWithDisp.rows) {
    const r = row as any;
    console.log(`  ai_disposition=${r.ai_disposition || 'NULL'}: ${r.count}`);
  }

  // Check if call_sessions can link to dialer_call_attempts
  const matchableRecords = await db.execute(sql`
    SELECT COUNT(*) as total
    FROM call_sessions cs
    WHERE cs.created_at > NOW() - INTERVAL '7 days'
      AND cs.agent_type = 'ai'
      AND cs.ai_disposition IS NOT NULL
      AND cs.queue_item_id IS NOT NULL
  `);
  console.log('\nCall sessions with disposition + queue_item_id: ' + (matchableRecords.rows[0] as any)?.total);

  // Check NULL disposition attempts that might be matchable via queue_item_id
  const nullAttemptsViaQueue = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM dialer_call_attempts dca
    INNER JOIN call_sessions cs ON cs.queue_item_id = dca.queue_item_id
    WHERE dca.disposition IS NULL
      AND cs.ai_disposition IS NOT NULL
  `);
  console.log('Backfillable via queue_item_id match: ' + (nullAttemptsViaQueue.rows[0] as any)?.count);

  // Try contact_id + time window match
  const backfillableViaContact = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM dialer_call_attempts dca
    INNER JOIN call_sessions cs ON cs.contact_id = dca.contact_id
      AND cs.created_at BETWEEN dca.created_at - INTERVAL '5 minutes' AND dca.created_at + INTERVAL '30 minutes'
    WHERE dca.disposition IS NULL
      AND cs.ai_disposition IS NOT NULL
  `);
  console.log('Backfillable via contact_id + time match: ' + (backfillableViaContact.rows[0] as any)?.count);

  // Check campaign_queue status for clues
  const queueStatusForNull = await db.execute(sql`
    SELECT
      cq.status,
      cq.removed_reason,
      COUNT(*) as count
    FROM dialer_call_attempts dca
    INNER JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    WHERE dca.disposition IS NULL
    GROUP BY cq.status, cq.removed_reason
    ORDER BY count DESC
  `);

  console.log('\nCampaign Queue Status for NULL disposition attempts:');
  console.log('----------------------------------------------------');
  for (const row of queueStatusForNull.rows) {
    const r = row as any;
    console.log(`  status=${r.status || 'NULL'} / reason=${r.removed_reason || 'NULL'}: ${r.count}`);
  }

  // Sample some NULL dispositions to understand what data we have
  const sampleNulls = await db.execute(sql`
    SELECT
      dca.id,
      dca.contact_id,
      dca.queue_item_id,
      dca.call_duration_seconds,
      dca.connected,
      dca.voicemail_detected,
      dca.created_at,
      cq.status as queue_status,
      cq.removed_reason,
      cs.ai_disposition as session_disp,
      cs.duration_sec as session_duration
    FROM dialer_call_attempts dca
    LEFT JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    LEFT JOIN call_sessions cs ON cs.queue_item_id = dca.queue_item_id
    WHERE dca.disposition IS NULL
    ORDER BY dca.created_at DESC
    LIMIT 20
  `);

  console.log('\nSample NULL disposition records:');
  console.log('--------------------------------');
  for (const row of sampleNulls.rows) {
    const r = row as any;
    console.log(`  attempt=${r.id?.substring(0,8)}... queue_status=${r.queue_status} reason=${r.removed_reason} connected=${r.connected} voicemail=${r.voicemail_detected} duration=${r.call_duration_seconds}s session_disp=${r.session_disp || 'NO_SESSION'}`);
  }

  process.exit(0);
}

checkBackfillOptions().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
