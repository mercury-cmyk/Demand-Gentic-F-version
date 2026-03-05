import { neon } from "@neondatabase/serverless";

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const sql = neon(databaseUrl);
  const host = new URL(databaseUrl).host;

  console.log(`DB_HOST=${host}`);

  const [attempts24h] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE disposition IS NOT NULL)::int AS with_disposition,
      COUNT(*) FILTER (WHERE disposition_processed = true)::int AS disposition_processed,
      COUNT(*) FILTER (WHERE disposition IS NOT NULL AND disposition_processed = false)::int AS disposition_pending,
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL)::int AS with_recording_url,
      COUNT(*) FILTER (WHERE (full_transcript IS NOT NULL AND LENGTH(TRIM(full_transcript)) > 0)
                       OR (ai_transcript IS NOT NULL AND LENGTH(TRIM(ai_transcript)) > 0))::int AS with_transcript
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `;

  const [attemptsSinceYesterday] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE disposition IS NOT NULL)::int AS with_disposition,
      COUNT(*) FILTER (WHERE disposition_processed = true)::int AS disposition_processed,
      COUNT(*) FILTER (WHERE disposition IS NOT NULL AND disposition_processed = false)::int AS disposition_pending,
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL)::int AS with_recording_url,
      COUNT(*) FILTER (WHERE (full_transcript IS NOT NULL AND LENGTH(TRIM(full_transcript)) > 0)
                       OR (ai_transcript IS NOT NULL AND LENGTH(TRIM(ai_transcript)) > 0))::int AS with_transcript
    FROM dialer_call_attempts
    WHERE created_at >= date_trunc('day', NOW() - INTERVAL '1 day')
  `;

  const leadBacklog = await sql`
    SELECT
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL AND (transcript IS NULL OR LENGTH(TRIM(transcript)) = 0))::int AS needs_transcription,
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL AND transcription_status = 'pending')::int AS status_pending,
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL AND transcription_status = 'processing')::int AS status_processing,
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL AND transcription_status = 'failed')::int AS status_failed,
      COUNT(*) FILTER (WHERE recording_url IS NOT NULL AND transcription_status = 'completed')::int AS status_completed
    FROM leads
    WHERE created_at >= NOW() - INTERVAL '72 hours'
  `;

  const recentDispositions = await sql`
    SELECT
      COALESCE(disposition::text, 'null') AS disposition,
      COUNT(*)::int AS count
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY COALESCE(disposition::text, 'null')
    ORDER BY count DESC
    LIMIT 12
  `;

  const recentAttemptState = await sql`
    SELECT
      CASE
        WHEN connected = false THEN 'not_connected'
        WHEN disposition_processed = true THEN 'connected_disposition_processed'
        WHEN disposition IS NOT NULL AND disposition_processed = false THEN 'connected_pending_disposition'
        ELSE 'connected_no_disposition'
      END AS attempt_state,
      COUNT(*)::int AS count
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY 1
    ORDER BY count DESC
  `;

  const recentPendingExamples = await sql`
    SELECT
      id,
      created_at,
      connected,
      disposition,
      disposition_processed,
      recording_url,
      call_duration_seconds,
      telnyx_call_id
    FROM dialer_call_attempts
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND disposition IS NOT NULL
      AND disposition_processed = false
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const [latestTranscribedLead] = await sql`
    SELECT id, created_at, transcription_status, qa_status, ai_qualification_status
    FROM leads
    WHERE transcript IS NOT NULL AND LENGTH(TRIM(transcript)) > 0
    ORDER BY updated_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;

  console.log("\n[ATTEMPTS_LAST_24H]");
  console.log(attempts24h);

  console.log("\n[ATTEMPTS_SINCE_YESTERDAY_START]");
  console.log(attemptsSinceYesterday);

  console.log("\n[LEAD_TRANSCRIPTION_BACKLOG_72H]");
  console.log(leadBacklog[0]);

  console.log("\n[DISPOSITION_BREAKDOWN_24H]");
  for (const row of recentDispositions) console.log(row);

  console.log("\n[ATTEMPT_STATE_BREAKDOWN_24H]");
  for (const row of recentAttemptState) console.log(row);

  console.log("\n[PENDING_DISPOSITION_EXAMPLES]");
  if (recentPendingExamples.length === 0) {
    console.log("none");
  } else {
    for (const row of recentPendingExamples) console.log(row);
  }

  console.log("\n[LATEST_TRANSCRIBED_LEAD]");
  console.log(latestTranscribedLead || "none");
}

run().catch((err) => {
  console.error("HEALTH_CHECK_FAILED", err);
  process.exit(1);
});
