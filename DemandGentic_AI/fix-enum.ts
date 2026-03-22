import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixEnums() {
  const client = await pool.connect();
  try {
    console.log('Fixing schema issues...');
    
    // Fix confidence_score column type in ai_project_intents table
    console.log('Fixing confidence_score column in ai_project_intents...');
    try {
      await client.query(`
        ALTER TABLE ai_project_intents 
        ALTER COLUMN confidence_score TYPE numeric(5,2) 
        USING confidence_score::numeric(5,2)
      `);
      console.log('✅ Fixed confidence_score column type');
    } catch (e: any) {
      console.log('confidence_score:', e.message);
    }

    console.log('Done!');
  } finally {
    client.release();
    await pool.end();
  }
}

fixEnums().catch(console.error);