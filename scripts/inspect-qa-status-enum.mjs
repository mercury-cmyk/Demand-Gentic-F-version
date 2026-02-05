import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const res = await pool.query(`
  select n.nspname as schema, t.typname as type_name, e.enumlabel
  from pg_type t
  join pg_enum e on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where t.typname = 'qa_status'
  order by e.enumsortorder;
`);

console.log(res.rows);
await pool.end();
