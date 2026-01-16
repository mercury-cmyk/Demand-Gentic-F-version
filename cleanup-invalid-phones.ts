import { db } from "./server/db";
import { sql } from "drizzle-orm";

/**
 * Cleanup Invalid Phone Numbers from Campaign Queue
 *
 * This script identifies and removes contacts with invalid phone numbers
 * that cause Telnyx API errors (10016 - invalid E164 format).
 */

async function cleanupInvalidPhones() {
  console.log("================================================================================");
  console.log("CLEANING UP INVALID PHONE NUMBERS FROM CAMPAIGN QUEUE");
  console.log("================================================================================\n");

  // Step 1: Find contacts with obviously invalid phone numbers
  console.log("🔍 Step 1: Finding contacts with invalid phone numbers...\n");

  const invalidContacts = await db.execute(sql`
    SELECT
      c.id,
      c.full_name,
      c.direct_phone_e164,
      c.mobile_phone_e164,
      c.account_id,
      a.name as account_name,
      COUNT(cq.id) as queue_count
    FROM contacts c
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaign_queue cq ON cq.contact_id = c.id AND cq.status IN ('queued', 'in_progress')
    WHERE
      -- Phone number too long (max E164 is +[15 digits])
      (LENGTH(c.direct_phone_e164) > 16 OR LENGTH(c.mobile_phone_e164) > 16)
      OR
      -- Phone number has repeated zeros (likely test/dummy data)
      (c.direct_phone_e164 LIKE '%00000000%' OR c.mobile_phone_e164 LIKE '%00000000%')
      OR
      -- Phone number has repeated 1s, 2s, 3s, 4s (likely test data)
      (c.direct_phone_e164 ~ '(1{8,}|2{8,}|3{8,}|4{8,}|5{8,}|6{8,}|7{8,}|8{8,}|9{8,})'
       OR c.mobile_phone_e164 ~ '(1{8,}|2{8,}|3{8,}|4{8,}|5{8,}|6{8,}|7{8,}|8{8,}|9{8,})')
      OR
      -- Phone number too short (min E164 is +[10 digits])
      (LENGTH(c.direct_phone_e164) < 11 AND c.direct_phone_e164 IS NOT NULL)
      OR
      (LENGTH(c.mobile_phone_e164) < 11 AND c.mobile_phone_e164 IS NOT NULL)
    GROUP BY c.id, c.full_name, c.direct_phone_e164, c.mobile_phone_e164, c.account_id, a.name
    ORDER BY queue_count DESC, c.full_name
  `);

  if (invalidContacts.rows.length === 0) {
    console.log("✅ No invalid phone numbers found!\n");
    process.exit(0);
  }

  console.log(`❌ Found ${invalidContacts.rows.length} contacts with invalid phone numbers:\n`);

  // Group by issue type
  const tooLong: any[] = [];
  const repeatedDigits: any[] = [];
  const tooShort: any[] = [];

  for (const row of invalidContacts.rows) {
    const contact = row as any;
    const directPhone = contact.direct_phone_e164 || '';
    const mobilePhone = contact.mobile_phone_e164 || '';

    if (directPhone.length > 16 || mobilePhone.length > 16) {
      tooLong.push(contact);
    } else if (directPhone.includes('00000000') || mobilePhone.includes('00000000') ||
               /(\d)\1{7,}/.test(directPhone) || /(\d)\1{7,}/.test(mobilePhone)) {
      repeatedDigits.push(contact);
    } else if ((directPhone.length > 0 && directPhone.length < 11) ||
               (mobilePhone.length > 0 && mobilePhone.length < 11)) {
      tooShort.push(contact);
    }
  }

  if (tooLong.length > 0) {
    console.log(`📱 TOO LONG (${tooLong.length} contacts):`);
    tooLong.slice(0, 10).forEach((c: any) => {
      console.log(`   - ${c.full_name} at ${c.account_name || 'Unknown'}`);
      console.log(`     Direct: ${c.direct_phone_e164 || 'N/A'}`);
      console.log(`     Mobile: ${c.mobile_phone_e164 || 'N/A'}`);
      console.log(`     In ${c.queue_count} campaign queue(s)`);
    });
    if (tooLong.length > 10) {
      console.log(`   ... and ${tooLong.length - 10} more`);
    }
    console.log("");
  }

  if (repeatedDigits.length > 0) {
    console.log(`📱 REPEATED DIGITS / TEST DATA (${repeatedDigits.length} contacts):`);
    repeatedDigits.slice(0, 10).forEach((c: any) => {
      console.log(`   - ${c.full_name} at ${c.account_name || 'Unknown'}`);
      console.log(`     Direct: ${c.direct_phone_e164 || 'N/A'}`);
      console.log(`     Mobile: ${c.mobile_phone_e164 || 'N/A'}`);
      console.log(`     In ${c.queue_count} campaign queue(s)`);
    });
    if (repeatedDigits.length > 10) {
      console.log(`   ... and ${repeatedDigits.length - 10} more`);
    }
    console.log("");
  }

  if (tooShort.length > 0) {
    console.log(`📱 TOO SHORT (${tooShort.length} contacts):`);
    tooShort.slice(0, 10).forEach((c: any) => {
      console.log(`   - ${c.full_name} at ${c.account_name || 'Unknown'}`);
      console.log(`     Direct: ${c.direct_phone_e164 || 'N/A'}`);
      console.log(`     Mobile: ${c.mobile_phone_e164 || 'N/A'}`);
      console.log(`     In ${c.queue_count} campaign queue(s)`);
    });
    if (tooShort.length > 10) {
      console.log(`   ... and ${tooShort.length - 10} more`);
    }
    console.log("");
  }

  // Step 2: Remove from campaign queue
  console.log("🗑️  Step 2: Removing invalid contacts from campaign queue...\n");

  const contactIds = invalidContacts.rows.map((row: any) => row.id);

  // Process in batches to avoid PostgreSQL ROW limit (max 1664 entries)
  const BATCH_SIZE = 1000;
  let removedCount = 0;
  const allRemovedRows: any[] = [];

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);

    const removeResult = await db.execute(sql`
      UPDATE campaign_queue
      SET status = 'removed',
          removed_reason = 'invalid_phone_number',
          updated_at = NOW()
      WHERE contact_id IN (${sql.join(batch.map((id: string) => sql`${id}`), sql`, `)})
        AND status IN ('queued', 'in_progress')
      RETURNING id, campaign_id, contact_id
    `);

    const batchRemoved = removeResult.rows?.length || 0;
    removedCount += batchRemoved;
    allRemovedRows.push(...(removeResult.rows || []));

    if (batchRemoved > 0) {
      console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}: Removed ${batchRemoved} items`);
    }
  }

  console.log(`\n✅ Removed ${removedCount} queue items with invalid phone numbers\n`);

  if (removedCount > 0) {
    // Group by campaign
    const byCampaign = new Map<string, number>();
    for (const row of allRemovedRows) {
      const r = row as any;
      byCampaign.set(r.campaign_id, (byCampaign.get(r.campaign_id) || 0) + 1);
    }

    console.log("📊 Breakdown by campaign:");
    for (const [campaignId, count] of byCampaign.entries()) {
      console.log(`   - ${campaignId}: ${count} items removed`);
    }
    console.log("");
  }

  // Step 3: Optionally fix phone numbers that can be corrected
  console.log("🔧 Step 3: Checking if any phone numbers can be auto-corrected...\n");

  // Find contacts with both direct and mobile phones where one is invalid but the other is valid
  // Process in batches to avoid PostgreSQL ROW limit
  const allFixableContacts: any[] = [];

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);

    const fixableContacts = await db.execute(sql`
      SELECT
        c.id,
        c.full_name,
        c.direct_phone_e164,
        c.mobile_phone_e164,
        CASE
          WHEN c.mobile_phone_e164 IS NOT NULL
               AND LENGTH(c.mobile_phone_e164) BETWEEN 11 AND 16
               AND c.mobile_phone_e164 NOT LIKE '%00000000%'
          THEN c.mobile_phone_e164
          ELSE NULL
        END as valid_phone
      FROM contacts c
      WHERE c.id IN (${sql.join(batch.map((id: string) => sql`${id}`), sql`, `)})
        AND (
          -- Direct phone is invalid but mobile is valid
          (c.direct_phone_e164 IS NOT NULL AND (
            LENGTH(c.direct_phone_e164) > 16
            OR c.direct_phone_e164 LIKE '%00000000%'
            OR LENGTH(c.direct_phone_e164) < 11
          ))
          AND c.mobile_phone_e164 IS NOT NULL
          AND LENGTH(c.mobile_phone_e164) BETWEEN 11 AND 16
          AND c.mobile_phone_e164 NOT LIKE '%00000000%'
        )
    `);

    allFixableContacts.push(...(fixableContacts.rows || []));
  }

  const fixableCount = allFixableContacts.length;

  if (fixableCount > 0) {
    console.log(`💡 Found ${fixableCount} contacts where we can copy mobile phone to direct phone:`);

    for (const row of allFixableContacts) {
      const c = row as any;
      if (c.valid_phone) {
        await db.execute(sql`
          UPDATE contacts
          SET direct_phone_e164 = ${c.valid_phone},
              updated_at = NOW()
          WHERE id = ${c.id}
        `);
        console.log(`   ✅ Fixed: ${c.full_name} - copied mobile (${c.valid_phone}) to direct phone`);
      }
    }
    console.log("");
  } else {
    console.log("ℹ️  No contacts can be auto-corrected (all phones are invalid)\n");
  }

  // Step 4: Summary
  console.log("================================================================================");
  console.log("CLEANUP SUMMARY");
  console.log("================================================================================\n");

  console.log(`📊 Total invalid contacts found: ${invalidContacts.rows.length}`);
  console.log(`🗑️  Queue items removed: ${removedCount}`);
  console.log(`🔧 Contacts auto-fixed: ${fixableCount}`);
  console.log("");

  console.log("✅ Cleanup complete!\n");

  console.log("NEXT STEPS:");
  console.log("1. Review the contacts listed above");
  console.log("2. Either delete them or manually fix their phone numbers");
  console.log("3. If you fixed phone numbers, re-add them to campaigns");
  console.log("4. Run your campaign again - invalid numbers are now skipped");
  console.log("");

  process.exit(0);
}

cleanupInvalidPhones().catch((error) => {
  console.error("❌ Error during cleanup:", error);
  process.exit(1);
});
