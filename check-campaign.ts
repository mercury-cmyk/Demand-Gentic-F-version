import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function check() {
  const ringCentralId = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';
  
  console.log('=== RingCentral Campaign Issue ===');
  console.log('Problem: No caller phone number configured\n');
  
  // Get telnyx_numbers column info
  const cols = await db.execute(sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'telnyx_numbers'
  `);
  console.log('telnyx_numbers columns:');
  cols.rows.forEach((r: any) => console.log('-', r.column_name));
  
  // Check Telnyx numbers available
  const telnyxNumbers = await db.execute(sql`
    SELECT * FROM telnyx_numbers LIMIT 5
  `);
  console.log('\n=== Telnyx Numbers ===');
  console.table(telnyxNumbers.rows);
  
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
