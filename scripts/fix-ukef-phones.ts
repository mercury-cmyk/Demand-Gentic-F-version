#!/usr/bin/env tsx
/**
 * UKEF_Q12026 Phone Data Fix Script
 *
 * Fixes applied:
 * 1. Country name normalization ("United Kingdom Uk" → "United Kingdom")
 * 2. Empty string phone cleanup ('' → NULL)
 * 3. Account main_phone → main_phone_e164 normalization
 * 4. Contact phone re-normalization (scientific notation cleanup)
 * 5. Backfill dialing_phone_e164 from account HQ phone for contacts missing phone
 *
 * Usage:
 *   npx tsx scripts/fix-ukef-phones.ts                        # runs on DATABASE_URL
 *   DATABASE_URL="postgresql://..." npx tsx scripts/fix-ukef-phones.ts  # runs on specific DB
 *   npx tsx scripts/fix-ukef-phones.ts --dry-run              # preview only
 */

import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import { normalizePhoneE164 } from '../server/normalization';
import { getBestPhoneForContact, isValidE164 } from '../server/lib/phone-utils';

const DRY_RUN = process.argv.includes('--dry-run');
const CAMPAIGN_ID = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
const BATCH_SIZE = 500;

// Build connection URL from env
function getConnectionUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Fallback to PG* vars
  const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
  return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT || '5432'}/${PGDATABASE}?sslmode=require`;
}

const connUrl = getConnectionUrl();
const dbEndpoint = connUrl.match(/ep-[^.]+/)?.[0] || 'unknown';
console.log(`\n${'='.repeat(70)}`);
console.log(`  UKEF Phone Fix — targeting: ${dbEndpoint}`);
console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
console.log(`${'='.repeat(70)}\n`);

const pool = new Pool({ connectionString: connUrl, ssl: { rejectUnauthorized: false }, max: 5 });

async function query(sql: string, params?: any[]) {
  return pool.query(sql, params);
}

async function exec(sql: string, params?: any[]) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would execute: ${sql.slice(0, 120)}...`);
    return { rowCount: 0 };
  }
  return pool.query(sql, params);
}

// ─── Phase 1: Country Name Normalization ────────────────────────────────────

async function fixCountryNames() {
  console.log('\n── Phase 1: Country Name Normalization ──');

  // Check current state
  const check = await query(`
    SELECT country, count(*) as cnt
    FROM contacts
    WHERE country ILIKE '%united kingdom%'
    GROUP BY country ORDER BY cnt DESC
  `);
  console.log('  Current UK country variants:');
  for (const r of check.rows) {
    console.log(`    "${r.country}": ${r.cnt}`);
  }

  // Fix "United Kingdom Uk" → "United Kingdom"
  const res = await exec(`
    UPDATE contacts SET country = 'United Kingdom'
    WHERE country = 'United Kingdom Uk'
  `);
  console.log(`  ✓ Fixed ${res.rowCount} contacts: "United Kingdom Uk" → "United Kingdom"`);

  // Also fix accounts
  const accRes = await exec(`
    UPDATE accounts SET hq_country = 'United Kingdom'
    WHERE hq_country = 'United Kingdom Uk'
  `);
  console.log(`  ✓ Fixed ${accRes.rowCount} accounts: "United Kingdom Uk" → "United Kingdom"`);
}

// ─── Phase 2: Empty String → NULL Cleanup ───────────────────────────────────

async function fixEmptyStrings() {
  console.log('\n── Phase 2: Empty String Phone Cleanup ──');

  // Check current state
  const check = await query(`
    SELECT
      count(CASE WHEN direct_phone = '' THEN 1 END) as empty_direct,
      count(CASE WHEN mobile_phone = '' THEN 1 END) as empty_mobile,
      count(CASE WHEN direct_phone_e164 = '' THEN 1 END) as empty_direct_e164,
      count(CASE WHEN mobile_phone_e164 = '' THEN 1 END) as empty_mobile_e164
    FROM contacts
  `);
  const c = check.rows[0];
  console.log(`  Empty strings found:`);
  console.log(`    direct_phone='': ${c.empty_direct}`);
  console.log(`    mobile_phone='': ${c.empty_mobile}`);
  console.log(`    direct_phone_e164='': ${c.empty_direct_e164}`);
  console.log(`    mobile_phone_e164='': ${c.empty_mobile_e164}`);

  const r1 = await exec(`UPDATE contacts SET direct_phone = NULL WHERE direct_phone = ''`);
  const r2 = await exec(`UPDATE contacts SET mobile_phone = NULL WHERE mobile_phone = ''`);
  const r3 = await exec(`UPDATE contacts SET direct_phone_e164 = NULL WHERE direct_phone_e164 = ''`);
  const r4 = await exec(`UPDATE contacts SET mobile_phone_e164 = NULL WHERE mobile_phone_e164 = ''`);
  const r5 = await exec(`UPDATE contacts SET dialing_phone_e164 = NULL WHERE dialing_phone_e164 = ''`);

  console.log(`  ✓ Nullified: direct_phone=${r1.rowCount}, mobile=${r2.rowCount}, direct_e164=${r3.rowCount}, mobile_e164=${r4.rowCount}, dialing=${r5.rowCount}`);

  // Also clean account phones
  const r6 = await exec(`UPDATE accounts SET main_phone = NULL WHERE main_phone = ''`);
  console.log(`  ✓ Nullified account main_phone='': ${r6.rowCount}`);
}

