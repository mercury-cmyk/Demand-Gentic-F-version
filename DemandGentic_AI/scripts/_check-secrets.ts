import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Get secret_store columns
  console.log('=== SECRET STORE COLUMNS ===');
  const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='secret_store' ORDER BY ordinal_position`);
  for (const row of cols.rows) {
    console.log(`  ${(row as any).column_name}`);
  }

  // Get email_provider_config columns
  console.log('\n=== EMAIL PROVIDER CONFIG COLUMNS ===');
  const epCols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='email_provider_config' ORDER BY ordinal_position`);
  for (const row of epCols.rows) {
    console.log(`  ${(row as any).column_name}`);
  }

  // Get all rows from secret_store (just names, not values)
  console.log('\n=== SECRET STORE - ALL ENTRIES ===');
  const allSecrets = await db.execute(sql`SELECT * FROM secret_store LIMIT 20`);
  for (const row of allSecrets.rows) {
    const r = row as any;
    const keys = Object.keys(r);
    const nameCol = keys.find(k => k.includes('name') || k.includes('key') || k === 'id') || keys[0];
    console.log(`  ${nameCol}=${r[nameCol]}  | columns: ${keys.join(', ')}`);
  }

  // email_provider_config
  console.log('\n=== EMAIL PROVIDER CONFIG ===');
  const configs = await db.execute(sql`SELECT * FROM email_provider_config LIMIT 5`);
  for (const row of configs.rows) {
    console.log(JSON.stringify(row, null, 2));
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });