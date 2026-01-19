import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function check() {
  const cols = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'dialer_call_attempts'
    ORDER BY ordinal_position
  `);
  console.log('=== DIALER_CALL_ATTEMPTS COLUMNS ===');
  for (const c of cols.rows as any[]) {
    console.log(`  ${c.column_name}: ${c.data_type}`);
  }
  process.exit(0);
}
check().catch(console.error);
