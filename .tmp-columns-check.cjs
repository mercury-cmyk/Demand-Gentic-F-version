require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const cols = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='dialer_call_attempts'
      ORDER BY ordinal_position
    `);
    console.log('DIALER_CALL_ATTEMPTS_COLUMNS');
    console.table(cols.rows);

    const csCols = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='call_sessions'
      ORDER BY ordinal_position
    `);
    console.log('CALL_SESSIONS_COLUMNS');
    console.table(csCols.rows);

    const hasDirection = csCols.rows.some(r => r.column_name === 'direction');
    console.log('CALL_SESSIONS_HAS_DIRECTION', hasDirection);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