// ─── Phase 3: Normalize Account main_phone → main_phone_e164 ───────────────

async function normalizeAccountPhones() {
  console.log('\n── Phase 3: Account Phone Normalization ──');

  // Count accounts needing normalization (in UKEF campaign)
  const countRes = await query(`
    SELECT count(DISTINCT a.id) as cnt
    FROM accounts a
    JOIN campaign_queue cq ON cq.account_id = a.id
    WHERE cq.campaign_id = $1
      AND a.main_phone IS NOT NULL
      AND a.main_phone != ''
      AND (a.main_phone_e164 IS NULL OR a.main_phone_e164 = '')
  `, [CAMPAIGN_ID]);
  console.log(`  Accounts needing normalization: ${countRes.rows[0].cnt}`);

  let totalNormalized = 0;
  let totalFailed = 0;
  let offset = 0;

  while (true) {
    const batch = await query(`
      SELECT DISTINCT a.id, a.main_phone, a.hq_country
      FROM accounts a
      JOIN campaign_queue cq ON cq.account_id = a.id
      WHERE cq.campaign_id = $1
        AND a.main_phone IS NOT NULL
        AND a.main_phone != ''
        AND (a.main_phone_e164 IS NULL OR a.main_phone_e164 = '')
      LIMIT $2 OFFSET $3
    `, [CAMPAIGN_ID, BATCH_SIZE, offset]);

    if (batch.rows.length === 0) break;

    for (const acc of batch.rows) {
      const normalized = normalizePhoneE164(acc.main_phone, acc.hq_country || 'United Kingdom');
      if (normalized && isValidE164(normalized)) {
        await exec(`UPDATE accounts SET main_phone_e164 = $1 WHERE id = $2`, [normalized, acc.id]);
        totalNormalized++;
      } else {
        totalFailed++;
      }
    }

    offset += BATCH_SIZE;
    if (offset % 2000 === 0) {
      console.log(`  ... processed ${offset} accounts (${totalNormalized} normalized, ${totalFailed} failed)`);
    }
  }

  console.log(`  ✓ Normalized: ${totalNormalized} accounts`);
  console.log(`  ✗ Failed normalization: ${totalFailed} accounts`);

  // Show sample results
  const samples = await query(`
    SELECT main_phone, main_phone_e164, hq_country
    FROM accounts a
    JOIN campaign_queue cq ON cq.account_id = a.id
    WHERE cq.campaign_id = $1
      AND a.main_phone_e164 IS NOT NULL
    LIMIT 5
  `, [CAMPAIGN_ID]);
  console.log('  Samples:');
  for (const s of samples.rows) {
    console.log(`    "${s.main_phone}" → ${s.main_phone_e164} (${s.hq_country})`);
  }
}

// ─── Phase 4: Fix Bad Contact E.164 (scientific notation artifacts) ─────────

