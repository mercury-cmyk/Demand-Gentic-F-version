import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('=== Checking E164 Phone Data ===\n');

  // Check direct_phone_e164 values
  const contactsWithPhones = await db.execute(sql`
    SELECT first_name, direct_phone, direct_phone_e164, mobile_phone_e164, country 
    FROM contacts 
    WHERE direct_phone_e164 IS NOT NULL AND direct_phone_e164 != '' 
    LIMIT 30
  `);

  console.log('Contacts with E164 phone numbers:');
  (contactsWithPhones.rows as any[]).forEach((c, i) => {
    const hasIssue = c.direct_phone_e164?.startsWith('+0');
    console.log(`${i + 1}. ${c.first_name} | Raw: "${c.direct_phone}" | E164: "${c.direct_phone_e164}" | Country: "${c.country}"${hasIssue ? '  {
    console.log(`${i + 1}. ${c.first_name} | Raw: "${c.direct_phone}" | E164: "${c.direct_phone_e164}" | Country: "${c.country}"`);
  });

  // Count total bad numbers
  const badCount = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM contacts 
    WHERE direct_phone_e164 LIKE '+0%' OR mobile_phone_e164 LIKE '+0%'
  `);
  console.log(`\nTotal contacts with +0 format: ${(badCount.rows[0] as any).cnt}`);

  process.exit(0);
}

main().catch(console.error);