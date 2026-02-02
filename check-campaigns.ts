import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // Activate remaining campaign
  await pool.query(`UPDATE campaigns SET status = 'active' WHERE dial_mode = 'ai_agent' AND status != 'active'`);
  console.log('All AI campaigns activated!');
  
  const result = await pool.query(`
    SELECT id, name, status, dial_mode 
    FROM campaigns 
    WHERE dial_mode = 'ai_agent'
    ORDER BY name
  `);
  
  console.log('AI Campaigns:');
  for (const c of result.rows) {
    console.log(c.status === 'active' ? '[ACTIVE]' : '[paused]', c.name);
  }
  await pool.end();
  process.exit(0);
}
run();
