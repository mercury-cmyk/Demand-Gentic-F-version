
import { db } from "./server/db";
import { telnyxNumbers } from "./shared/number-pool-schema";
import { sql } from "drizzle-orm";

async function checkDuplicates() {
  console.log("Checking for duplicate phone numbers...");
  
  const results = await db.execute(sql`
    SELECT phone_number_e164, COUNT(*) as count, STRING_AGG(id::text, ',') as ids
    FROM telnyx_numbers
    GROUP BY phone_number_e164
    HAVING COUNT(*) > 1
  `);
  
  if (results.rows.length === 0) {
    console.log("No duplicates found.");
  } else {
    console.log(`Found ${results.rows.length} duplicate numbers!`);
    console.table(results.rows);
  }
  
  process.exit(0);
}

checkDuplicates().catch(console.error);
