import { pool } from "./server/db";

async function checkGrayDetails() {
  const result = await pool.query(`
    SELECT 
      l.id,
      l.contact_name,
      l.account_name,
      l.dialed_number,
      l.call_duration,
      l.transcript,
      l.ai_score,
      l.ai_qualification_status,
      l.ai_analysis,
      l.created_at
    FROM leads l
    WHERE l.contact_name ILIKE '%gray%'
      AND l.updated_at >= '2026-01-15'
    ORDER BY l.updated_at DESC
    LIMIT 5
  `);

  console.log(JSON.stringify(result.rows, null, 2));
  process.exit(0);
}

checkGrayDetails().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
