import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Get secret names and services - look for brevo
  const secrets = await db.execute(sql`SELECT name, service, description, is_active FROM secret_store ORDER BY name`);
  for (const row of secrets.rows) {
    const r = row as any;
    console.log(`  ${r.name} | service=${r.service} | active=${r.is_active} | ${r.description || ''}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });