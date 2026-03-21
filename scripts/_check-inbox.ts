import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Find tables that might store secrets/keys/config
  console.log('=== TABLES WITH SECRET/KEY/CONFIG ===');
  const secretTables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name ILIKE '%secret%' OR table_name ILIKE '%key%' OR table_name ILIKE '%config%' OR table_name ILIKE '%setting%' OR table_name ILIKE '%credential%' OR table_name ILIKE '%brevo%' OR table_name ILIKE '%api_key%')`);
  for (const row of secretTables.rows) {
    console.log(`  ${(row as any).table_name}`);
  }

  // Check for pipeline inbox config
  console.log('\n=== PIPELINE INBOX / EMAIL INBOX ===');
  const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name ILIKE '%inbox%' OR table_name ILIKE '%pipeline_email%' OR table_name ILIKE '%email_account%' OR table_name ILIKE '%email_config%')`);
  for (const row of tables.rows) {
    console.log(`  Table: ${(row as any).table_name}`);
  }

  // Also check smtp_providers for any pipeline inbox
  console.log('\n=== SMTP PROVIDERS ===');
  const providers = await db.execute(sql`SELECT id, name, email_address, is_active, is_default, auth_type, verification_status FROM smtp_providers`);
  for (const row of providers.rows) {
    const r = row as any;
    console.log(`  ${r.name} | ${r.email_address} | active=${r.is_active} | default=${r.is_default} | auth=${r.auth_type} | status=${r.verification_status}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
