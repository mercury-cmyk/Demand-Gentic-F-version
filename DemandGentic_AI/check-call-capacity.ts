import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkCapacity() {
  const result = await db.execute(sql`
    SELECT phone_number_e164, status, created_at 
    FROM telnyx_numbers 
    WHERE status = 'active'
  `);
  
  const now = new Date();
  let totalCapacity = 0;
  
  console.log('\n📞 Number Warmup Status:\n');
  console.log('Phone Number      | Age (Days) | Hourly Limit');
  console.log('------------------|------------|-------------');
  
  for (const row of result.rows as any[]) {
    const created = new Date(row.created_at);
    const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    
    let hourlyLimit = 20;
    if (daysSinceCreated < 1) hourlyLimit = 3;
    else if (daysSinceCreated < 2) hourlyLimit = 6;
    else if (daysSinceCreated < 3) hourlyLimit = 10;
    else if (daysSinceCreated < 4) hourlyLimit = 15;
    
    totalCapacity += hourlyLimit;
    console.log(`${row.phone_number_e164} | Day ${(daysSinceCreated + 1).toString().padStart(2)}     | ${hourlyLimit} calls/hr`);
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 CURRENT CAPACITY:`);
  console.log(`   • Hourly:  ${totalCapacity} calls/hour`);
  console.log(`   • Daily:   ${totalCapacity * 8} calls (8hr business day)`);
  console.log(`   • Numbers: ${result.rows.length} active`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  process.exit(0);
}

checkCapacity();