async function fixBadContactE164() {
  console.log('\n── Phase 4: Scientific Notation E.164 Cleanup ──');

  // Detect obviously invalid E.164 numbers (too many zeros, wrong length)
  const badE164 = await query(`
    SELECT count(*) as cnt FROM contacts
    WHERE direct_phone_e164 IS NOT NULL
      AND (
        direct_phone_e164 ~ '0{5,}'
        OR length(direct_phone_e164) > 16
        OR direct_phone SIMILAR TO '%[eE][+]%'
      )
  `);
  console.log(`  Bad E.164 (from scientific notation): ${badE164.rows[0].cnt}`);

  const r1 = await exec(`
    UPDATE contacts
    SET direct_phone_e164 = NULL,
        dialing_phone_e164 = NULL
    WHERE direct_phone_e164 IS NOT NULL
      AND (
        direct_phone_e164 ~ '0{5,}'
        OR length(direct_phone_e164) > 16
        OR direct_phone SIMILAR TO '%[eE][+]%'
      )
  `);
  console.log(`  ✓ Cleared ${r1.rowCount} bad direct_phone_e164 values`);

  // Same for mobile
  const r2 = await exec(`
    UPDATE contacts
    SET mobile_phone_e164 = NULL
    WHERE mobile_phone_e164 IS NOT NULL
      AND (
        mobile_phone_e164 ~ '0{5,}'
        OR length(mobile_phone_e164) > 16
        OR mobile_phone SIMILAR TO '%[eE][+]%'
      )
  `);
  console.log(`  ✓ Cleared ${r2.rowCount} bad mobile_phone_e164 values`);

  // Clean text garbage from phone fields (e.g., "Research...")
  const r3 = await exec(`
    UPDATE contacts
    SET direct_phone = NULL, direct_phone_e164 = NULL
    WHERE direct_phone IS NOT NULL
      AND direct_phone !~ '^[0-9+() \\-\\.]+$'
      AND direct_phone != ''
  `);
  console.log(`  ✓ Cleared ${r3.rowCount} non-numeric direct_phone values`);
}

// ─── Phase 5: Re-normalize valid contact phones ────────────────────────────

async function renormalizeContactPhones() {
  console.log('\n── Phase 5: Re-normalize Contact Direct Phones ──');

  let totalFixed = 0;
  let offset = 0;

  while (true) {
    const batch = await query(`
      SELECT c.id, c.direct_phone, c.country
      FROM contacts c
      JOIN campaign_queue cq ON cq.contact_id = c.id
      WHERE cq.campaign_id = $1
        AND c.direct_phone IS NOT NULL
        AND c.direct_phone != ''
        AND c.direct_phone !~ '[eE][+]'
        AND (c.direct_phone_e164 IS NULL OR c.direct_phone_e164 = '')
      LIMIT $2 OFFSET $3
    `, [CAMPAIGN_ID, BATCH_SIZE, offset]);

    if (batch.rows.length === 0) break;

    for (const contact of batch.rows) {
      const e164 = normalizePhoneE164(contact.direct_phone, contact.country || 'United Kingdom');
      if (e164 && isValidE164(e164)) {
        await exec(`
          UPDATE contacts SET direct_phone_e164 = $1, dialing_phone_e164 = $1
          WHERE id = $2
        `, [e164, contact.id]);
        totalFixed++;
      }
    }

    offset += BATCH_SIZE;
  }

  console.log(`  ✓ Re-normalized ${totalFixed} contact direct phones`);
}

// ─── Phase 6: Backfill dialing_phone_e164 from Account HQ Phone ────────────

