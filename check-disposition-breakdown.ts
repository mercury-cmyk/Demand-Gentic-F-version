import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function check() {
  // New dialer
  const dialer = await db.execute(sql`
    SELECT disposition, connected, COUNT(*) as cnt
    FROM dialer_call_attempts
    GROUP BY disposition, connected
    ORDER BY cnt DESC
  `);
  
  console.log('\n=== DIALER CALL ATTEMPTS ===');
  console.log('Disposition            | Connected | Count');
  console.log(''.padEnd(55, '-'));
  for (const r of dialer.rows) {
    const disp = (r.disposition || 'NULL').toString().padEnd(20);
    const conn = r.connected ? 'true' : 'false';
    console.log(`${disp} | ${conn.padEnd(9)} | ${r.cnt}`);
  }
  
  // Legacy
  const legacy = await db.execute(sql`
    SELECT disposition, COUNT(*) as cnt
    FROM call_attempts
    GROUP BY disposition
    ORDER BY cnt DESC
  `);
  
  console.log('\n=== LEGACY CALL ATTEMPTS ===');
  console.log('Disposition            | Count');
  console.log(''.padEnd(40, '-'));
  for (const r of legacy.rows) {
    const disp = (r.disposition || 'NULL').toString().padEnd(20);
    console.log(`${disp} | ${r.cnt}`);
  }
  
  // Summary
  const summary = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN connected = true THEN 1 ELSE 0 END) as connected_true,
      SUM(CASE WHEN voicemail_detected = true THEN 1 ELSE 0 END) as voicemails
    FROM dialer_call_attempts
  `);
  
  console.log('\n=== SUMMARY ===');
  for (const r of summary.rows) {
    console.log(`Total: ${r.total}`);
    console.log(`Connected (human): ${r.connected_true}`);
    console.log(`Voicemails: ${r.voicemails}`);
  }
  
  process.exit(0);
}

check();
