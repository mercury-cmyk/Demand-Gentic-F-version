/**
 * Backfill Phone Normalization
 *
 * Re-normalizes directPhoneE164 and mobilePhoneE164 for all contacts
 * using the contact's country field for correct country-code resolution.
 *
 * Also re-normalizes mainPhoneE164 on accounts using hqCountry.
 *
 * Usage:
 *   npx tsx scripts/backfill-phone-normalization.ts          # dry-run (default)
 *   npx tsx scripts/backfill-phone-normalization.ts --apply   # actually write changes
 */

import { db, pool } from '../server/db';
import { formatPhoneWithCountryCode } from '../server/lib/phone-formatter';

const DRY_RUN = !process.argv.includes('--apply');
const BATCH_SIZE = 500;

interface PhoneUpdate {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  rawPhone: string;
  country: string | null;
}

async function backfillContacts() {
  console.log('\n=== Backfill Contact Phone Numbers ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --apply to write)' : 'APPLYING CHANGES'}\n`);

  // Count contacts with phone numbers
  const { rows: [stats] } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(direct_phone) as has_direct,
      COUNT(direct_phone_e164) as has_direct_e164,
      COUNT(mobile_phone) as has_mobile,
      COUNT(mobile_phone_e164) as has_mobile_e164,
      COUNT(country) as has_country
    FROM contacts
    WHERE direct_phone IS NOT NULL OR mobile_phone IS NOT NULL
  `);

  console.log('Contact phone stats:');
  console.log(`  Total with any phone: ${stats.total}`);
  console.log(`  Has directPhone: ${stats.has_direct} (E164: ${stats.has_direct_e164})`);
  console.log(`  Has mobilePhone: ${stats.has_mobile} (E164: ${stats.has_mobile_e164})`);
  console.log(`  Has country: ${stats.has_country}`);

  // Process in batches
  let offset = 0;
  let totalUpdated = 0;
  let totalDirectFixed = 0;
  let totalMobileFixed = 0;
  let totalSkipped = 0;
  const changes: PhoneUpdate[] = [];

  while (true) {
    const { rows: contacts } = await pool.query(`
      SELECT id, direct_phone, direct_phone_e164, mobile_phone, mobile_phone_e164, country
      FROM contacts
      WHERE direct_phone IS NOT NULL OR mobile_phone IS NOT NULL
      ORDER BY id
      LIMIT $1 OFFSET $2
    `, [BATCH_SIZE, offset]);

    if (contacts.length === 0) break;

    for (const contact of contacts) {
      let directChanged = false;
      let mobileChanged = false;

      // Re-normalize direct phone
      if (contact.direct_phone) {
        const newE164 = formatPhoneWithCountryCode(contact.direct_phone, contact.country);
        if (newE164 && newE164 !== contact.direct_phone_e164) {
          changes.push({
            id: contact.id,
            field: 'direct_phone_e164',
            oldValue: contact.direct_phone_e164,
            newValue: newE164,
            rawPhone: contact.direct_phone,
            country: contact.country,
          });
          directChanged = true;
          totalDirectFixed++;

          if (!DRY_RUN) {
            await pool.query(
              `UPDATE contacts SET direct_phone_e164 = $1, updated_at = NOW() WHERE id = $2`,
              [newE164, contact.id]
            );
          }
        }
      }

      // Re-normalize mobile phone
      if (contact.mobile_phone) {
        const newE164 = formatPhoneWithCountryCode(contact.mobile_phone, contact.country);
        if (newE164 && newE164 !== contact.mobile_phone_e164) {
          changes.push({
            id: contact.id,
            field: 'mobile_phone_e164',
            oldValue: contact.mobile_phone_e164,
            newValue: newE164,
            rawPhone: contact.mobile_phone,
            country: contact.country,
          });
          mobileChanged = true;
          totalMobileFixed++;

          if (!DRY_RUN) {
            await pool.query(
              `UPDATE contacts SET mobile_phone_e164 = $1, updated_at = NOW() WHERE id = $2`,
              [newE164, contact.id]
            );
          }
        }
      }

      if (directChanged || mobileChanged) {
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }

    offset += contacts.length;
    process.stdout.write(`\r  Processed ${offset} contacts...`);
  }

  console.log(`\n\n  Results:`);
  console.log(`    Contacts updated: ${totalUpdated}`);
  console.log(`    Direct phones fixed: ${totalDirectFixed}`);
  console.log(`    Mobile phones fixed: ${totalMobileFixed}`);
  console.log(`    Skipped (no change): ${totalSkipped}`);

  // Show sample changes
  if (changes.length > 0) {
    console.log(`\n  Sample changes (first 20):`);
    for (const c of changes.slice(0, 20)) {
      console.log(`    [${c.field}] ${c.rawPhone} (${c.country || 'no country'}) : ${c.oldValue || 'NULL'} → ${c.newValue}`);
    }
    if (changes.length > 20) {
      console.log(`    ... and ${changes.length - 20} more`);
    }
  }

  return changes.length;
}

async function backfillAccounts() {
  console.log('\n=== Backfill Account Phone Numbers ===\n');

  const { rows: [stats] } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(main_phone) as has_phone,
      COUNT(main_phone_e164) as has_e164,
      COUNT(hq_country) as has_country
    FROM accounts
    WHERE main_phone IS NOT NULL
  `);

  console.log('Account phone stats:');
  console.log(`  Total with mainPhone: ${stats.has_phone} (E164: ${stats.has_e164})`);
  console.log(`  Has hqCountry: ${stats.has_country}`);

  let offset = 0;
  let totalFixed = 0;

  while (true) {
    const { rows: accounts } = await pool.query(`
      SELECT id, main_phone, main_phone_e164, hq_country
      FROM accounts
      WHERE main_phone IS NOT NULL
      ORDER BY id
      LIMIT $1 OFFSET $2
    `, [BATCH_SIZE, offset]);

    if (accounts.length === 0) break;

    for (const account of accounts) {
      const newE164 = formatPhoneWithCountryCode(account.main_phone, account.hq_country);
      if (newE164 && newE164 !== account.main_phone_e164) {
        totalFixed++;
        if (!DRY_RUN) {
          await pool.query(
            `UPDATE accounts SET main_phone_e164 = $1, updated_at = NOW() WHERE id = $2`,
            [newE164, account.id]
          );
        }
      }
    }

    offset += accounts.length;
  }

  console.log(`  Accounts fixed: ${totalFixed}`);
  return totalFixed;
}

async function main() {
  console.log('=============================================');
  console.log('  Phone Number Normalization Backfill');
  console.log('=============================================');

  const contactChanges = await backfillContacts();
  const accountChanges = await backfillAccounts();

  console.log('\n=============================================');
  console.log(`  Total changes: ${contactChanges + accountChanges}`);
  if (DRY_RUN) {
    console.log('  This was a DRY RUN. Run with --apply to write changes.');
  } else {
    console.log('  All changes applied successfully.');
  }
  console.log('=============================================\n');

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});