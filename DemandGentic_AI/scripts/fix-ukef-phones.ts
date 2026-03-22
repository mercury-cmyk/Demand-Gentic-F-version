#!/usr/bin/env tsx
/**
 * UKEF_Q12026 Phone Data Fix Script (Optimized — batch SQL)
 *
 * Fixes applied:
 * 1. Country name normalization ("United Kingdom Uk" → "United Kingdom")
 * 2. Empty string phone cleanup ('' → NULL)
 * 3. Account main_phone → main_phone_e164 normalization (batch)
 * 4. Contact phone re-normalization (scientific notation cleanup)
 * 5. Backfill dialing_phone_e164 from account HQ phone
 *
 * Usage:
 *   npx tsx scripts/fix-ukef-phones.ts                        # runs on DATABASE_URL
 *   DATABASE_URL="postgresql://..." npx tsx scripts/fix-ukef-phones.ts  # runs on specific DB
 */

import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import { normalizePhoneE164 } from '../server/normalization';
import { isValidE164 } from '../server/lib/phone-utils';

const CAMPAIGN_ID = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
const BATCH_SIZE = 1000;

function getConnectionUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
  return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT || '5432'}/${PGDATABASE}?sslmode=require`;
}

const connUrl = getConnectionUrl();
const dbEndpoint = connUrl.match(/ep-[^.]+/)?.[0] || 'unknown';
console.log(`\n${'='.repeat(70)}`);
console.log(`  UKEF Phone Fix — targeting: ${dbEndpoint}`);
console.log(`${'='.repeat(70)}\n`);

const pool = new Pool({ connectionString: connUrl, ssl: { rejectUnauthorized: false }, max: 5 });

// ─── Phase 1: Country Name Normalization ────────────────────────────────────

async function fixCountryNames() {
  console.log('── Phase 1: Country Name Normalization ──');
  const check = await pool.query(`
    SELECT country, count(*) as cnt FROM contacts
    WHERE country ILIKE '%united kingdom%' GROUP BY country ORDER BY cnt DESC
  `);
  console.log('  Current UK variants:');
  for (const r of check.rows) console.log(`    "${r.country}": ${r.cnt}`);

  const r1 = await pool.query(`UPDATE contacts SET country = 'United Kingdom' WHERE country IN ('United Kingdom Uk', 'Gb United Kingdom Uk', 'Cf United Kingdom')`);
  console.log(`  ✓ Fixed ${r1.rowCount} contacts`);
  const r2 = await pool.query(`UPDATE accounts SET hq_country = 'United Kingdom' WHERE hq_country IN ('United Kingdom Uk', 'Gb United Kingdom Uk', 'Cf United Kingdom')`);
  console.log(`  ✓ Fixed ${r2.rowCount} accounts`);
}

// ─── Phase 2: Empty String → NULL Cleanup ───────────────────────────────────

async function fixEmptyStrings() {
  console.log('\n── Phase 2: Empty String Cleanup ──');
  const r1 = await pool.query(`UPDATE contacts SET direct_phone = NULL WHERE direct_phone = ''`);
  const r2 = await pool.query(`UPDATE contacts SET mobile_phone = NULL WHERE mobile_phone = ''`);
  const r3 = await pool.query(`UPDATE contacts SET direct_phone_e164 = NULL WHERE direct_phone_e164 = ''`);
  const r4 = await pool.query(`UPDATE contacts SET mobile_phone_e164 = NULL WHERE mobile_phone_e164 = ''`);
  const r5 = await pool.query(`UPDATE contacts SET dialing_phone_e164 = NULL WHERE dialing_phone_e164 = ''`);
  const r6 = await pool.query(`UPDATE accounts SET main_phone = NULL WHERE main_phone = ''`);
  const r7 = await pool.query(`UPDATE accounts SET main_phone_e164 = NULL WHERE main_phone_e164 = ''`);
  console.log(`  ✓ Contacts: direct=${r1.rowCount}, mobile=${r2.rowCount}, direct_e164=${r3.rowCount}, mobile_e164=${r4.rowCount}, dialing=${r5.rowCount}`);
  console.log(`  ✓ Accounts: main_phone=${r6.rowCount}, main_phone_e164=${r7.rowCount}`);
}

// ─── Phase 3: Normalize Account Phones (BATCH) ─────────────────────────────

async function normalizeAccountPhones() {
  console.log('\n── Phase 3: Account Phone Normalization (batch) ──');

  // Count how many still need normalization
  const countRes = await pool.query(`
    SELECT count(DISTINCT a.id) as cnt
    FROM accounts a
    JOIN campaign_queue cq ON cq.account_id = a.id
    WHERE cq.campaign_id = $1
      AND a.main_phone IS NOT NULL
      AND a.main_phone_e164 IS NULL
  `, [CAMPAIGN_ID]);
  const remaining = parseInt(countRes.rows[0].cnt);
  console.log(`  Accounts still needing normalization: ${remaining}`);

  if (remaining === 0) {
    console.log('  ✓ All accounts already normalized');
    return;
  }

  // Fetch ALL account IDs at once, process in JS chunks
  const allAccounts = await pool.query(`
    SELECT DISTINCT a.id, a.main_phone, a.hq_country
    FROM accounts a
    JOIN campaign_queue cq ON cq.account_id = a.id
    WHERE cq.campaign_id = $1
      AND a.main_phone IS NOT NULL
      AND a.main_phone_e164 IS NULL
  `, [CAMPAIGN_ID]);

  let totalNormalized = 0;
  let totalFailed = 0;
  const rows = allAccounts.rows;

  for (let i = 0; i  = [];

    for (const acc of chunk) {
      const normalized = normalizePhoneE164(acc.main_phone, acc.hq_country || 'United Kingdom');
      if (normalized && isValidE164(normalized)) {
        updates.push({ id: acc.id, e164: normalized });
      } else {
        totalFailed++;
      }
    }

    if (updates.length > 0) {
      const valuesClause = updates.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(', ');
      const params = updates.flatMap(u => [u.id, u.e164]);
      await pool.query(`
        UPDATE accounts a SET main_phone_e164 = v.e164
        FROM (VALUES ${valuesClause}) AS v(id, e164)
        WHERE a.id = v.id
      `, params);
      totalNormalized += updates.length;
    }

    if ((i / BATCH_SIZE + 1) % 5 === 0) {
      console.log(`  ... processed ${i + chunk.length}/${rows.length}: ${totalNormalized} ok, ${totalFailed} failed`);
    }
  }

  console.log(`  ✓ Normalized: ${totalNormalized} accounts`);
  if (totalFailed > 0) console.log(`  ✗ Failed: ${totalFailed} (un-normalizable raw numbers)`);
}

// ─── Phase 4: Fix Bad Contact E.164 ────────────────────────────────────────

async function fixBadContactE164() {
  console.log('\n── Phase 4: Bad E.164 Cleanup ──');

  const r1 = await pool.query(`
    UPDATE contacts
    SET direct_phone_e164 = NULL, dialing_phone_e164 = NULL
    WHERE direct_phone_e164 IS NOT NULL
      AND (direct_phone_e164 ~ '0{5,}' OR length(direct_phone_e164) > 16 OR direct_phone ~ '[eE][+]')
  `);
  console.log(`  ✓ Cleared ${r1.rowCount} bad direct_phone_e164`);

  const r2 = await pool.query(`
    UPDATE contacts SET mobile_phone_e164 = NULL
    WHERE mobile_phone_e164 IS NOT NULL
      AND (mobile_phone_e164 ~ '0{5,}' OR length(mobile_phone_e164) > 16 OR mobile_phone ~ '[eE][+]')
  `);
  console.log(`  ✓ Cleared ${r2.rowCount} bad mobile_phone_e164`);

  const r3 = await pool.query(`
    UPDATE contacts SET direct_phone = NULL, direct_phone_e164 = NULL, dialing_phone_e164 = NULL
    WHERE direct_phone IS NOT NULL AND direct_phone !~ '^[0-9+() \\-\\.]+$'
  `);
  console.log(`  ✓ Cleared ${r3.rowCount} non-numeric phone values`);
}

// ─── Phase 5: Re-normalize Contact Phones (BATCH) ──────────────────────────

async function renormalizeContactPhones() {
  console.log('\n── Phase 5: Re-normalize Contact Phones (batch) ──');

  // Fetch all contacts needing normalization at once
  const allContacts = await pool.query(`
    SELECT c.id, c.direct_phone, c.country
    FROM contacts c
    JOIN campaign_queue cq ON cq.contact_id = c.id
    WHERE cq.campaign_id = $1
      AND c.direct_phone IS NOT NULL
      AND c.direct_phone !~ '[eE][+]'
      AND c.direct_phone_e164 IS NULL
  `, [CAMPAIGN_ID]);

  console.log(`  Contacts needing re-normalization: ${allContacts.rows.length}`);
  let totalFixed = 0;
  const rows = allContacts.rows;

  for (let i = 0; i  = [];

    for (const contact of chunk) {
      const e164 = normalizePhoneE164(contact.direct_phone, contact.country || 'United Kingdom');
      if (e164 && isValidE164(e164)) {
        updates.push({ id: contact.id, e164 });
      }
    }

    if (updates.length > 0) {
      const valuesClause = updates.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(', ');
      const params = updates.flatMap(u => [u.id, u.e164]);
      await pool.query(`
        UPDATE contacts c
        SET direct_phone_e164 = v.e164, dialing_phone_e164 = v.e164
        FROM (VALUES ${valuesClause}) AS v(id, e164)
        WHERE c.id = v.id
      `, params);
      totalFixed += updates.length;
    }
  }

  console.log(`  ✓ Re-normalized ${totalFixed} contact phones`);
}

// ─── Phase 6: Backfill from Account HQ Phone ───────────────────────────────

async function backfillFromAccountPhone() {
  console.log('\n── Phase 6: Backfill from Account HQ Phone ──');

  // Step A: Bulk SQL backfill (fast path — accounts already have main_phone_e164)
  const res = await pool.query(`
    UPDATE contacts c
    SET dialing_phone_e164 = a.main_phone_e164
    FROM campaign_queue cq
    JOIN accounts a ON a.id = cq.account_id
    WHERE cq.contact_id = c.id
      AND cq.campaign_id = $1
      AND c.dialing_phone_e164 IS NULL
      AND a.main_phone_e164 IS NOT NULL
      AND a.main_phone_e164 ~ '^\\+[1-9]\\d{7,14}$'
  `, [CAMPAIGN_ID]);
  console.log(`  ✓ Bulk backfilled ${res.rowCount} contacts`);

  // Step B: For remaining contacts, try normalizing raw account phone on-the-fly
  const remaining = await pool.query(`
    SELECT DISTINCT ON (c.id) c.id as contact_id, a.main_phone, a.hq_country, c.country as contact_country
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    JOIN accounts a ON a.id = cq.account_id
    WHERE cq.campaign_id = $1
      AND c.dialing_phone_e164 IS NULL
      AND a.main_phone IS NOT NULL
  `, [CAMPAIGN_ID]);

  console.log(`  Remaining contacts to try raw account phone: ${remaining.rows.length}`);
  let rescued = 0;
  const rows = remaining.rows;

  for (let i = 0; i  = [];

    for (const row of chunk) {
      const countries = [row.contact_country, row.hq_country, 'United Kingdom'].filter(Boolean);
      let e164: string | null = null;
      for (const country of countries) {
        e164 = normalizePhoneE164(row.main_phone, country);
        if (e164 && isValidE164(e164)) break;
        e164 = null;
      }
      if (e164) {
        updates.push({ id: row.contact_id, e164 });
      }
    }

    if (updates.length > 0) {
      const valuesClause = updates.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(', ');
      const params = updates.flatMap(u => [u.id, u.e164]);
      await pool.query(`
        UPDATE contacts c SET dialing_phone_e164 = v.e164
        FROM (VALUES ${valuesClause}) AS v(id, e164)
        WHERE c.id = v.id
      `, params);
      rescued += updates.length;
    }

    if ((i / BATCH_SIZE + 1) % 5 === 0) console.log(`  ... processed ${i + chunk.length}/${rows.length}: ${rescued} rescued`);
  }

  console.log(`  ✓ Rescued ${rescued} more via raw account phone normalization`);
}

// ─── Phase 7: Final Stats ──────────────────────────────────────────────────

async function printFinalStats() {
  console.log('\n── Final Results ──');

  const stats = await pool.query(`
    SELECT
      count(*) as total_queued,
      count(c.dialing_phone_e164) as has_dialing,
      count(c.direct_phone_e164) as has_direct_e164,
      count(c.direct_phone) as has_direct_raw,
      count(CASE WHEN c.dialing_phone_e164 IS NULL THEN 1 END) as still_missing,
      ROUND(count(c.dialing_phone_e164)::numeric / NULLIF(count(*), 0) * 100, 1) as pct_coverage
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = $1 AND cq.status = 'queued'
  `, [CAMPAIGN_ID]);

  const s = stats.rows[0];
  console.log(`  Total queued:        ${s.total_queued}`);
  console.log(`  Has dialing phone:   ${s.has_dialing} (${s.pct_coverage}%)`);
  console.log(`  Has direct E.164:    ${s.has_direct_e164}`);
  console.log(`  Has direct raw:      ${s.has_direct_raw}`);
  console.log(`  Still missing phone: ${s.still_missing}`);

  const countries = await pool.query(`
    SELECT COALESCE(c.country, 'NULL') as country, count(*) as cnt
    FROM campaign_queue cq JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = $1 AND cq.status = 'queued'
    GROUP BY c.country ORDER BY cnt DESC LIMIT 5
  `, [CAMPAIGN_ID]);
  console.log('\n  Country distribution:');
  for (const r of countries.rows) console.log(`    ${r.country}: ${r.cnt}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  try {
    const camp = await pool.query(`SELECT id, name, status FROM campaigns WHERE id = $1`, [CAMPAIGN_ID]);
    if (camp.rows.length === 0) {
      console.log('  ⚠ Campaign UKEF_Q12026 not found in this database. Skipping.');
      return;
    }
    console.log(`Campaign: ${camp.rows[0].name} (${camp.rows[0].status})\n`);

    await fixCountryNames();
    await fixEmptyStrings();
    await normalizeAccountPhones();
    await fixBadContactE164();
    await renormalizeContactPhones();
    await backfillFromAccountPhone();
    await printFinalStats();

    console.log(`\n${'='.repeat(70)}`);
    console.log(`  UKEF Phone Fix Complete — ${dbEndpoint}`);
    console.log(`${'='.repeat(70)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});