import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function seedReputation() {
  console.log('Seeding reputation records for existing numbers...\n');

  try {
    // Get all telnyx numbers that don't have reputation records
    const numbersWithoutReputation = await db.execute(sql`
      SELECT tn.id, tn.phone_number_e164
      FROM telnyx_numbers tn
      LEFT JOIN number_reputation nr ON nr.number_id = tn.id
      WHERE nr.id IS NULL
    `);

    console.log(`Found ${numbersWithoutReputation.rows.length} numbers without reputation records\n`);

    for (const num of numbersWithoutReputation.rows) {
      await db.execute(sql`
        INSERT INTO number_reputation (number_id, score, band)
        VALUES (${(num as any).id}, 70, 'healthy')
        ON CONFLICT (number_id) DO NOTHING
      `);
      console.log(`  Created reputation for ${(num as any).phone_number_e164}`);
    }

    console.log('\nDone! Running stats check...\n');

  } catch (e: any) {
    console.error('Error:', e.message);
  }

  // Now run the stats check
  const numbers = await db.execute(sql`
    SELECT
      tn.phone_number_e164,
      tn.status,
      tn.calls_today,
      tn.calls_this_hour,
      tn.last_call_at,
      nr.score,
      nr.band,
      nr.total_calls
    FROM telnyx_numbers tn
    LEFT JOIN number_reputation nr ON nr.number_id = tn.id
    ORDER BY tn.last_call_at DESC NULLS LAST
    LIMIT 10
  `);

  console.log('=== Number Pool Stats ===\n');
  for (const row of numbers.rows) {
    const r = row as any;
    console.log(`${r.phone_number_e164}: today=${r.calls_today || 0}, hour=${r.calls_this_hour || 0}, rep=${r.score || 'N/A'} (${r.band || 'N/A'}), total_calls=${r.total_calls || 0}`);
  }

  process.exit(0);
}

seedReputation();
