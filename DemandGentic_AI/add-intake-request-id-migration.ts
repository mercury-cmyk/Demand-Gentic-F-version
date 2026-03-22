import pg from 'pg';
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function addIntakeRequestIdToProjects() {
  const client = await pool.connect();
  try {
    console.log('Checking for intake_request_id column in client_projects...');
    
    // Check if column exists
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'client_projects' AND column_name = 'intake_request_id'
    `);

    if (checkRes.rows.length === 0) {
      console.log('Column intake_request_id not found. Adding it...');
      await client.query(`
        ALTER TABLE client_projects 
        ADD COLUMN intake_request_id varchar REFERENCES campaign_intake_requests(id) ON DELETE SET NULL;
      `);
      console.log('Column intake_request_id added successfully.');
    } else {
      console.log('Column intake_request_id already exists.');
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    client.release();
    pool.end();
  }
}

addIntakeRequestIdToProjects();