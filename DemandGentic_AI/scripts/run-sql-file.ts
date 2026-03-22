import { readFileSync } from 'fs';
import path from 'path';
import pg from 'pg';
import '../server/env';

const { Pool } = pg;

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

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/run-sql-file.ts ');
    process.exit(1);
  }

  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    console.error('Database URL is not set. Aborting.');
    process.exit(1);
  }

  const absPath = path.resolve(file);
  console.log(`Executing SQL file: ${absPath}`);
  const content = readFileSync(absPath, 'utf8');

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(content);
    await client.query('COMMIT');
    console.log('✅ SQL executed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});