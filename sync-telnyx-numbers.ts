/**
 * Sync Telnyx phone numbers to database
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from 'ws';
import { telnyxNumbers as telnyxNumbersTable } from './shared/number-pool-schema';

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
  
  const existingNumbers = await db.select().from(telnyxNumbersTable);
  console.log('Found ' + existingNumbers.length + ' numbers in database:');
  existingNumbers.forEach(n => {
    console.log('  - ' + n.phoneNumberE164 + ' (' + n.status + ') - ID: ' + n.id);
  });

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
        'Authorization': 'Bearer ' + telnyxApiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Telnyx API error: ' + response.status + ' ' + response.statusText);
    }

    const data = await response.json();
    const apiNumbers = data.data || [];
    
    console.log('Telnyx API returned ' + apiNumbers.length + ' phone numbers');

    for (const num of apiNumbers) {
      const phoneNumber = num.phone_number;
      const telnyxId = num.id;
      
      const existing = await db.select()
        .from(telnyxNumbersTable)
        .where(eq(telnyxNumbersTable.telnyxId, telnyxId));

      if (existing.length === 0) {
        await db.insert(telnyxNumbersTable).values({
          telnyxId: telnyxId,
          phoneNumberE164: phoneNumber,
          displayName: num.connection_name || null,
          region: num.address?.locality || null,
          areaCode: phoneNumber.substring(2, 5),
          status: num.status === 'active' ? 'active' : 'suspended',
          tags: num.tags || [],
          lastSyncedAt: new Date(),
        });
        console.log('  Inserted: ' + phoneNumber);
      } else {
        await db.update(telnyxNumbersTable)
          .set({
            phoneNumberE164: phoneNumber,
            status: num.status === 'active' ? 'active' : 'suspended',
            lastSyncedAt: new Date(),
          })
          .where(eq(telnyxNumbersTable.telnyxId, telnyxId));
        console.log('  Updated: ' + phoneNumber);
      }
    }

    console.log('\nSync complete!');
    
    const finalNumbers = await db.select().from(telnyxNumbersTable);
    console.log('\nTotal numbers in database: ' + finalNumbers.length);
    finalNumbers.forEach(n => {
      console.log('  - ' + n.phoneNumberE164 + ' (' + n.status + ')');
    });

  } catch (error) {
    console.error('Error syncing from Telnyx:', error);
  }

  await pool.end();
  process.exit(0);
}

syncTelnyxNumbers();
