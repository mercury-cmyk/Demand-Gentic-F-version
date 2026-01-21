import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import 'dotenv/config';

neonConfig.webSocketConstructor = ws;

const CAMPAIGN_ID = 'ad8c5155-fcc3-4b4c-bdc6-55b4b58cbb37';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const statsResult = await pool.query(`
    SELECT ai_disposition as disposition, COUNT(*) as count 
    FROM call_sessions 
    WHERE campaign_id = $1 AND created_at >= $2
    GROUP BY ai_disposition
  `, [CAMPAIGN_ID, today]);

  console.log('\n📊 Proton UK 2026 - Today\'s Call Stats:\n');
  let total = 0;
  for (const s of statsResult.rows) {
    console.log(`  ${s.disposition || 'pending'}: ${s.count}`);
    total += Number(s.count);
  }
  console.log(`\n  Total: ${total}`);

  const recentResult = await pool.query(`
    SELECT contact_id, ai_disposition as disposition
    FROM call_sessions 
    WHERE campaign_id = $1 AND created_at >= $2
    ORDER BY created_at DESC
    LIMIT 15
  `, [CAMPAIGN_ID, today]);

  console.log('\n📞 Recent Calls:\n');
  for (const c of recentResult.rows) {
    console.log(`  ${c.contact_id?.substring(0,8) || 'N/A'} | ${c.disposition || 'pending'}`);
  }
  
  await pool.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
