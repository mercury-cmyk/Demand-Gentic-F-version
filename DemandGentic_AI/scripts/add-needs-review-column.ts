import '../server/env';
import pg from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('No DATABASE_URL_DEV or DATABASE_URL set');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  try {
    await pool.query('ALTER TABLE dialer_runs ADD COLUMN IF NOT EXISTS needs_review INTEGER NOT NULL DEFAULT 0');
    console.log('SUCCESS: needs_review column added to dialer_runs table');
  } catch (e: any) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();