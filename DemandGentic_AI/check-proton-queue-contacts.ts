/**
 * Check Proton UK 2026 campaign queue for missing contact_id values
 */

import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkProtonQueueContacts() {
  const campaignId = 'ad8c5155-fcc3-4b4c-bdc6-55b4b58cbb37'; // Proton UK 2026

  console.log("\n=== Proton UK 2026 Campaign Queue Analysis ===\n");

  // Check total queue size
  const totalResult = await db.execute(sql`
    SELECT COUNT(*) as total
    FROM campaign_queue
    WHERE campaign_id = ${campaignId}
  `);
  console.log(`Total queue items: ${totalResult.rows[0].total}\n`);

  // Check for NULL contact_id
  const nullContactsResult = await db.execute(sql`
    SELECT COUNT(*) as null_count
    FROM campaign_queue
    WHERE campaign_id = ${campaignId}
      AND contact_id IS NULL
  `);
  console.log(`❌ NULL contact_id: ${nullContactsResult.rows[0].null_count}`);

  // Check for empty string contact_id
  const emptyContactsResult = await db.execute(sql`
    SELECT COUNT(*) as empty_count
    FROM campaign_queue
    WHERE campaign_id = ${campaignId}
      AND contact_id = ''
  `);
  console.log(`❌ Empty string contact_id: ${emptyContactsResult.rows[0].empty_count}`);

  // Check for valid UUIDs
  const validContactsResult = await db.execute(sql`
    SELECT COUNT(*) as valid_count
    FROM campaign_queue
    WHERE campaign_id = ${campaignId}
      AND contact_id IS NOT NULL
      AND contact_id != ''
      AND contact_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  `);
  console.log(`✅ Valid UUID contact_id: ${validContactsResult.rows[0].valid_count}\n`);

  // Show sample queue items
  const sampleResult = await db.execute(sql`
    SELECT id, contact_id, phone_number, company_name, status
    FROM campaign_queue
    WHERE campaign_id = ${campaignId}
    LIMIT 5
  `);

  console.log("Sample queue items:");
  for (const row of sampleResult.rows) {
    console.log(`\n  Queue ID: ${row.id}`);
    console.log(`  Contact ID: ${row.contact_id || 'NULL'}`);
    console.log(`  Phone: ${row.phone_number || 'N/A'}`);
    console.log(`  Company: ${row.company_name || 'N/A'}`);
    console.log(`  Status: ${row.status || 'N/A'}`);
  }

  console.log("\n✅ Analysis Complete\n");
}

checkProtonQueueContacts().catch(console.error);