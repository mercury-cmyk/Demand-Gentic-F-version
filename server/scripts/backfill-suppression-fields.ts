import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Backfill normalized suppression fields in contacts and suppression_list tables
 * This script computes:
 * - email_norm (lowercase, trimmed)
 * - full_name_norm (lowercase, trimmed, collapsed whitespace)
 * - company_norm (lowercase, trimmed, collapsed whitespace from account name)
 * - name_company_hash (SHA256 of full_name_norm|company_norm)
 */

async function backfillContacts() {
  console.log("Backfilling normalized fields in contacts table...");
  
  try {
    // Update contacts with normalized fields
    const result = await db.execute(sql`
      UPDATE contacts c
      SET
        full_name_norm = LOWER(TRIM(REGEXP_REPLACE(
          COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''),
          '\\s+', ' ', 'g'
        ))),
        company_norm = (
          SELECT LOWER(TRIM(REGEXP_REPLACE(COALESCE(a.name, ''), '\\s+', ' ', 'g')))
          FROM accounts a
          WHERE a.id = c.account_id
        ),
        name_company_hash = (
          SELECT ENCODE(DIGEST(
            LOWER(TRIM(REGEXP_REPLACE(
              COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''),
              '\\s+', ' ', 'g'
            ))) || '|' ||
            LOWER(TRIM(REGEXP_REPLACE(COALESCE(a.name, ''), '\\s+', ' ', 'g')))
          , 'sha256'), 'hex')
          FROM accounts a
          WHERE a.id = c.account_id
            AND TRIM(COALESCE(c.first_name, '')) != ''
            AND TRIM(COALESCE(c.last_name, '')) != ''
            AND TRIM(COALESCE(a.name, '')) != ''
        )
      WHERE c.deleted_at IS NULL
    `);
    
    console.log("✓ Contacts table backfilled successfully");
  } catch (error) {
    console.error("Error backfilling contacts:", error);
    throw error;
  }
}

async function backfillSuppressionList() {
  console.log("Backfilling normalized fields in suppression_list table...");
  
  try {
    // Update suppression_list with normalized fields
    const result = await db.execute(sql`
      UPDATE suppression_list
      SET
        email_norm = LOWER(TRIM(email)),
        full_name_norm = LOWER(TRIM(REGEXP_REPLACE(COALESCE(full_name, ''), '\\s+', ' ', 'g'))),
        company_norm = LOWER(TRIM(REGEXP_REPLACE(COALESCE(company_name, ''), '\\s+', ' ', 'g'))),
        name_company_hash = CASE
          WHEN TRIM(COALESCE(full_name, '')) != '' AND TRIM(COALESCE(company_name, '')) != ''
          THEN ENCODE(DIGEST(
            LOWER(TRIM(REGEXP_REPLACE(COALESCE(full_name, ''), '\\s+', ' ', 'g'))) || '|' ||
            LOWER(TRIM(REGEXP_REPLACE(COALESCE(company_name, ''), '\\s+', ' ', 'g')))
          , 'sha256'), 'hex')
          ELSE NULL
        END
      WHERE email_norm IS NULL OR full_name_norm IS NULL OR company_norm IS NULL
    `);
    
    console.log("✓ Suppression list backfilled successfully");
  } catch (error) {
    console.error("Error backfilling suppression_list:", error);
    throw error;
  }
}

async function main() {
  console.log("Starting backfill of suppression fields...\n");
  
  await backfillContacts();
  await backfillSuppressionList();
  
  console.log("\n✅ Backfill completed successfully!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error during backfill:", error);
  process.exit(1);
});
