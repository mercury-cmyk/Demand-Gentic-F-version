import { readFileSync } from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/run-sql-file.ts <path-to-sql-file>');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Aborting.');
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
