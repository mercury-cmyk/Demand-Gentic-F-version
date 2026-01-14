import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Check lead ID patterns to understand source
  const result = await db.execute(sql`
    SELECT 
      id, 
      contact_name,
      notes, 
      telnyx_call_id,
      call_duration,
      created_at::text
    FROM leads 
    ORDER BY created_at DESC 
    LIMIT 5
  `);
  
  console.log('=== RECENT LEADS WITH DETAILS ===');
  for (const row of result.rows as any[]) {
    console.log('\n--- Lead ---');
    console.log('ID:', row.id);
    console.log('Contact:', row.contact_name);
    console.log('Duration:', row.call_duration, 'seconds');
    console.log('Telnyx Call ID:', row.telnyx_call_id);
    console.log('Created:', row.created_at);
    console.log('Notes (first 200 chars):', (row.notes || '').substring(0, 200));
  }
  
  process.exit(0);
}
main();
