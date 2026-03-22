/**
 * Migration: Create client_mailbox_accounts table
 * Run with: npx tsx scripts/create-client-mailbox-table.ts
 */
import '../server/env';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws as any;

async function main() {
  const dbUrl = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('No DATABASE_URL found');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });

  console.log('Creating client_mailbox_accounts table...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_mailbox_accounts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      client_account_id VARCHAR NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
      client_user_id VARCHAR NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
      provider VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'disconnected',
      mailbox_email VARCHAR(320),
      display_name VARCHAR(255),
      connected_at TIMESTAMPTZ,
      last_sync_at TIMESTAMPTZ,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMPTZ,
      encrypted_tokens TEXT,
      smtp_config JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log('Creating indexes...');

  await pool.query(`
    CREATE INDEX IF NOT EXISTS client_mailbox_client_account_idx 
      ON client_mailbox_accounts (client_account_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS client_mailbox_client_user_idx 
      ON client_mailbox_accounts (client_user_id, provider);
  `);

  console.log('Done! client_mailbox_accounts table created successfully.');

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});