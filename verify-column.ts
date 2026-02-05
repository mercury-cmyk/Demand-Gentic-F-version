
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function verifyColumn() {
  const client = await pool.connect();
  try {
    console.log('Attempting to select approval_notes from client_projects...');
    const res = await client.query(`SELECT approval_notes FROM client_projects LIMIT 1`);
    console.log('Select successful. Rows:', res.rows);
  } catch (err) {
    console.error('Select failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

verifyColumn();
