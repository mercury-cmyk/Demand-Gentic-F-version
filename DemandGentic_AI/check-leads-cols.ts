import { pool } from './server/db';

async function main() {
  const r = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'leads' 
    ORDER BY ordinal_position
  `);
  console.log('Leads columns:', r.rows.map((r:any) => r.column_name).join(', '));
  process.exit(0);
}

main();