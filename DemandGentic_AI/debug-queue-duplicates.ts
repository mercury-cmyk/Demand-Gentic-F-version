import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function debugQueueDuplicates() {
  console.log('Analyzing queue and call attempts for duplicate issues...\n');

  // Check if multiple queue items exist for the same contact
  const duplicateQueueItems = await db.execute(sql`
    SELECT
      contact_id,
      campaign_id,
      COUNT(*) as queue_count,
      array_agg(id) as queue_ids,
      array_agg(status) as statuses
    FROM campaign_queue
    GROUP BY contact_id, campaign_id
    HAVING COUNT(*) > 1
    LIMIT 20
  `);

  console.log('========================================');
  console.log('DUPLICATE QUEUE ITEMS (same contact, same campaign)');
  console.log('========================================\n');
  console.log(`Found ${duplicateQueueItems.rows.length} contacts with multiple queue items\n`);

  duplicateQueueItems.rows.slice(0, 10).forEach((row: any, i) => {
    console.log(`${i+1}. Contact: ${row.contact_id}`);
    console.log(`   Queue count: ${row.queue_count}`);
    console.log(`   Statuses: ${row.statuses}`);
  });

  // Check calls with null/missing disposition
  const nullDispositionCalls = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN disposition IS NULL THEN 1 END) as null_disposition,
      COUNT(CASE WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN 1 END) as zero_duration
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
  `);

  console.log('\n========================================');
  console.log('CALLS WITH NULL/MISSING DATA (Jan 15)');
  console.log('========================================\n');

  const stats = nullDispositionCalls.rows[0] as any;
  console.log(`Total calls: ${stats.total}`);
  console.log(`Null disposition: ${stats.null_disposition} (${(stats.null_disposition / stats.total * 100).toFixed(1)}%)`);
  console.log(`Zero/null duration: ${stats.zero_duration} (${(stats.zero_duration / stats.total * 100).toFixed(1)}%)`);

  // Check queue item updates after calls
  const queueUpdateIssues = await db.execute(sql`
    SELECT
      dca.id as call_id,
      dca.queue_item_id,
      dca.disposition as call_disposition,
      dca.call_duration_seconds,
      cq.status as queue_status,
      cq.next_attempt_at,
      cq.lock_expires_at
    FROM dialer_call_attempts dca
    LEFT JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.queue_item_id IS NOT NULL
      AND (
        -- Call completed but queue still shows in_progress
        (dca.call_duration_seconds > 0 AND cq.status = 'in_progress')
        -- Or call had disposition but queue not updated
        OR (dca.disposition IS NOT NULL AND cq.status = 'queued' AND cq.next_attempt_at IS NULL)
      )
    LIMIT 20
  `);

  console.log('\n========================================');
  console.log('QUEUE UPDATE ISSUES (call done but queue not updated)');
  console.log('========================================\n');
  console.log(`Found ${queueUpdateIssues.rows.length} potential issues\n`);

  queueUpdateIssues.rows.slice(0, 10).forEach((row: any, i) => {
    console.log(`${i+1}. Call: ${row.call_id}`);
    console.log(`   Call Disposition: ${row.call_disposition}`);
    console.log(`   Call Duration: ${row.call_duration_seconds}s`);
    console.log(`   Queue Status: ${row.queue_status}`);
    console.log(`   Next Attempt At: ${row.next_attempt_at || 'NULL'}`);
    console.log('');
  });

  // Check immediate retries - what happened to the queue item?
  const immediateRetryAnalysis = await db.execute(sql`
    WITH ranked_calls AS (
      SELECT
        dca.*,
        c.email,
        c.direct_phone,
        ROW_NUMBER() OVER (PARTITION BY dca.contact_id ORDER BY dca.created_at) as call_num,
        LAG(dca.created_at) OVER (PARTITION BY dca.contact_id ORDER BY dca.created_at) as prev_call_time,
        LAG(dca.disposition) OVER (PARTITION BY dca.contact_id ORDER BY dca.created_at) as prev_disposition,
        LAG(dca.queue_item_id) OVER (PARTITION BY dca.contact_id ORDER BY dca.created_at) as prev_queue_item_id
      FROM dialer_call_attempts dca
      JOIN contacts c ON c.id = dca.contact_id
      WHERE dca.created_at::date = '2026-01-15'
    )
    SELECT
      email,
      direct_phone,
      call_num,
      created_at,
      disposition,
      queue_item_id,
      prev_call_time,
      prev_disposition,
      prev_queue_item_id,
      EXTRACT(EPOCH FROM (created_at - prev_call_time))/60 as minutes_since_prev
    FROM ranked_calls
    WHERE call_num > 1
      AND EXTRACT(EPOCH FROM (created_at - prev_call_time))/60  {
    if (row.queue_item_id === row.prev_queue_item_id && row.queue_item_id !== null) {
      sameQueueItem++;
    } else if (row.queue_item_id !== row.prev_queue_item_id && row.queue_item_id !== null && row.prev_queue_item_id !== null) {
      differentQueueItem++;
    } else {
      nullQueueItem++;
    }
  });

  console.log(`Same queue item (re-used): ${sameQueueItem}`);
  console.log(`Different queue item: ${differentQueueItem}`);
  console.log(`Null queue item: ${nullQueueItem}`);

  console.log('\nFirst 10 immediate retries:');
  immediateRetryAnalysis.rows.slice(0, 10).forEach((row: any, i) => {
    console.log(`\n${i+1}. ${row.email} (${row.direct_phone})`);
    console.log(`   Call #${row.call_num} at ${row.created_at}`);
    console.log(`   Minutes since prev: ${parseFloat(row.minutes_since_prev).toFixed(1)}`);
    console.log(`   Prev disposition: ${row.prev_disposition}`);
    console.log(`   Current disposition: ${row.disposition}`);
    console.log(`   Same queue item? ${row.queue_item_id === row.prev_queue_item_id ? 'YES' : 'NO (different or null)'}`);
  });

  process.exit(0);
}

debugQueueDuplicates().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});