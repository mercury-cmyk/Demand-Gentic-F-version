
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from 'ws';
import { telnyxNumbers as telnyxNumbersTable } from './shared/number-pool-schema'; // Adjust path if needed

// config();
neonConfig.webSocketConstructor = ws;

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TARGET_CONNECTION_ID = '2870970047591876264'; // Ending in 64
const CNAM_DETAILS = 'Pivotal B2B';

if (!TELNYX_API_KEY) {
  console.error('TELNYX_API_KEY is not set');
  process.exit(1);
}

async function configureAndSync() {
  // Database Setup
  let databaseUrl = process.env.DATABASE_URL || '';
  databaseUrl = databaseUrl.replace(/^["']|["']$/g, '');
  if (!databaseUrl) { console.error('DATABASE_URL missing'); process.exit(1); }
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('Fetching phone numbers from Telnyx...');
  const numbersRes = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=100', {
    headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
  });
  const numbersData = await numbersRes.json();
  const allNumbers = numbersData.data || [];

  // Filter for unconfigured numbers (no connection_id)
  const numbersToConfigure = allNumbers.filter((n: any) => !n.connection_id || n.connection_id !== TARGET_CONNECTION_ID);

  if (numbersToConfigure.length === 0) {
      console.log('No numbers need configuration.');
  } else {
      console.log(`Found ${numbersToConfigure.length} numbers to configure.`);
      
      for (const num of numbersToConfigure) {
          console.log(`Params for ${num.phone_number}: Configuring...`);
          
          try {
            // 1. Update Connection & Billing (if we had a group, but we don't, so just connection)
            const updateRes = await fetch(`https://api.telnyx.com/v2/phone_numbers/${num.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${TELNYX_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    connection_id: TARGET_CONNECTION_ID,
                    // If we had a billing group, we'd add billing_group_id here
                    tags: ['auto-configured', 'pivotal-b2b']
                })
            });
            
            if (!updateRes.ok) {
                console.error(`Failed to update core config for ${num.phone_number}: ${await updateRes.text()}`);
                continue;
            }
            console.log(`  - Connection assigned.`);

            // 2. Update Voice Settings (CNAM)
            const voiceRes = await fetch(`https://api.telnyx.com/v2/phone_numbers/${num.id}/voice`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${TELNYX_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cnam_listing: {
                        cnam_listing_enabled: true,
                        cnam_listing_details: CNAM_DETAILS
                    },
                    // Enable noise suppression while we are at it, as per standard
                    media_features: {
                        noise_suppression: 'inbound,outbound' // or 'both' depending on API version, older was top level
                    }
                })
            });

            // Try the top-level noise suppression just in case (older API style seen in other script)
            await fetch(`https://api.telnyx.com/v2/phone_numbers/${num.id}`, {
                 method: 'PATCH',
                 headers: {
                    'Authorization': `Bearer ${TELNYX_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    noise_suppression: 'both' // matches add-numbers-with-cnam.ts
                })
            });

            if (!voiceRes.ok) {
                 // Non-fatal, CNAM might just fail or cost money
                 console.warn(`  - CNAM update warning: ${await voiceRes.text()}`);
            } else {
                 console.log(`  - CNAM & Voice settings updated.`);
            }

          } catch (err) {
              console.error(`Error configuring ${num.phone_number}:`, err);
          }
      }
  }

  // 3. Sync to Database (All numbers, to ensure DB is up to date)
  console.log('\nSyncing all numbers to database...');
  // Re-fetch to get latest state
  const refreshRes = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=100', {
    headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
  });
  const refreshData = await refreshRes.json();
  const finalNumbers = refreshData.data || [];

  for (const num of finalNumbers) {
      // Upsert
      const existing = await db.select().from(telnyxNumbersTable).where(eq(telnyxNumbersTable.telnyxNumberId, num.id));
      
      const status: 'active' | 'suspended' = num.status === 'active' ? 'active' : 'suspended';
      const values = {
          telnyxNumberId: num.id as string,
          phoneNumberE164: num.phone_number as string,
          displayName: (num.connection_name || 'Legacy Connection') as string,
          region: (num.address?.locality || null) as string | null,
          areaCode: (num.phone_number as string).substring(2, 5),
          status,
          tags: (num.tags || []) as string[],
          updatedAt: new Date()
      };

      if (existing.length === 0) {
          await db.insert(telnyxNumbersTable).values(values);
          console.log(`  Inserted DB: ${num.phone_number}`);
      } else {
          await db.update(telnyxNumbersTable).set(values).where(eq(telnyxNumbersTable.telnyxNumberId, num.id));
          console.log(`  Updated DB: ${num.phone_number}`);
      }
  }

  console.log('Configuration and Sync Complete.');
  await pool.end();
}

// config(); // Removed manual config
configureAndSync().catch(console.error);

