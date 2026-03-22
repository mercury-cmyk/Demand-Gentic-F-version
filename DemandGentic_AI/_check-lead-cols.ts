import "./server/env";
import { pool, db } from "./server/db";
import { sql } from "drizzle-orm";

const cols = await db.execute(sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'leads'
  AND column_name IN (
    'qa_status','verification_status','submitted_to_client','submitted_at',
    'approved_at','published_at','pm_approved_at','qa_decision',
    'rejected_reason','rejected_at','updated_at','deleted_at'
  )
  ORDER BY column_name
`);
console.log("Found columns:");
for (const c of cols.rows) console.log(" ", c.column_name);
await pool.end();