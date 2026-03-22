import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from '@neondatabase/serverless';
import ws from "ws";

// @ts-ignore
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 1
});

async function quickCheck() {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(disposition) as with_disposition,
        COUNT(*) - COUNT(disposition) as missing_disposition
      FROM call_attempts
    `);
    
    console.log('\n📊 Last 24h Call Dispositions:\n');
    const row = result.rows[0];
    console.log(`Total Calls: ${row.total_calls}`);
    console.log(`With Disposition: ${row.with_disposition}`);
    console.log(`Missing Disposition: ${row.missing_disposition}`);
    
    if (row.total_calls > 0) {
      const percentage = ((row.with_disposition / row.total_calls) * 100).toFixed(1);
      console.log(`\nDisposition Rate: ${percentage}%\n`);
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

quickCheck();