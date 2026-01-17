import { readFileSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { config } from 'dotenv';
import ws from 'ws';

// Load environment variables
config({ path: '.env.local' });

neonConfig.webSocketConstructor = ws;

const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: npx tsx scripts/run-migration.ts <migration-file>');
  console.error('Example: npx tsx scripts/run-migration.ts server/migrations/013_client_portal_enhanced.sql');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

async function runMigration() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log(`Reading migration file: ${migrationFile}`);
  const migrationSql = readFileSync(migrationFile, 'utf-8');

  console.log('Running migration...');
  console.log('Database:', process.env.DATABASE_URL?.match(/ep-[^.]+/)?.[0] || 'unknown');

  const client = await pool.connect();

  try {
    await client.query(migrationSql);
    console.log('Migration completed successfully!');
  } catch (error: any) {
    console.error('Migration failed:', error.message);
    if (error.detail) console.error('Detail:', error.detail);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
