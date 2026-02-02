/**
 * Backfill script to normalize all existing ai_disposition values in call_sessions
 * 
 * This script:
 * 1. Reads all distinct non-canonical dispositions from call_sessions
 * 2. Maps each to its canonical equivalent
 * 3. Updates the records in batches
 * 
 * Run with: npx tsx normalize-dispositions.ts
 */

import { db } from "./server/db";
import { callSessions } from "./shared/schema";
import { sql, eq, inArray } from "drizzle-orm";
import { normalizeDisposition, type CanonicalDisposition, getCanonicalDispositions } from "./server/services/disposition-normalizer";

const BATCH_SIZE = 500;

// Mapping of raw disposition -> canonical disposition
const dispositionMapping: Record<string, CanonicalDisposition> = {
  // Capitalized versions
  'Completed': 'no_answer',
  'Voicemail': 'voicemail',
  'No Answer': 'no_answer',
  'Not Interested': 'not_interested',
  'Gatekeeper Block': 'not_interested',
  'Callback Requested': 'qualified_lead',
  
  // SIP failures - all map to no_answer for retry
  'Failed - SIP 403': 'no_answer',
  'Failed - SIP 404': 'no_answer',
  'Failed - SIP 480': 'no_answer',
  'Failed - SIP 486': 'no_answer',
  'Failed - SIP 503': 'no_answer',
  'Failed - SIP 603': 'no_answer',
  'Failed - SIP 1011': 'no_answer',
  
  // Other non-canonical
  'Cleaned up - stuck connecting': 'no_answer',
  'needs_review': 'no_answer',
  'connected': 'no_answer',
  'hung_up': 'no_answer',
  'pitch': 'no_answer',
};

async function main() {
  console.log('=== Disposition Normalization Script ===\n');
  
  // Step 1: Get all distinct dispositions
  console.log('Step 1: Fetching all distinct dispositions...');
  const distinctDispositions = await db.execute<{ ai_disposition: string; count: number }>(sql`
    SELECT ai_disposition, COUNT(*) as count
    FROM call_sessions
    WHERE ai_disposition IS NOT NULL
    GROUP BY ai_disposition
    ORDER BY count DESC
  `);
  
  console.log('\nCurrent disposition distribution:');
  const canonicals = new Set(getCanonicalDispositions());
  let totalNonCanonical = 0;
  
  for (const row of distinctDispositions.rows) {
    const isCanonical = canonicals.has(row.ai_disposition as CanonicalDisposition);
    const marker = isCanonical ? '✅' : '⚠️ ';
    console.log(`  ${marker} ${row.ai_disposition}: ${row.count}`);
    if (!isCanonical) {
      totalNonCanonical += Number(row.count);
    }
  }
  
  console.log(`\nTotal non-canonical records to update: ${totalNonCanonical}`);
  
  if (totalNonCanonical === 0) {
    console.log('✅ All dispositions are already canonical. Nothing to do!');
    process.exit(0);
  }
  
  // Step 2: Build update plan
  console.log('\nStep 2: Building update plan...');
  const updatePlan: { from: string; to: CanonicalDisposition; count: number }[] = [];
  
  for (const row of distinctDispositions.rows) {
    if (!canonicals.has(row.ai_disposition as CanonicalDisposition)) {
      const canonicalValue = dispositionMapping[row.ai_disposition] || normalizeDisposition(row.ai_disposition);
      updatePlan.push({
        from: row.ai_disposition,
        to: canonicalValue,
        count: Number(row.count),
      });
    }
  }
  
  console.log('\nUpdate plan:');
  for (const plan of updatePlan) {
    console.log(`  "${plan.from}" → "${plan.to}" (${plan.count} records)`);
  }
  
  // Step 3: Execute updates
  console.log('\nStep 3: Executing updates...');
  
  let totalUpdated = 0;
  for (const plan of updatePlan) {
    console.log(`  Updating "${plan.from}" → "${plan.to}"...`);
    
    const result = await db.execute(sql`
      UPDATE call_sessions
      SET ai_disposition = ${plan.to}
      WHERE ai_disposition = ${plan.from}
    `);
    
    totalUpdated += plan.count;
    console.log(`    ✅ Updated ${plan.count} records`);
  }
  
  console.log(`\n✅ Normalization complete! Total records updated: ${totalUpdated}`);
  
  // Step 4: Verify
  console.log('\nStep 4: Verifying results...');
  const postUpdateDistribution = await db.execute<{ ai_disposition: string; count: number }>(sql`
    SELECT ai_disposition, COUNT(*) as count
    FROM call_sessions
    WHERE ai_disposition IS NOT NULL
    GROUP BY ai_disposition
    ORDER BY count DESC
  `);
  
  console.log('\nPost-update disposition distribution:');
  let hasNonCanonical = false;
  for (const row of postUpdateDistribution.rows) {
    const isCanonical = canonicals.has(row.ai_disposition as CanonicalDisposition);
    const marker = isCanonical ? '✅' : '⚠️ ';
    console.log(`  ${marker} ${row.ai_disposition}: ${row.count}`);
    if (!isCanonical) hasNonCanonical = true;
  }
  
  if (hasNonCanonical) {
    console.log('\n⚠️  Some non-canonical dispositions remain. Please review.');
  } else {
    console.log('\n✅ All dispositions are now canonical!');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error during normalization:', err);
    process.exit(1);
  });
