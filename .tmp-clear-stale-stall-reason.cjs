require("dotenv").config();
const { Pool } = require("pg");

(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const q = await client.query(`
      UPDATE campaigns
      SET last_stall_reason = NULL,
          last_stall_reason_at = NULL,
          updated_at = NOW()
      WHERE dial_mode = 'ai_agent'
        AND status = 'active'
        AND last_stall_reason ILIKE '%Call execution disabled%'
      RETURNING id, name, status
    `);
    console.log(`Cleared stale stall reason on ${q.rowCount} active campaign(s).`);
    if (q.rowCount) console.table(q.rows);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
