import pg from "pg";
const pool = new pg.Pool({ connectionString: "postgresql://neondb_owner:npg_ZUebJ2hB5FOw@ep-shy-sound-ai9ezw1k-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require" });

// How many null-disposition call attempts exist by date?
const byDate = await pool.query(`
  SELECT DATE(created_at) as dt, COUNT(*)::int as total,
    COUNT(CASE WHEN disposition IS NULL THEN 1 END)::int as null_disp,
    COUNT(CASE WHEN call_duration_seconds IS NULL THEN 1 END)::int as null_dur,
    COUNT(CASE WHEN call_ended_at IS NULL THEN 1 END)::int as null_ended
  FROM dialer_call_attempts
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY 1 ORDER BY 1 DESC
`);
console.log("Call attempts by date:");
for (const r of byDate.rows) console.log(JSON.stringify(r));

// Check telnyx_call_id presence for null disposition calls
const telnyxInfo = await pool.query(`
  SELECT
    COUNT(*)::int as total_null_disp,
    COUNT(telnyx_call_id)::int as has_telnyx_id,
    COUNT(call_session_id)::int as has_session_id,
    COUNT(call_ended_at)::int as has_ended_at,
    COUNT(phone_dialed)::int as has_phone
  FROM dialer_call_attempts
  WHERE disposition IS NULL AND created_at > NOW() - INTERVAL '3 days'
`);
console.log("\nNull disposition call details:");
console.log(JSON.stringify(telnyxInfo.rows[0]));

// Sample a few null dispositions to see state
const sample = await pool.query(`
  SELECT id, telnyx_call_id, call_session_id, call_duration_seconds, call_ended_at, phone_dialed, queue_item_id, created_at
  FROM dialer_call_attempts
  WHERE disposition IS NULL AND created_at > NOW() - INTERVAL '1 day'
  ORDER BY created_at DESC LIMIT 10
`);
console.log("\nSample null-disposition attempts:");
for (const s of sample.rows) console.log(JSON.stringify(s));

// Check if these queue items are still locked
const queueLocks = await pool.query(`
  SELECT cq.status, COUNT(*)::int as cnt
  FROM dialer_call_attempts dca
  JOIN campaign_queue cq ON dca.queue_item_id = cq.id
  WHERE dca.disposition IS NULL AND dca.created_at > NOW() - INTERVAL '3 days'
  GROUP BY cq.status
`);
console.log("\nQueue item status for null-disposition attempts:");
for (const q of queueLocks.rows) console.log(JSON.stringify(q));

await pool.end();
