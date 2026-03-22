import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const res = await pool.query(`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'prompt_registry','prompt_versions','unified_knowledge_hub','unified_knowledge_versions','knowledge_blocks','knowledge_block_versions','campaign_knowledge_config','agent_knowledge_config'
    )
  order by table_name;
`);

console.log(res.rows);
await pool.end();