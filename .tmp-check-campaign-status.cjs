require("dotenv").config();
const { Pool } = require("pg");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL missing");
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const q = await pool.query("select id,name,status,dial_mode,last_stall_reason,last_stall_reason_at from campaigns where dial_mode='ai_agent' order by updated_at desc limit 10");
  console.table(q.rows);
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
