import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' LIMIT 40`);
  console.log('Leads columns:', cols.rows.map((r: any) => r.column_name));
  process.exit(0);
}
main();
