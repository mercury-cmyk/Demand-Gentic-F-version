/**
 * Script to generate problem intelligence for missing accounts
 * in the Pivotal B2B Demand list
 */

import { neon } from '@neondatabase/serverless';
import { batchGenerateCampaignProblems } from '../server/services/problem-intelligence/problem-generation-engine';

const sql = neon(process.env.DATABASE_URL!);

async function getMissingAccountIds(): Promise {
  const result = await sql`
    WITH list_contact_ids AS (
      SELECT unnest(record_ids::text[]) as contact_id
      FROM lists
      WHERE id = '65ef1c92-2b65-44df-ae96-9297bb525577'
    ),
    list_accounts AS (
      SELECT DISTINCT c.account_id
      FROM contacts c
      INNER JOIN list_contact_ids lci ON c.id = lci.contact_id
      WHERE c.account_id IS NOT NULL
    )
    SELECT la.account_id
    FROM list_accounts la
    LEFT JOIN account_intelligence ai ON la.account_id = ai.account_id
    WHERE ai.account_id IS NULL
  `;

  return result.map((r: any) => r.account_id);
}

async function main() {
  console.log('🚀 Starting Problem Intelligence Generation for Pivotal B2B Demand List');
  console.log('━'.repeat(60));

  // Get missing account IDs
  const accountIds = await getMissingAccountIds();
  console.log(`📊 Found ${accountIds.length} accounts without intelligence`);

  if (accountIds.length === 0) {
    console.log('✅ All accounts have intelligence. Nothing to generate.');
    return;
  }

  const campaignId = '2df6b4f5-c1ff-4324-87f0-94053d4c5cbf';
  console.log(`🎯 Campaign ID: ${campaignId}`);
  console.log(`⚙️  Concurrency: 5`);
  console.log('━'.repeat(60));

  const startTime = Date.now();
  let lastProgressUpdate = Date.now();

  const result = await batchGenerateCampaignProblems({
    campaignId,
    accountIds,
    concurrency: 5,
    onProgress: (completed, total) => {
      const now = Date.now();
      // Update progress every 5 seconds or at completion
      if (now - lastProgressUpdate > 5000 || completed === total) {
        const elapsed = (now - startTime) / 1000;
        const rate = completed / elapsed;
        const eta = rate > 0 ? Math.round((total - completed) / rate) : 0;
        console.log(`📈 Progress: ${completed}/${total} (${Math.round(completed/total*100)}%) - ETA: ${eta}s`);
        lastProgressUpdate = now;
      }
    }
  });

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log('━'.repeat(60));
  console.log('📊 Generation Complete!');
  console.log(`   ✅ Success: ${result.successCount}`);
  console.log(`   ❌ Failed: ${result.failedCount}`);
  console.log(`   ⏱️  Duration: ${duration}s`);

  if (result.errors && result.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    result.errors.slice(0, 10).forEach(err => {
      console.log(`   - ${err.accountId}: ${err.error}`);
    });
    if (result.errors.length > 10) {
      console.log(`   ... and ${result.errors.length - 10} more errors`);
    }
  }
}

main().catch(console.error);