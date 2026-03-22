import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Find mailbox accounts
  console.log('=== MAILBOX ACCOUNTS ===');
  const accounts = await db.execute(sql`SELECT * FROM mailbox_accounts LIMIT 10`);
  for (const row of accounts.rows) {
    const r = row as any;
    console.log(`  ID: ${r.id}`);
    console.log(`    Email: ${r.mailbox_email} | Provider: ${r.provider} | Default: ${r.is_default}`);
    console.log(`    User: ${r.user_id} | Sync: ${r.sync_status} | Last: ${r.last_synced_at}`);
    console.log('');
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });