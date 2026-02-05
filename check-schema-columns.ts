
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkColumns() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_schema, column_name 
      FROM information_schema.columns 
      WHERE table_name = 'client_projects' AND column_name = 'approval_notes'
    `);
    console.log('Found columns:', res.rows);
    
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}

checkColumns();
