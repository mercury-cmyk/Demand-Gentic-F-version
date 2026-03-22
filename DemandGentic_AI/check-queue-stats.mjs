import pg from "pg";
const pool = new pg.Pool({ connectionString: "postgresql://neondb_owner:npg_ZUebJ2hB5FOw@ep-shy-sound-ai9ezw1k-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require" });

const res = await pool.query(`SELECT id, name, dial_mode, status, type FROM campaigns WHERE status != 'draft' ORDER BY created_at DESC LIMIT 10`);
console.log("Active campaigns:");
for (const r of res.rows) console.log(JSON.stringify(r));

for (const c of res.rows.slice(0, 5)) {
  const q = await pool.query(`SELECT status, count(*)::int as cnt FROM campaign_queue WHERE campaign_id = $1 GROUP BY status`, [c.id]);
  console.log(`\nQueue for "${c.name}" (mode=${c.dial_mode}):`, q.rows);

  const aq = await pool.query(`SELECT queue_state, count(*)::int as cnt FROM agent_queue WHERE campaign_id = $1 GROUP BY queue_state`, [c.id]);
  if (aq.rows.length > 0) console.log(`  Agent queue:`, aq.rows);
}

await pool.end();