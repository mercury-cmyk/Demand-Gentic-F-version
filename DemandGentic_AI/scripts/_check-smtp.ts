import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.execute(sql`SELECT * FROM smtp_providers LIMIT 5`);
  console.log(JSON.stringify(result.rows, null, 2));

  // Check env vars
  console.log('\n--- ENV SMTP fallback ---');
  console.log('SMTP_HOST:', process.env.SMTP_HOST || '(not set)');
  console.log('SMTP_USER:', process.env.SMTP_USER || '(not set)');
  console.log('SMTP_PASS:', process.env.SMTP_PASS ? '***set***' : '(not set)');

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });