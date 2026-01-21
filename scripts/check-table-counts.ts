import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import 'dotenv/config';

neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const cid = 'ad8c5155-fcc3-4b4c-bdc6-55b4b58cbb37';
  
  console.log('=== TABLE RECORD COUNTS FOR PROTON UK 2026 ===\n');
  
  const legacy = await pool.query('SELECT COUNT(*) FROM calls WHERE campaign_id = $1', [cid]);
  console.log('Legacy calls table:', legacy.rows[0].count);
  
  const dialer = await pool.query('SELECT COUNT(*) FROM dialer_call_attempts WHERE campaign_id = $1', [cid]);
  console.log('Dialer attempts table:', dialer.rows[0].count);
  
  const sessions = await pool.query('SELECT COUNT(*) FROM call_sessions WHERE campaign_id = $1', [cid]);
  console.log('Call sessions table:', sessions.rows[0].count);
  
  // Check dialer_call_attempts dispositions
  console.log('\n=== DIALER_CALL_ATTEMPTS DISPOSITIONS ===');
  const dialerDisp = await pool.query(`
    SELECT disposition, COUNT(*) as count 
    FROM dialer_call_attempts 
    WHERE campaign_id = $1 
    GROUP BY disposition 
    ORDER BY count DESC
  `, [cid]);
  dialerDisp.rows.forEach((r: any) => console.log(`  ${r.disposition || 'null'}: ${r.count}`));
  
  // Check legacy calls dispositions
  console.log('\n=== LEGACY CALLS DISPOSITIONS ===');
  const legacyDisp = await pool.query(`
    SELECT disposition, COUNT(*) as count 
    FROM calls 
    WHERE campaign_id = $1 
    GROUP BY disposition 
    ORDER BY count DESC
  `, [cid]);
  legacyDisp.rows.forEach((r: any) => console.log(`  ${r.disposition || 'null'}: ${r.count}`));
  
  await pool.end();
}
main();
