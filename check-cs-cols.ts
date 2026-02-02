import { pool } from './server/db';

async function main() {
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'call_sessions' ORDER BY ordinal_position`);
  console.log('call_sessions columns:', r.rows.map((x:any) => x.column_name).join(', '));
  process.exit(0);
}
main();
