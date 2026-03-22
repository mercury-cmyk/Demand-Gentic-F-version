import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import 'dotenv/config';

neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'call_sessions' ORDER BY ordinal_position
  `);
  console.log('call_sessions columns:');
  cols.rows.forEach((r: any) => console.log(' ', r.column_name));
  await pool.end();
}
main();