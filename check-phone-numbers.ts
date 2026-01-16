import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkPhoneNumbers() {
  console.log("================================================================================");
  console.log("PHONE NUMBER FORMAT CHECK");
  console.log("================================================================================\n");

  // Check phone numbers in ready queue
  const phoneCheck = await db.execute(sql`
    SELECT
      c.id as contact_id,
      c.full_name,
      c.direct_phone,
      c.direct_phone_e164,
      c.mobile_phone,
      c.mobile_phone_e164,
      a.name as account_name,
      cq.id as queue_id,
      cq.dialed_number
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    JOIN accounts a ON a.id = c.account_id
    JOIN campaigns camp ON camp.id = cq.campaign_id
    WHERE camp.name = 'Agentic DemandGen for Pivotal B2B_Waterfall'
      AND cq.status = 'queued'
      AND cq.next_attempt_at <= NOW()
    LIMIT 20
  `);

  console.log(`📱 Phone Numbers in Ready Queue (${phoneCheck.rows.length} shown):\n`);

  let validCount = 0;
  let invalidCount = 0;
  const issues: string[] = [];

  phoneCheck.rows.forEach((contact: any, idx: number) => {
    const phone = contact.dialed_number || contact.direct_phone_e164 || contact.mobile_phone_e164 || contact.direct_phone || contact.mobile_phone;
    const isValid = phone && /^\+\d{10,15}$/.test(phone);

    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
      issues.push(`${contact.full_name} at ${contact.account_name}: "${phone || 'NULL'}"`);
    }

    console.log(`${idx + 1}. ${contact.full_name} at ${contact.account_name}`);
    console.log(`   Direct Phone: ${contact.direct_phone || 'NULL'}`);
    console.log(`   Direct Phone E164: ${contact.direct_phone_e164 || 'NULL'}`);
    console.log(`   Mobile Phone: ${contact.mobile_phone || 'NULL'}`);
    console.log(`   Mobile Phone E164: ${contact.mobile_phone_e164 || 'NULL'}`);
    console.log(`   Dialed Number: ${contact.dialed_number || 'NULL'}`);
    console.log(`   Effective Phone: ${phone || 'NULL'}`);
    console.log(`   Status: ${isValid ? '✅ Valid E.164' : '❌ Invalid format'}`);
    console.log("");
  });

  console.log("================================================================================");
  console.log("SUMMARY\n");
  console.log(`✅ Valid phone numbers: ${validCount}`);
  console.log(`❌ Invalid phone numbers: ${invalidCount}\n`);

  if (invalidCount > 0) {
    console.log("⚠️  PROBLEM IDENTIFIED:");
    console.log("   Contacts have invalid phone numbers (not in +E164 format)");
    console.log("   E.164 format requires: +[country code][number]");
    console.log("   Example: +14155551234\n");

    console.log("Sample invalid numbers:");
    issues.slice(0, 5).forEach(issue => console.log(`   - ${issue}`));

    console.log("\n💡 SOLUTIONS:");
    console.log("   1. Update contacts with valid phone numbers in +E164 format");
    console.log("   2. Check data import - phone numbers may need country code prefix");
    console.log("   3. Run phone number normalization script to fix existing contacts");
  }

  // Check total queue stats
  const queueStats = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE c.direct_phone_e164 LIKE '+%' OR c.mobile_phone_e164 LIKE '+%' OR c.direct_phone LIKE '+%' OR c.mobile_phone LIKE '+%') as with_plus,
      COUNT(*) FILTER (WHERE (c.direct_phone IS NULL OR c.direct_phone = '') AND (c.mobile_phone IS NULL OR c.mobile_phone = '') AND (c.direct_phone_e164 IS NULL OR c.direct_phone_e164 = '') AND (c.mobile_phone_e164 IS NULL OR c.mobile_phone_e164 = '')) as no_phone,
      COUNT(*) as total
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    JOIN campaigns camp ON camp.id = cq.campaign_id
    WHERE camp.name = 'Agentic DemandGen for Pivotal B2B_Waterfall'
      AND cq.status = 'queued'
  `);

  const stats = queueStats.rows[0] as any;
  console.log("\n================================================================================");
  console.log("FULL QUEUE PHONE NUMBER STATS\n");
  console.log(`Total queued contacts: ${stats.total}`);
  console.log(`With + prefix (likely valid): ${stats.with_plus}`);
  console.log(`Without phone number: ${stats.no_phone}`);
  console.log(`Potentially invalid: ${stats.total - stats.with_plus - stats.no_phone}`);

  console.log("\n================================================================================");

  process.exit(0);
}

checkPhoneNumbers().catch(console.error);
