import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const promptsRes = await pool.query('select count(*) as cnt from prompt_registry;');
const blocksRes = await pool.query('select count(*) as cnt from knowledge_blocks;');
const knowledgeRes = await pool.query('select id, version from unified_knowledge_hub;');

console.log('Prompt Registry:', promptsRes.rows[0]);
console.log('Knowledge Blocks:', blocksRes.rows[0]);
console.log('Unified Knowledge Hub:', knowledgeRes.rows);
await pool.end();