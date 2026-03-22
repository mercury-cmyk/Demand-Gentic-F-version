/**
 * Sync Telnyx phone numbers to database using raw SQL
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

async function syncTelnyxNumbers() {
  let databaseUrl = process.env.DATABASE_URL || '';
  databaseUrl = databaseUrl.replace(/^["']|["']$/g, '');
  
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('Checking existing Telnyx numbers in database...');
  
  const existingNumbers = await db.execute(sql`SELECT * FROM telnyx_numbers`);
  console.log(`Found ${existingNumbers.rows.length} numbers in database`);

  const telnyxApiKey = process.env.TELNYX_API_KEY;
  if (!telnyxApiKey) {
    console.error('TELNYX_API_KEY is not set');
    await pool.end();
    process.exit(1);
  }

  console.log('\nFetching phone numbers from Telnyx API...');
  
  try {
    const response = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=100', {
      headers: {
        'Authorization': `Bearer ${telnyxApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Telnyx API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const apiNumbers = data.data || [];
    
    console.log(`Telnyx API returned ${apiNumbers.length} phone numbers:`);
    
    for (const num of apiNumbers) {
      console.log(`  - ${num.phone_number} (${num.status})`);
    }

    // Insert/update numbers in database
    for (const num of apiNumbers) {
      const phoneNumber = num.phone_number;
      const telnyxId = num.id;
      const connectionName = num.connection_name || null;
      const areaCode = phoneNumber.length >= 5 ? phoneNumber.substring(2, 5) : null;
      const numStatus = num.status === 'active' ? 'active' : 'suspended';
      
      // Check if exists
      const existing = await db.execute(
        sql`SELECT id FROM telnyx_numbers WHERE phone_number_e164 = ${phoneNumber}`
      );
      
      if (existing.rows.length === 0) {
        await db.execute(sql`
          INSERT INTO telnyx_numbers (
            phone_number_e164, 
            telnyx_id, 
            display_name, 
            area_code, 
            status,
            last_synced_at
          ) VALUES (
            ${phoneNumber}, 
            ${telnyxId}, 
            ${connectionName}, 
            ${areaCode}, 
            ${numStatus},
            NOW()
          )
        `);
        console.log(`  ✅ Inserted: ${phoneNumber}`);
      } else {
        await db.execute(sql`
          UPDATE telnyx_numbers 
          SET status = ${numStatus}, last_synced_at = NOW()
          WHERE phone_number_e164 = ${phoneNumber}
        `);
        console.log(`  🔄 Updated: ${phoneNumber}`);
      }
    }

    console.log('\n✅ Sync complete!');
    
    // Show final count
    const finalNumbers = await db.execute(sql`SELECT phone_number_e164, status FROM telnyx_numbers`);
    console.log(`\nTotal numbers in database: ${finalNumbers.rows.length}`);
    for (const row of finalNumbers.rows) {
      console.log(`  - ${row.phone_number_e164} (${row.status})`);
    }

  } catch (error) {
    console.error('Error syncing from Telnyx:', error);
  }

  await pool.end();
  process.exit(0);
}

syncTelnyxNumbers();