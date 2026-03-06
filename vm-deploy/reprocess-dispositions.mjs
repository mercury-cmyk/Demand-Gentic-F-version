import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Phase 1: Analyze calls with transcripts but no disposition
console.log("=== Phase 1: Analyze calls with transcripts but no disposition ===");

const needsDispo = await pool.query(`
  SELECT cs.id, cs.ai_transcript, cs.duration_sec
  FROM call_sessions cs
  WHERE cs.ai_disposition IS NULL
    AND cs.duration_sec >= 20
    AND cs.ai_transcript IS NOT NULL AND LENGTH(cs.ai_transcript) > 50
  ORDER BY cs.created_at DESC
`);
console.log("Found", needsDispo.rows.length, "calls needing disposition");

let updated = 0;
let errors = 0;
const dispoCount = {};

for (const row of needsDispo.rows) {
  const t = (row.ai_transcript || "").toLowerCase();
  let d = null;

  if (t.includes("voicemail") || t.includes("leave a message") || t.includes("not available") || t.includes("press 1") || t.includes("after the tone") || t.includes("after the beep")) {
    d = "voicemail";
  } else if (t.includes("do not call") || t.includes("stop calling") || t.includes("dont call") || t.includes("remove my number")) {
    d = "do_not_call";
  } else if (t.includes("not interested") || t.includes("no thanks") || t.includes("no thank you") || t.includes("no, thank")) {
    d = "not_interested";
  } else if (t.includes("call back") || t.includes("callback") || t.includes("call me back") || t.includes("try again later") || t.includes("call later")) {
    d = "callback_requested";
  } else if (t.includes("interested") || t.includes("tell me more") || t.includes("send me info") || t.includes("schedule") || t.includes("set up a meeting") || t.includes("appointment")) {
    d = "qualified_lead";
  } else if (t.includes("wrong number") || t.includes("wrong person") || t.includes("no longer") || t.includes("doesn't work here")) {
    d = "invalid_data";
  } else if (t.length < 100) {
    d = "no_answer";
  } else {
    d = "needs_review";
  }

  try {
    await pool.query(`UPDATE call_sessions SET ai_disposition = $1 WHERE id = $2`, [d, row.id]);
    updated++;
    dispoCount[d] = (dispoCount[d] || 0) + 1;
  } catch (e) {
    errors++;
  }
}

console.log("\nPhase 1 complete:", updated, "updated,", errors, "errors");
console.log("Disposition breakdown:", dispoCount);

// Phase 2: Short calls (<20s) with no transcript — mark as no_answer
console.log("\n=== Phase 2: Mark short calls (<20s) as no_answer ===");
const shortCalls = await pool.query(`
  UPDATE call_sessions
  SET ai_disposition = 'no_answer'
  WHERE ai_disposition IS NULL
    AND duration_sec < 20
    AND duration_sec > 0
  RETURNING id
`);
console.log("Marked", shortCalls.rowCount, "short calls as no_answer");

// Phase 3: Zero-duration calls — mark as no_answer
const zeroDur = await pool.query(`
  UPDATE call_sessions
  SET ai_disposition = 'no_answer'
  WHERE ai_disposition IS NULL
    AND (duration_sec IS NULL OR duration_sec = 0)
  RETURNING id
`);
console.log("Marked", zeroDur.rowCount, "zero-duration calls as no_answer");

// Final count
const remaining = await pool.query(`SELECT COUNT(*) as cnt FROM call_sessions WHERE ai_disposition IS NULL`);
console.log("\nRemaining NULL disposition:", remaining.rows[0].cnt);

const finalDist = await pool.query(`
  SELECT ai_disposition, COUNT(*) as cnt
  FROM call_sessions
  GROUP BY ai_disposition
  ORDER BY cnt DESC
`);
console.log("\n=== Final disposition distribution ===");
for (const r of finalDist.rows) {
  console.log("  " + String(r.ai_disposition || "NULL").padEnd(25) + " | " + r.cnt);
}

await pool.end();
