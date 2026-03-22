import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import 'dotenv/config';

neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // Check for tables with project/request in name
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name LIKE '%project%' OR table_name LIKE '%request%')
  `);
  console.log('Project/Request Tables:', tables.rows.map((r: any) => r.table_name));
  
  // Check client_projects table
  const projects = await pool.query('SELECT * FROM client_projects ORDER BY created_at DESC LIMIT 5');
  console.log('\nRecent Projects:');
  projects.rows.forEach((r: any) => {
    console.log('---');
    console.log('ID:', r.id);
    console.log('Reference:', r.reference_number);
    console.log('Name:', r.name);
    console.log('Client ID:', r.client_id);
    console.log('Status:', r.status);
    console.log('Created:', r.created_at);
  });
  
  // Check the specific ID
  const orderId = '9c545ab0-e1d4-40f3-87c6-848ad3b74a8c';
  const specific = await pool.query('SELECT * FROM client_projects WHERE id = $1', [orderId]);
  console.log('\n\nSpecific Project (9c545ab0...):', specific.rows[0] || 'NOT FOUND');
  
  await pool.end();
}
main();