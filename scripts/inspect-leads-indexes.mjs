import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const res = await pool.query(`
  select indexname, indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'leads'
  order by indexname;
`);

console.log(res.rows.filter(r => r.indexname.includes('pm_review') || r.indexname.includes('qa_status')));
await pool.end();
