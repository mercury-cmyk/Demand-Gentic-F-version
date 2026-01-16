import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkProblemContact() {
  console.log("================================================================================");
  console.log("CHECKING PROBLEM CONTACT FROM ERROR LOG");
  console.log("================================================================================\n");

  const contactId = 'f5b4a37d-bda7-4729-affc-108903d1abab';

  const contact = await db.execute(sql`
    SELECT
      c.id,
      c.full_name,
      c.direct_phone,
      c.direct_phone_e164,
      c.mobile_phone,
      c.mobile_phone_e164,
      a.name as account_name,
      cq.id as queue_id,
      cq.dialed_number,
      cq.status as queue_status,
      camp.name as campaign_name
    FROM contacts c
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaign_queue cq ON cq.contact_id = c.id
    LEFT JOIN campaigns camp ON camp.id = cq.campaign_id
    WHERE c.id = ${contactId}
  `);

  if (contact.rows.length === 0) {
    console.log(`❌ Contact ${contactId} not found\n`);
  } else {
    const c = contact.rows[0] as any;
    console.log(`Contact: ${c.full_name}`);
    console.log(`Account: ${c.account_name}`);
    console.log(`Campaign: ${c.campaign_name || 'N/A'}`);
    console.log(`Queue Status: ${c.queue_status || 'Not in queue'}`);
    console.log(`\nPhone Numbers:`);
    console.log(`  Direct Phone: ${c.direct_phone || 'NULL'}`);
    console.log(`  Direct Phone E164: ${c.direct_phone_e164 || 'NULL'}`);
    console.log(`  Mobile Phone: ${c.mobile_phone || 'NULL'}`);
    console.log(`  Mobile Phone E164: ${c.mobile_phone_e164 || 'NULL'}`);
    console.log(`  Dialed Number (from queue): ${c.dialed_number || 'NULL'}`);

    const effectivePhone = c.dialed_number || c.direct_phone_e164 || c.mobile_phone_e164 || c.direct_phone || c.mobile_phone;
    console.log(`\n  Effective Phone: ${effectivePhone || 'NULL'}`);

    const isValid = effectivePhone && /^\+\d{10,15}$/.test(effectivePhone);
    console.log(`  Format Check: ${isValid ? '✅ Valid E.164' : '❌ Invalid'}`);

    if (!isValid) {
      console.log(`\n⚠️  PROBLEM IDENTIFIED:`);
      console.log(`  This contact has an invalid phone number!`);
      console.log(`  The orchestrator cannot dial this contact.`);
    }
  }

  // Check how many contacts in the queue have similar issues
  console.log(`\n================================================================================`);
  console.log(`CHECKING FOR MORE PROBLEM CONTACTS\n`);

  const problemContacts = await db.execute(sql`
    SELECT
      c.id,
      c.full_name,
      c.direct_phone,
      c.direct_phone_e164,
      c.mobile_phone,
      c.mobile_phone_e164,
      a.name as account_name
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    JOIN accounts a ON a.id = c.account_id
    JOIN campaigns camp ON camp.id = cq.campaign_id
    WHERE camp.name = 'Agentic DemandGen for Pivotal B2B_Waterfall'
      AND cq.status = 'queued'
      AND cq.next_attempt_at <= NOW()
      AND (
        (c.direct_phone_e164 IS NULL OR c.direct_phone_e164 = '' OR c.direct_phone_e164 NOT LIKE '+%')
        AND (c.mobile_phone_e164 IS NULL OR c.mobile_phone_e164 = '' OR c.mobile_phone_e164 NOT LIKE '+%')
        AND (c.direct_phone IS NULL OR c.direct_phone = '' OR c.direct_phone NOT LIKE '+%')
        AND (c.mobile_phone IS NULL OR c.mobile_phone = '' OR c.mobile_phone NOT LIKE '+%')
      )
    LIMIT 10
  `);

  if (problemContacts.rows.length === 0) {
    console.log(`✅ No obvious phone number problems found in ready contacts\n`);
  } else {
    console.log(`⚠️  Found ${problemContacts.rows.length} contacts with potential phone issues:\n`);
    problemContacts.rows.forEach((c: any, idx: number) => {
      console.log(`${idx + 1}. ${c.full_name} at ${c.account_name}`);
      console.log(`   All phone fields: Direct=${c.direct_phone}, DirectE164=${c.direct_phone_e164}, Mobile=${c.mobile_phone}, MobileE164=${c.mobile_phone_e164}`);
      console.log(``);
    });
  }

  console.log(`================================================================================`);

  process.exit(0);
}

checkProblemContact().catch(console.error);
