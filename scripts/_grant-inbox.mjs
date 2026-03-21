import pg from 'pg';
const { Pool } = pg;
const p = new Pool({ connectionString: process.env.DATABASE_URL });

const accounts = await p.query("SELECT id, company_name FROM client_accounts");
console.log(`Found ${accounts.rows.length} client accounts`);

let granted = 0;
for (const acc of accounts.rows) {
  const existing = await p.query(
    "SELECT id FROM client_permission_grants WHERE client_account_id = $1 AND feature = 'email_inbox'",
    [acc.id]
  );
  if (existing.rows.length) {
    console.log(`  ${acc.company_name}: email_inbox — already exists`);
    continue;
  }
  await p.query(`
    INSERT INTO client_permission_grants (id, client_account_id, feature, scope_type, is_enabled, granted_by, notes)
    VALUES (gen_random_uuid(), $1, 'email_inbox', 'all', true, 'da0c653b-c853-47b9-82df-de9b7b754378', 'Auto-granted: shared inbox for client portal')
  `, [acc.id]);
  granted++;
  console.log(`  ✓ ${acc.company_name}: email_inbox — GRANTED`);
}

console.log(`\nDone. Granted email_inbox to ${granted} client accounts.`);
await p.end();