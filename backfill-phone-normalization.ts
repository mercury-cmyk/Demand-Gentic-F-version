/**
 * Backfill phone normalization for all contacts
 * Re-normalizes directPhoneE164 and mobilePhoneE164 using the contacts country.
 *
 * Run: npx tsx backfill-phone-normalization.ts
 * Dry run: npx tsx backfill-phone-normalization.ts --dry-run
 */
import { pool } from "./server/db";
import { formatPhoneWithCountryCode } from "./server/lib/phone-formatter";

const BATCH_SIZE = 500;
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log("=== Backfill Phone Normalization ===");
  console.log("Mode:", DRY_RUN ? "DRY RUN" : "LIVE");

  const stats = await pool.query("SELECT COUNT(*) as total, COUNT(direct_phone) as has_direct, COUNT(direct_phone_e164) as has_direct_e164, COUNT(mobile_phone) as has_mobile, COUNT(mobile_phone_e164) as has_mobile_e164, COUNT(country) as has_country FROM contacts");
  console.log("Stats:", stats.rows[0]);

  const countResult = await pool.query("SELECT COUNT(*) as count FROM contacts WHERE (direct_phone IS NOT NULL OR mobile_phone IS NOT NULL) AND country IS NOT NULL");
  const total = parseInt(countResult.rows[0].count);
  console.log("To process:", total);

  let offset = 0, updated = 0, directFixed = 0, mobileFixed = 0, skipped = 0;
  const samples: string[] = [];

  while (offset < total) {
    const batch = await pool.query("SELECT id, direct_phone, direct_phone_e164, mobile_phone, mobile_phone_e164, country FROM contacts WHERE (direct_phone IS NOT NULL OR mobile_phone IS NOT NULL) AND country IS NOT NULL ORDER BY id LIMIT $1 OFFSET $2", [BATCH_SIZE, offset]);
    if (batch.rows.length === 0) break;

    for (const c of batch.rows) {
      let newDirect: string | null = null;
      let newMobile: string | null = null;
      let changed = false;

      if (c.direct_phone) {
        newDirect = formatPhoneWithCountryCode(c.direct_phone, c.country);
        if (newDirect && newDirect !== c.direct_phone_e164) {
          changed = true;
          directFixed++;
          if (samples.length < 15) samples.push("DIRECT: " + c.direct_phone + " (" + c.country + ") " + (c.direct_phone_e164 || "NULL") + " -> " + newDirect);
        }
      }
      if (c.mobile_phone) {
        newMobile = formatPhoneWithCountryCode(c.mobile_phone, c.country);
        if (newMobile && newMobile !== c.mobile_phone_e164) {
          changed = true;
          mobileFixed++;
          if (samples.length < 15) samples.push("MOBILE: " + c.mobile_phone + " (" + c.country + ") " + (c.mobile_phone_e164 || "NULL") + " -> " + newMobile);
        }
      }

      if (changed && !DRY_RUN) {
        const sets: string[] = [];
        const params: any[] = [];
        let i = 1;
        if (newDirect && newDirect !== c.direct_phone_e164) { sets.push("direct_phone_e164 = $" + (i++)); params.push(newDirect); }
        if (newMobile && newMobile !== c.mobile_phone_e164) { sets.push("mobile_phone_e164 = $" + (i++)); params.push(newMobile); }
        if (sets.length > 0) {
          sets.push("updated_at = NOW()");
          params.push(c.id);
          await pool.query("UPDATE contacts SET " + sets.join(", ") + " WHERE id = $" + i, params);
          updated++;
        }
      } else if (!changed) { skipped++; }
    }

    offset += batch.rows.length;
    if (offset % 5000 === 0 || offset >= total) console.log("Progress: " + offset + "/" + total + " (" + updated + " updated, " + skipped + " unchanged)");
  }

  console.log("\n=== Results ===");
  console.log("Processed: " + offset + " | Direct fixed: " + directFixed + " | Mobile fixed: " + mobileFixed + " | Updated: " + updated + " | Unchanged: " + skipped);
  if (samples.length > 0) { console.log("\nSamples:"); samples.forEach(s => console.log("  " + s)); }
  if (DRY_RUN) console.log("\nDRY RUN - no changes made. Remove --dry-run to apply.");

  await pool.end();
  process.exit(0);
}

main().catch(err => { console.error("Failed:", err); process.exit(1); });
