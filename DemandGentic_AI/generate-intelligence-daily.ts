import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { getOrBuildAccountIntelligence, getOrBuildAccountMessagingBrief } from "./server/services/account-messaging-service";

const DAILY_LIMIT = 1000; // Process 1000 accounts per day
const BATCH_SIZE = 3; // Process 3 accounts in parallel (reduced for stability)
const DELAY_BETWEEN_BATCHES = 3000; // 3 second delay between batches
const RETRY_LIMIT = 2; // Retry failed accounts up to 2 times

async function generateIntelligenceDaily() {
  console.log("=".repeat(80));
  console.log("DAILY BATCH: Account Intelligence Generation (Limit: 1000/day)");
  console.log("=".repeat(80));

  // Get accounts that need intelligence, prioritized by campaign queue presence
  const accountsQuery = await db.execute(sql`
    WITH campaign_accounts AS (
      SELECT DISTINCT c.account_id, a.name, COUNT(*) as contact_count
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      JOIN campaigns cam ON cam.id = cq.campaign_id
      JOIN accounts a ON a.id = c.account_id
      WHERE cam.dial_mode = 'ai_agent'
        AND cq.status IN ('queued', 'in_progress')
        AND c.account_id IS NOT NULL
      GROUP BY c.account_id, a.name
    )
    SELECT ca.account_id, ca.name, ca.contact_count
    FROM campaign_accounts ca
    LEFT JOIN account_intelligence air ON air.account_id = ca.account_id
    WHERE air.account_id IS NULL
    ORDER BY ca.contact_count DESC, ca.name
    LIMIT ${DAILY_LIMIT}
  `);

  const accountsToProcess = accountsQuery.rows as any[];
  const totalCount = accountsToProcess.length;

  console.log(`\n📊 Found ${totalCount} accounts needing intelligence (limited to ${DAILY_LIMIT})`);

  if (totalCount === 0) {
    console.log("\n✅ All accounts in today's batch already have intelligence!");
    return;
  }

  console.log(`\n⏱️  Estimated time: ${Math.round(totalCount * 20 / 60)} minutes`);
  console.log(`   (Assuming ~20 seconds per account with retries)\n`);

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  const errors: Array = [];
  const failedAccounts: Array = [];

  const startTime = Date.now();

  console.log(`🚀 Starting generation (batch size: ${BATCH_SIZE}, daily limit: ${DAILY_LIMIT})...\n`);

  for (let i = 0; i  {
      const accountName = account.name.substring(0, 40);
      let retries = 0;

      while (retries  0) {
            console.log(`   🔄 Retry ${retries}/${RETRY_LIMIT}: ${accountName}...`);
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, retries * 2000));
          } else {
            console.log(`   ⏳ Processing: ${accountName}... (${account.contact_count} contacts)`);
          }

          // Generate intelligence
          const intelligenceRecord = await getOrBuildAccountIntelligence(account.account_id);

          if (!intelligenceRecord) {
            console.log(`   ⚠️  Skipped (no data): ${accountName}`);
            return { status: 'skipped', account: accountName };
          }

          // Generate messaging brief
          await getOrBuildAccountMessagingBrief({
            accountId: account.account_id,
            campaignId: null,
            intelligenceRecord,
          });

          console.log(`   ✅ Success: ${accountName}`);
          return { status: 'success', account: accountName };
        } catch (error: any) {
          const errorMsg = error?.message || String(error);

          // Check if it's a network/fetch error that's retryable
          const isRetryable = errorMsg.includes('fetch failed') ||
                             errorMsg.includes('ECONNRESET') ||
                             errorMsg.includes('ETIMEDOUT') ||
                             errorMsg.includes('EAI_AGAIN');

          if (isRetryable && retries  {
      if (result.status === 'fulfilled') {
        if (result.value.status === 'success') {
          successCount++;
        } else if (result.value.status === 'skipped') {
          skippedCount++;
        } else if (result.value.status === 'error') {
          failureCount++;
          errors.push({ account: result.value.account, error: result.value.error });
          if (result.value.account_id) {
            failedAccounts.push({
              account_id: result.value.account_id,
              name: result.value.account,
              retries: 0
            });
          }
        }
      } else {
        failureCount++;
        errors.push({ account: 'Unknown', error: String(result.reason) });
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
    console.log(`   ⏱️  Elapsed: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s | Remaining: ~${estimatedTimeRemaining}m`);

    // Delay between batches
    if (i + BATCH_SIZE  setTimeout(resolve, DELAY_BETWEEN_BATCHES));
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
  console.log(`📊 Success rate: ${Math.round((successCount / (successCount + failureCount + skippedCount)) * 100)}%`);

  if (errors.length > 0) {
    console.log(`\n❌ ERRORS (first 10):`);
    errors.slice(0, 10).forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.account}: ${err.error.substring(0, 80)}`);
    });
    if (errors.length > 10) {
      console.log(`   ... and ${errors.length - 10} more errors`);
    }
  }

  // Save failed accounts to retry file
  if (failedAccounts.length > 0) {
    const fs = await import('fs/promises');
    const failedFile = 'failed-accounts.json';
    await fs.writeFile(failedFile, JSON.stringify(failedAccounts, null, 2));
    console.log(`\n💾 Saved ${failedAccounts.length} failed accounts to ${failedFile}`);
    console.log(`   Run this script again to retry these accounts`);
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
  const remaining = stats.total_accounts - stats.accounts_with_intelligence;

  console.log(`\n📈 Overall Intelligence Coverage:`);
  console.log(`   Total Accounts: ${stats.total_accounts}`);
  console.log(`   With Intelligence: ${stats.accounts_with_intelligence} (${coveragePercent}%)`);
  console.log(`   Remaining: ${remaining}`);
  console.log(`   Days to complete: ~${Math.ceil(remaining / DAILY_LIMIT)} days (at ${DAILY_LIMIT}/day)`);

  if (coveragePercent >= 95) {
    console.log(`\n🎉 EXCELLENT! ${coveragePercent}% coverage achieved.`);
    console.log(`   Your AI campaigns should work properly now!`);
  } else if (coveragePercent >= 70) {
    console.log(`\n📈 GOOD PROGRESS! ${coveragePercent}% coverage achieved.`);
    console.log(`   Run this script daily to complete remaining accounts.`);
  } else {
    console.log(`\n⏳ IN PROGRESS: ${coveragePercent}% coverage so far.`);
    console.log(`   Continue running this script daily to reach full coverage.`);
  }

  console.log(`\n💡 Next Steps:`);
  console.log(`   1. Review any errors above`);
  console.log(`   2. Run this script again tomorrow to process next ${DAILY_LIMIT} accounts`);
  console.log(`   3. For immediate testing, use accounts that already have intelligence`);

  console.log(`\n${"=".repeat(80)}`);
}

generateIntelligenceDaily()
  .then(() => {
    console.log("\n✅ Script complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });