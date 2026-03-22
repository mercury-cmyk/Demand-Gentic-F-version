import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const query = `
  select table_name, column_name, data_type, udt_name
  from information_schema.columns
  where column_name = 'qa_status'
  order by table_name;
`;

const res = await pool.query(query);
console.log(res.rows);
await pool.end();