async function backfillFromAccountPhone() {
  console.log('\n── Phase 6: Backfill Contact Phones from Account HQ ──');

  // Count contacts still missing dialing phone
  const missing = await query(`
    SELECT count(*) as cnt
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = $1
      AND cq.status = 'queued'
      AND (c.dialing_phone_e164 IS NULL OR c.dialing_phone_e164 = '')
  `, [CAMPAIGN_ID]);
  console.log(`  Contacts still missing dialing phone: ${missing.rows[0].cnt}`);

  // Count accounts with normalized phone available
  const available = await query(`
    SELECT count(DISTINCT a.id) as cnt
    FROM accounts a
    JOIN campaign_queue cq ON cq.account_id = a.id
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = $1
      AND cq.status = 'queued'
      AND (c.dialing_phone_e164 IS NULL OR c.dialing_phone_e164 = '')
      AND a.main_phone_e164 IS NOT NULL
  `, [CAMPAIGN_ID]);
  console.log(`  Accounts with normalized phone available: ${available.rows[0].cnt}`);

  // Batch backfill using SQL JOIN UPDATE
  const res = await exec(`
    UPDATE contacts c
    SET dialing_phone_e164 = a.main_phone_e164
    FROM campaign_queue cq
    JOIN accounts a ON a.id = cq.account_id
    WHERE cq.contact_id = c.id
      AND cq.campaign_id = $1
      AND (c.dialing_phone_e164 IS NULL OR c.dialing_phone_e164 = '')
      AND a.main_phone_e164 IS NOT NULL
      AND a.main_phone_e164 ~ '^\\+[1-9]\\d{7,14}$'
  `, [CAMPAIGN_ID]);
  console.log(`  ✓ Backfilled ${res.rowCount} contacts from account HQ phone`);

  // For contacts STILL missing (account phone also unavailable), try raw account phone
  let stillMissing = await query(`
    SELECT count(*) as cnt
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = $1
      AND cq.status = 'queued'
      AND (c.dialing_phone_e164 IS NULL OR c.dialing_phone_e164 = '')
  `, [CAMPAIGN_ID]);
  console.log(`  Still missing after backfill: ${stillMissing.rows[0].cnt}`);

  // Try normalizing raw account phones that didn't make it through Phase 3
  if (parseInt(stillMissing.rows[0].cnt) > 0) {
    let rescued = 0;
    let offset = 0;

    while (true) {
      const batch = await query(`
        SELECT DISTINCT c.id as contact_id, a.main_phone, a.hq_country, c.country as contact_country
        FROM campaign_queue cq
        JOIN contacts c ON c.id = cq.contact_id
        JOIN accounts a ON a.id = cq.account_id
        WHERE cq.campaign_id = $1
          AND cq.status = 'queued'
          AND (c.dialing_phone_e164 IS NULL OR c.dialing_phone_e164 = '')
          AND a.main_phone IS NOT NULL
          AND a.main_phone != ''
        LIMIT $2 OFFSET $3
      `, [CAMPAIGN_ID, BATCH_SIZE, offset]);

      if (batch.rows.length === 0) break;

      for (const row of batch.rows) {
        // Try normalizing with contact country, then account country, then default UK
        const countries = [row.contact_country, row.hq_country, 'United Kingdom'].filter(Boolean);
        let e164: string | null = null;
        for (const country of countries) {
          e164 = normalizePhoneE164(row.main_phone, country);
          if (e164 && isValidE164(e164)) break;
          e164 = null;
        }
        if (e164) {
          await exec(`UPDATE contacts SET dialing_phone_e164 = $1 WHERE id = $2`, [e164, row.contact_id]);
          rescued++;
        }
      }

      offset += BATCH_SIZE;
    }
    console.log(`  ✓ Rescued ${rescued} more contacts via raw account phone normalization`);
  }
}

// ─── Phase 7: Final Stats ──────────────────────────────────────────────────

async function printFinalStats() {
  console.log('\n── Final Results ──');

  const stats = await query(`
    SELECT
      count(*) as total_queued,
      count(c.dialing_phone_e164) as has_dialing,
      count(c.direct_phone_e164) as has_direct_e164,
      count(c.direct_phone) as has_direct_raw,
      count(CASE WHEN c.dialing_phone_e164 IS NULL THEN 1 END) as still_missing,
      ROUND(count(c.dialing_phone_e164)::numeric / count(*) * 100, 1) as pct_coverage
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = $1
      AND cq.status = 'queued'
  `, [CAMPAIGN_ID]);

  const s = stats.rows[0];
  console.log(`  Total queued:        ${s.total_queued}`);
  console.log(`  Has dialing phone:   ${s.has_dialing} (${s.pct_coverage}%)`);
  console.log(`  Has direct E.164:    ${s.has_direct_e164}`);
  console.log(`  Has direct raw:      ${s.has_direct_raw}`);
  console.log(`  Still missing phone: ${s.still_missing}`);

  // Country distribution
  const countries = await query(`
    SELECT COALESCE(c.country, 'NULL') as country, count(*) as cnt
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = $1 AND cq.status = 'queued'
    GROUP BY c.country ORDER BY cnt DESC LIMIT 5
  `, [CAMPAIGN_ID]);
  console.log('\n  Country distribution:');
  for (const r of countries.rows) {
    console.log(`    ${r.country}: ${r.cnt}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  try {
    // Verify campaign exists
    const camp = await query(`SELECT id, name, status FROM campaigns WHERE id = $1`, [CAMPAIGN_ID]);
    if (camp.rows.length === 0) {
      console.log('  ⚠ Campaign UKEF_Q12026 not found in this database. Skipping.');
      return;
    }
    console.log(`Campaign: ${camp.rows[0].name} (${camp.rows[0].status})`);

    await fixCountryNames();
    await fixEmptyStrings();
    await normalizeAccountPhones();
    await fixBadContactE164();
    await renormalizeContactPhones();
    await backfillFromAccountPhone();
    await printFinalStats();

    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ✅ UKEF Phone Fix Complete — ${dbEndpoint}`);
    console.log(`${'='.repeat(70)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
