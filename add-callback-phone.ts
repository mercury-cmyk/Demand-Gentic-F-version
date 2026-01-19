import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Adding callback_phone column to users table...');
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS callback_phone VARCHAR(50)`);
  console.log('Done!');
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
