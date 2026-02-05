
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
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'client_projects'
    `);
    console.log('Columns in client_projects:', res.rows.map(r => r.column_name));
    
    // Also check campaign_intake_requests just in case
    const res2 = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'campaign_intake_requests'
    `);
    console.log('Columns in campaign_intake_requests:', res2.rows.map(r => r.column_name));

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}

checkColumns();
