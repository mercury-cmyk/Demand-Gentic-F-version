import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';

async function run() {
  console.log('CALLS REPORT (last 7 days)');
  const window = await db.execute(sql`
    SELECT NOW() - INTERVAL '7 days' AS start_time, NOW() AS end_time
  `);
  const startTime = window.rows?.[0]?.start_time;
  const endTime = window.rows?.[0]?.end_time;
  console.log('Window:', startTime, '?', endTime);

  const totals = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM calls WHERE created_at >= NOW() - INTERVAL '7 days') AS legacy_calls,
      (SELECT COUNT(*)::int FROM dialer_call_attempts WHERE created_at >= NOW() - INTERVAL '7 days') AS dialer_attempts,
      (SELECT COUNT(*)::int FROM leads WHERE created_at >= NOW() - INTERVAL '7 days' AND deleted_at IS NULL) AS leads
  `);
  const t = totals.rows?.[0] || {};
  console.log('\nTotals:');
  console.log('  legacy calls (calls table):', t.legacy_calls ?? 0);
  console.log('  dialer call attempts:', t.dialer_attempts ?? 0);
  console.log('  leads created:', t.leads ?? 0);

  const attemptsByAgent = await db.execute(sql`
    SELECT agent_type, COUNT(*)::int AS count
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY agent_type
    ORDER BY count DESC
  `);
  console.log('\nDialer attempts by agent_type:');
  attemptsByAgent.rows?.forEach(r => console.log('  ', r.agent_type, ':', r.count));

  const attemptsByDisposition = await db.execute(sql`
    SELECT disposition, COUNT(*)::int AS count
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY disposition
    ORDER BY count DESC
  `);
  console.log('\nDialer attempts by disposition:');
  attemptsByDisposition.rows?.forEach(r => console.log('  ', r.disposition ?? 'null', ':', r.count));

  const attemptGaps = await db.execute(sql`
    SELECT
      SUM(CASE WHEN disposition IS NULL THEN 1 ELSE 0 END)::int AS missing_disposition,
      SUM(CASE WHEN recording_url IS NULL THEN 1 ELSE 0 END)::int AS missing_recording_url,
      SUM(CASE WHEN telnyx_call_id IS NULL THEN 1 ELSE 0 END)::int AS missing_telnyx_call_id,
      SUM(CASE WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN 1 ELSE 0 END)::int AS missing_duration,
      SUM(CASE WHEN disposition_processed = FALSE AND disposition IS NOT NULL THEN 1 ELSE 0 END)::int AS unprocessed_disposition
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '7 days'
  `);
  const g = attemptGaps.rows?.[0] || {};
  console.log('\nDialer attempt gaps:');
  console.log('  missing disposition:', g.missing_disposition ?? 0);
  console.log('  missing recording_url:', g.missing_recording_url ?? 0);
  console.log('  missing telnyx_call_id:', g.missing_telnyx_call_id ?? 0);
  console.log('  missing duration:', g.missing_duration ?? 0);
  console.log('  disposition not processed:', g.unprocessed_disposition ?? 0);

  const leadLinkage = await db.execute(sql`
    SELECT
      SUM(CASE WHEN call_attempt_id IS NOT NULL THEN 1 ELSE 0 END)::int AS leads_with_call_attempt,
      SUM(CASE WHEN call_attempt_id IS NULL THEN 1 ELSE 0 END)::int AS leads_without_call_attempt
    FROM leads
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND deleted_at IS NULL
  `);
  const l = leadLinkage.rows?.[0] || {};
  console.log('\nLead linkage:');
  console.log('  leads with call_attempt_id:', l.leads_with_call_attempt ?? 0);
  console.log('  leads without call_attempt_id:', l.leads_without_call_attempt ?? 0);

  const missingQualifiedLeads = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.created_at >= NOW() - INTERVAL '7 days'
      AND dca.disposition = 'qualified_lead'
      AND l.id IS NULL
  `);
  console.log('\nQualified attempts without leads:', missingQualifiedLeads.rows?.[0]?.count ?? 0);

  const transcriptionIssues = await db.execute(sql`
    SELECT
      SUM(CASE WHEN transcription_status = 'failed' THEN 1 ELSE 0 END)::int AS transcription_failed,
      SUM(CASE WHEN ai_analysis IS NULL OR qa_data IS NULL THEN 1 ELSE 0 END)::int AS ai_or_qa_missing,
      SUM(CASE WHEN structured_transcript IS NULL THEN 1 ELSE 0 END)::int AS structured_missing,
      SUM(CASE WHEN call_duration > 45 AND transcript IS NULL THEN 1 ELSE 0 END)::int AS long_no_transcript
    FROM leads
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND deleted_at IS NULL
  `);
  const ti = transcriptionIssues.rows?.[0] || {};
  console.log('\nTranscription/analysis issues (leads, last 7 days):');
  console.log('  transcription_status=failed:', ti.transcription_failed ?? 0);
  console.log('  ai_analysis or qa_data missing:', ti.ai_or_qa_missing ?? 0);
  console.log('  structured_transcript missing:', ti.structured_missing ?? 0);
  console.log('  call_duration > 45s and transcript missing:', ti.long_no_transcript ?? 0);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});