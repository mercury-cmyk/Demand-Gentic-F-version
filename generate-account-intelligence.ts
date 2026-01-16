import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { getOrBuildAccountIntelligence, getOrBuildAccountMessagingBrief } from "./server/services/account-messaging-service";

async function generateAccountIntelligence() {
  console.log("=".repeat(80));
  console.log("BATCH GENERATION: Account Intelligence & Messaging Briefs");
  console.log("=".repeat(80));

  // Get all accounts in AI campaign queues that lack intelligence
  const accountsQuery = await db.execute(sql`
    WITH campaign_accounts AS (
      SELECT DISTINCT c.account_id, a.name
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      JOIN campaigns cam ON cam.id = cq.campaign_id
      JOIN accounts a ON a.id = c.account_id
      WHERE cam.dial_mode = 'ai_agent'
        AND cq.status IN ('queued', 'in_progress')
        AND c.account_id IS NOT NULL
    )
    SELECT ca.account_id, ca.name
    FROM campaign_accounts ca
    LEFT JOIN account_intelligence air ON air.account_id = ca.account_id
    WHERE air.account_id IS NULL
    ORDER BY ca.name
  `);

  const accountsToProcess = accountsQuery.rows as any[];
  const totalCount = accountsToProcess.length;

  console.log(`\n📊 Found ${totalCount} accounts needing intelligence generation`);

  if (totalCount === 0) {
    console.log("\n✅ All accounts already have intelligence generated!");
    return;
  }

  console.log(`\n⏱️  Estimated time: ${Math.round(totalCount * 15 / 60)} - ${Math.round(totalCount * 30 / 60)} minutes`);
  console.log(`   (Assuming 15-30 seconds per account)\n`);

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  const errors: Array<{ account: string; error: string }> = [];

  const startTime = Date.now();

  // Process accounts in batches to avoid overwhelming the system
  const BATCH_SIZE = 5; // Process 5 accounts in parallel
  const DELAY_BETWEEN_BATCHES = 2000; // 2 second delay between batches

  console.log(`🚀 Starting generation (batch size: ${BATCH_SIZE})...\n`);

  for (let i = 0; i < accountsToProcess.length; i += BATCH_SIZE) {
    const batch = accountsToProcess.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(accountsToProcess.length / BATCH_SIZE);

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (Accounts ${i + 1}-${Math.min(i + BATCH_SIZE, accountsToProcess.length)} of ${totalCount})`);

    const batchPromises = batch.map(async (account) => {
      const accountName = account.name.substring(0, 50);
      try {
        console.log(`   ⏳ Processing: ${accountName}...`);

        // Generate intelligence
        const intelligenceRecord = await getOrBuildAccountIntelligence(account.account_id);

        if (!intelligenceRecord) {
          console.log(`   ⚠️  Skipped (no data): ${accountName}`);
          return { status: 'skipped', account: accountName };
        }

        // Generate messaging brief
        await getOrBuildAccountMessagingBrief({
          accountId: account.account_id,
          campaignId: null, // Generic, not campaign-specific
          intelligenceRecord,
        });

        console.log(`   ✅ Success: ${accountName}`);
        return { status: 'success', account: accountName };
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        console.log(`   ❌ Failed: ${accountName} - ${errorMsg.substring(0, 100)}`);
        return { status: 'error', account: accountName, error: errorMsg };
      }
    });

    // Wait for batch to complete
    const results = await Promise.allSettled(batchPromises);

    // Count results
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        if (result.value.status === 'success') {
          successCount++;
        } else if (result.value.status === 'skipped') {
          skippedCount++;
        } else if (result.value.status === 'error') {
          failureCount++;
          errors.push({ account: result.value.account, error: result.value.error });
        }
      } else {
        failureCount++;
        errors.push({ account: 'Unknown', error: result.reason });
      }
    });

    // Progress update
    const processed = i + batch.length;
    const percentComplete = Math.round((processed / totalCount) * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const avgTimePerAccount = elapsed / processed;
    const remaining = totalCount - processed;
    const estimatedTimeRemaining = Math.round((remaining * avgTimePerAccount) / 60);

    console.log(`\n   📊 Progress: ${processed}/${totalCount} (${percentComplete}%)`);
    console.log(`   ✅ Success: ${successCount} | ⚠️  Skipped: ${skippedCount} | ❌ Failed: ${failureCount}`);
    console.log(`   ⏱️  Elapsed: ${Math.round(elapsed / 60)}m ${elapsed % 60}s | Remaining: ~${estimatedTimeRemaining}m`);

    // Delay between batches to avoid rate limits
    if (i + BATCH_SIZE < accountsToProcess.length) {
      console.log(`   ⏸️  Cooling down for ${DELAY_BETWEEN_BATCHES / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  // Final Summary
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 GENERATION COMPLETE`);
  console.log(`${"=".repeat(80)}`);
  console.log(`\n✅ Successfully generated: ${successCount}`);
  console.log(`⚠️  Skipped (no data): ${skippedCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`⏱️  Total time: ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
  console.log(`📈 Average time per account: ${Math.round(totalTime / totalCount)}s`);

  if (errors.length > 0) {
    console.log(`\n❌ ERRORS (first 20):`);
    errors.slice(0, 20).forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.account}: ${err.error.substring(0, 100)}`);
    });
    if (errors.length > 20) {
      console.log(`   ... and ${errors.length - 20} more errors`);
    }
  }

  // Verification
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔍 VERIFICATION`);
  console.log(`${"=".repeat(80)}`);

  const verificationQuery = await db.execute(sql`
    WITH campaign_accounts AS (
      SELECT DISTINCT c.account_id
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      JOIN campaigns cam ON cam.id = cq.campaign_id
      WHERE cam.dial_mode = 'ai_agent'
        AND cq.status IN ('queued', 'in_progress')
        AND c.account_id IS NOT NULL
    )
    SELECT
      COUNT(DISTINCT ca.account_id) as total_accounts,
      COUNT(DISTINCT air.account_id) as accounts_with_intelligence,
      COUNT(DISTINCT amb.account_id) as accounts_with_brief
    FROM campaign_accounts ca
    LEFT JOIN account_intelligence air ON air.account_id = ca.account_id
    LEFT JOIN account_messaging_briefs amb ON amb.account_id = ca.account_id
  `);

  const stats = verificationQuery.rows[0] as any;
  const coveragePercent = Math.round((stats.accounts_with_intelligence / stats.total_accounts) * 100);

  console.log(`\n📈 Intelligence Coverage:`);
  console.log(`   Total Accounts: ${stats.total_accounts}`);
  console.log(`   With Intelligence: ${stats.accounts_with_intelligence} (${coveragePercent}%)`);
  console.log(`   With Messaging Brief: ${stats.accounts_with_brief}`);

  if (coveragePercent >= 95) {
    console.log(`\n🎉 SUCCESS! ${coveragePercent}% coverage achieved.`);
    console.log(`   Your AI campaigns should now work properly!`);
    console.log(`   Campaign calls will have fully personalized system prompts.`);
  } else {
    console.log(`\n⚠️  Coverage is ${coveragePercent}% - some accounts still missing intelligence.`);
    console.log(`   You may want to re-run this script to process failed accounts.`);
  }

  console.log(`\n${"=".repeat(80)}`);
}

generateAccountIntelligence()
  .then(() => {
    console.log("\n✅ Script complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
