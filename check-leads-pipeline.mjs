import pg from "pg";
const pool = new pg.Pool({ connectionString: "postgresql://neondb_owner:npg_ZUebJ2hB5FOw@ep-shy-sound-ai9ezw1k-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require" });

// Check recent call attempts - do they have durations set?
const res = await pool.query(`SELECT id, disposition, disposition_processed, call_duration_seconds, agent_type, created_at
  FROM dialer_call_attempts WHERE created_at > NOW() - INTERVAL '3 days' ORDER BY created_at DESC LIMIT 20`);
console.log("Recent call attempts:");
for (const r of res.rows) console.log(JSON.stringify(r));

// Check recent leads
const leads = await pool.query(`SELECT id, campaign_id, contact_name, call_duration, created_at
  FROM leads WHERE created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 10`);
console.log("\nRecent leads:");
for (const l of leads.rows) console.log(JSON.stringify(l));

// Check dispositions vs durations for recent calls
const stats = await pool.query(`SELECT disposition, COUNT(*)::int as cnt,
  AVG(call_duration_seconds)::int as avg_dur,
  COUNT(CASE WHEN call_duration_seconds IS NULL OR call_duration_seconds = 0 THEN 1 END)::int as zero_dur
  FROM dialer_call_attempts WHERE created_at > NOW() - INTERVAL '3 days' GROUP BY disposition ORDER BY cnt DESC`);
console.log("\nDisposition stats (last 3 days):");
for (const s of stats.rows) console.log(JSON.stringify(s));

// Check unprocessed call attempts
const unprocessed = await pool.query(`SELECT COUNT(*)::int as cnt FROM dialer_call_attempts WHERE disposition_processed = false AND created_at > NOW() - INTERVAL '7 days'`);
console.log("\nUnprocessed call attempts (last 7 days):", unprocessed.rows[0]);

// Check if any qualified leads were downgraded
const downgraded = await pool.query(`SELECT id, disposition, call_duration_seconds, created_at
  FROM dialer_call_attempts
  WHERE disposition IN ('qualified_lead', 'callback_requested')
  AND created_at > NOW() - INTERVAL '7 days'
  ORDER BY created_at DESC LIMIT 20`);
console.log("\nQualified/callback attempts (last 7 days):");
for (const d of downgraded.rows) console.log(JSON.stringify(d));

// Check call_sessions for SIP calls
const sipSessions = await pool.query(`SELECT id, ai_disposition, duration_sec, sip_hangup_cause, created_at
  FROM call_sessions
  WHERE created_at > NOW() - INTERVAL '3 days'
  ORDER BY created_at DESC LIMIT 20`);
console.log("\nRecent call sessions:");
for (const s of sipSessions.rows) console.log(JSON.stringify(s));

await pool.end();
