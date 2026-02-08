/**
 * Add specific phone numbers to number pool with CNAM and noise suppression enabled
 *
 * Run with: npx tsx add-numbers-with-cnam.ts
 */

import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  console.log('TELNYX_API_KEY not found in environment');
  process.exit(1);
}

// Numbers to add
const NUMBERS_TO_ADD = [
  '+12892761119',
  '+12899142727',
  '+13656935438',
  '+16042396684',
];

interface TelnyxNumber {
  id: string;
  phone_number: string;
  cnam_listing_enabled?: boolean;
  noise_suppression?: string;
  connection_id?: string;
}

// Fetch a specific number by phone number
async function fetchNumberByE164(phoneNumber: string): Promise<TelnyxNumber | null> {
  const response = await fetch(
    `https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`,
    {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.error(`Failed to fetch ${phoneNumber}:`, response.status, await response.text());
    return null;
  }

  const data = await response.json();
  return data.data?.[0] || null;
}

// Enable CNAM for a number
async function enableCNAM(numberId: string, phoneNumber: string): Promise<boolean> {
  const response = await fetch(`https://api.telnyx.com/v2/phone_numbers/${numberId}/voice`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      cnam_listing: {
        cnam_listing_enabled: true,
        cnam_listing_details: 'Pivotal B2B',
      },
    }),
  });

  if (!response.ok) {
    console.error(`  ${phoneNumber} CNAM FAIL (${response.status}): ${(await response.text()).substring(0, 200)}`);
    return false;
  }

  const data = await response.json();
  console.log(`  ${phoneNumber} CNAM -> ${data.data?.cnam_listing?.cnam_listing_enabled ? 'ENABLED' : 'PENDING'}`);
  return true;
}

// Enable noise suppression for a number
async function enableNoiseSuppression(numberId: string, phoneNumber: string): Promise<boolean> {
  const response = await fetch(`https://api.telnyx.com/v2/phone_numbers/${numberId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      noise_suppression: 'both',
    }),
  });

  if (!response.ok) {
    console.error(`  ${phoneNumber} NOISE FAIL (${response.status}): ${(await response.text()).substring(0, 200)}`);
    return false;
  }

  const data = await response.json();
  console.log(`  ${phoneNumber} NOISE -> ${data.data?.noise_suppression}`);
  return true;
}

// Add number to database pool
async function addToNumberPool(num: TelnyxNumber): Promise<boolean> {
  try {
    // Dynamic import to avoid issues with ESM
    const { db } = await import('./server/db');
    const { telnyxNumbers, numberReputation } = await import('./shared/number-pool-schema');
    const { eq } = await import('drizzle-orm');

    // Check if already exists
    const existing = await db
      .select()
      .from(telnyxNumbers)
      .where(eq(telnyxNumbers.phoneNumberE164, num.phone_number))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  ${num.phone_number} Already in pool, updating...`);
      await db
        .update(telnyxNumbers)
        .set({
          telnyxNumberId: num.id,
          telnyxConnectionId: num.connection_id || null,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(telnyxNumbers.id, existing[0].id));
      return true;
    }

    // Extract area code from E.164
    const areaCode = num.phone_number.length >= 5
      ? num.phone_number.substring(2, 5) // +1XXX...
      : null;

    // Insert new number
    const [inserted] = await db.insert(telnyxNumbers).values({
      telnyxNumberId: num.id,
      phoneNumberE164: num.phone_number,
      telnyxConnectionId: num.connection_id || null,
      areaCode,
      status: 'active',
    }).returning();

    console.log(`  ${num.phone_number} Added to pool (id: ${inserted.id})`);

    // Initialize reputation record
    await db.insert(numberReputation).values({
      numberId: inserted.id,
      currentScore: 100,
      band: 'excellent',
      answerRate7d: 0,
      voicemailRate7d: 0,
      noAnswerRate7d: 0,
      qualifiedLeadRate7d: 0,
      avgCallDuration7d: 0,
      totalCalls7d: 0,
      lastCallAt: null,
    }).onConflictDoNothing();

    console.log(`  ${num.phone_number} Reputation initialized`);
    return true;
  } catch (error) {
    console.error(`  ${num.phone_number} DB ERROR:`, error);
    return false;
  }
}

async function main() {
  console.log('=== Adding Numbers to Pool with CNAM & Noise Suppression ===\n');

  let success = 0;
  let failed = 0;

  for (const phoneNumber of NUMBERS_TO_ADD) {
    console.log(`\nProcessing ${phoneNumber}...`);

    // Fetch from Telnyx
    const num = await fetchNumberByE164(phoneNumber);
    if (!num) {
      console.log(`  ❌ Not found in Telnyx account`);
      failed++;
      continue;
    }

    console.log(`  Found: ID=${num.id}, CNAM=${num.cnam_listing_enabled}, Noise=${num.noise_suppression}`);

    // Enable CNAM if needed
    if (num.cnam_listing_enabled !== true) {
      await enableCNAM(num.id, phoneNumber);
      await new Promise(r => setTimeout(r, 300)); // Rate limit
    } else {
      console.log(`  ${phoneNumber} CNAM already enabled`);
    }

    // Enable noise suppression if needed
    if (num.noise_suppression !== 'both') {
      await enableNoiseSuppression(num.id, phoneNumber);
      await new Promise(r => setTimeout(r, 300)); // Rate limit
    } else {
      console.log(`  ${phoneNumber} Noise suppression already 'both'`);
    }

    // Add to database pool
    const addedToDb = await addToNumberPool(num);
    if (addedToDb) {
      success++;
      console.log(`  ✅ ${phoneNumber} complete`);
    } else {
      failed++;
    }
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${NUMBERS_TO_ADD.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
