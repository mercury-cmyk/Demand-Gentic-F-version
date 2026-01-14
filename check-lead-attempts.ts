import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.execute(sql`SELECT id, call_attempt_id, created_at::text FROM leads ORDER BY created_at DESC LIMIT 10`);
  console.table(result.rows);
  process.exit(0);
}
main();
