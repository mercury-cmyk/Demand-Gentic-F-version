require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const tables = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname='public' AND tablename ILIKE 'dialer%'
      ORDER BY tablename
    `);
    console.log('DIALER_TABLES');
    console.table(tables.rows);

    const hasRuns = tables.rows.some(r => r.tablename === 'dialer_runs');
    if (hasRuns) {
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='dialer_runs'
        ORDER BY ordinal_position
      `);
      console.log('DIALER_RUNS_COLUMNS');
      console.table(cols.rows);

      const runs = await client.query(`
        SELECT *
        FROM dialer_runs
        WHERE campaign_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, ['70434f6e-3ab6-49e4-acf7-350b81f60ea2']);
      console.log('LATEST_DIALER_RUNS_FOR_UKEF');
      console.table(runs.rows);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{console.error(e);process.exit(1);});
