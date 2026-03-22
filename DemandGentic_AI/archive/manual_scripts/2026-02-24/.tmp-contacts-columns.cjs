require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const cols = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='contacts'
      ORDER BY ordinal_position
    `);
    console.log('CONTACT_COLUMNS');
    console.table(cols.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch((e)=>{console.error(e);process.exit(1);});