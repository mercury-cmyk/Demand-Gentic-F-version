import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function findSipNumber() {
  // Find numbers ending in 14
  const numbers14 = await db.execute(sql`
    SELECT id, phone_number_e164, display_name, status
    FROM telnyx_numbers
    WHERE phone_number_e164 LIKE '%14'
    ORDER BY phone_number_e164
  `);

  console.log('Numbers ending in 14:');
  for (const n of numbers14.rows) {
    const num = n as any;
    console.log(`  ${num.phone_number_e164} (id: ${num.id}, status: ${num.status})`);
  }

  // Show all numbers for reference
  console.log('\nAll numbers in pool:');
  const allNumbers = await db.execute(sql`
    SELECT phone_number_e164, status
    FROM telnyx_numbers
    ORDER BY phone_number_e164
  `);

  for (const n of allNumbers.rows) {
    const num = n as any;
    console.log(`  ${num.phone_number_e164} - ${num.status}`);
  }

  process.exit(0);
}

findSipNumber();
