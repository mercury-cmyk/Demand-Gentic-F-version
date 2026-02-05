import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const res = await pool.query(`
  select indexname, indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'work_orders'
  order by indexname;
`);

console.log(res.rows);
await pool.end();
