import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const res = await pool.query(`
  select conname, conrelid::regclass as table_name, pg_get_constraintdef(c.oid) as definition
  from pg_constraint c
  where pg_get_constraintdef(c.oid) ilike '%qa_status%'
  order by conrelid::regclass::text, conname;
`);

console.log(res.rows);
await pool.end();
