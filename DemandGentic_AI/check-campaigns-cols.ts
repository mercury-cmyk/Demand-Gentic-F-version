import { pool } from './server/db';

async function main() {
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'campaigns' ORDER BY ordinal_position`);
  console.log('Campaigns columns:', r.rows.map((x:any) => x.column_name).join(', '));
  process.exit(0);
}
main();