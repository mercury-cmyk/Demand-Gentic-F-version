import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.execute(sql`SELECT id, name, dial_mode, status FROM campaigns WHERE dial_mode = 'ai_agent' LIMIT 10`);
  console.log('=== AI AGENT CAMPAIGNS ===');
  console.table(result.rows);
  process.exit(0);
}
main();
