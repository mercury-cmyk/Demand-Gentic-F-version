import { readFileSync } from 'fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import '../server/env';

neonConfig.webSocketConstructor = ws;

function resolveDatabaseUrl(): string {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();

  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return process.env.REPLIT_PRODUCTION_DATABASE_URL || '';
  }

  if (nodeEnv === 'production') {
    return process.env.DATABASE_URL_PROD || process.env.DATABASE_URL || '';
  }

  return process.env.DATABASE_URL_DEV || process.env.DATABASE_URL || '';
}

const migrationFile = process.argv[2];
const databaseUrl = resolveDatabaseUrl();

if (!migrationFile) {
  console.error('Usage: npx tsx scripts/run-migration.ts <migration-file>');
  console.error('Example: npx tsx scripts/run-migration.ts server/migrations/013_client_portal_enhanced.sql');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('Database URL is required. Set DATABASE_URL_DEV or DATABASE_URL.');
  process.exit(1);
}

async function runMigration() {
  const pool = new Pool({ connectionString: databaseUrl });

  console.log(`Reading migration file: ${migrationFile}`);
  const migrationSql = readFileSync(migrationFile, 'utf-8');

  console.log('Running migration...');
  console.log('Database:', databaseUrl.match(/ep-[^.]+/)?.[0] || 'unknown');

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
