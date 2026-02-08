import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function activate() {
  const ringCentralId = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';
  
  console.log('=== Activating RingCentral Campaign ===');
  
  await db.execute(sql`
    UPDATE campaigns 
    SET status = 'active' 
    WHERE id = ${ringCentralId}
  `);
  
  console.log('✅ Campaign activated successfully');
  process.exit(0);
}

activate().catch(e => { console.error(e); process.exit(1); });
