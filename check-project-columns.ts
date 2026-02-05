
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
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'client_projects'
    `);
    console.log('Columns in client_projects:', res.rows.map(r => r.column_name).sort());
    
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}

checkColumns();
