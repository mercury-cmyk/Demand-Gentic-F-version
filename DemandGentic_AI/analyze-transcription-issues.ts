import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';

async function run() {
  console.log('LEADS QA/TRANSCRIPTION ANALYSIS (last 7 days)');
  const window = await db.execute(sql`
    SELECT NOW() - INTERVAL '7 days' AS start_time, NOW() AS end_time
  `);
  const startTime = window.rows?.[0]?.start_time;
  const endTime = window.rows?.[0]?.end_time;
  console.log('Window:', startTime, '?', endTime);

  const failedTranscription = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM leads
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND deleted_at IS NULL
      AND transcription_status = 'failed'
  `);

  const missingAiQa = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM leads
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND deleted_at IS NULL
      AND (ai_analysis IS NULL OR qa_data IS NULL)
  `);

  const missingStructured = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM leads
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND deleted_at IS NULL
      AND structured_transcript IS NULL
  `);

  const longNoTranscript = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM leads
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND deleted_at IS NULL
      AND call_duration > 45
      AND transcript IS NULL
  `);

  console.log('\nCounts:');
  console.log('  transcription_status = failed:', failedTranscription.rows?.[0]?.count ?? 0);
  console.log('  ai_analysis or qa_data missing:', missingAiQa.rows?.[0]?.count ?? 0);
  console.log('  structured_transcript missing:', missingStructured.rows?.[0]?.count ?? 0);
  console.log('  call_duration > 45s and transcript missing:', longNoTranscript.rows?.[0]?.count ?? 0);

  const sample = await db.execute(sql`
    SELECT
      id,
      contact_name,
      campaign_id,
      call_duration,
      transcription_status,
      (transcript IS NULL) AS transcript_missing,
      (structured_transcript IS NULL) AS structured_missing,
      (ai_analysis IS NULL) AS ai_analysis_missing,
      (qa_data IS NULL) AS qa_data_missing,
      created_at
    FROM leads
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND deleted_at IS NULL
      AND (
        transcription_status = 'failed'
        OR ai_analysis IS NULL
        OR qa_data IS NULL
        OR structured_transcript IS NULL
        OR (call_duration > 45 AND transcript IS NULL)
      )
    ORDER BY created_at DESC
    LIMIT 20
  `);

  if (sample.rows?.length) {
    console.log('\nSample (up to 20):');
    sample.rows.forEach(r => {
      console.log(
        '  -',
        r.id?.slice(0, 8),
        '|',
        r.contact_name ?? 'unknown',
        '| dur:',
        r.call_duration ?? 'n/a',
        '| ts:',
        r.transcription_status ?? 'null',
        '| missing:',
        `t=${r.transcript_missing}, st=${r.structured_missing}, ai=${r.ai_analysis_missing}, qa=${r.qa_data_missing}`
      );
    });
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});