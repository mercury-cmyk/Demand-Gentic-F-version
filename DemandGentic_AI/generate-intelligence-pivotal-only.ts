import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { getOrBuildAccountIntelligence, getOrBuildAccountMessagingBrief } from "./server/services/account-messaging-service";

const BATCH_SIZE = 5; // Process 5 accounts in parallel
const DELAY_BETWEEN_BATCHES = 2000; // 2 second delay between batches
const RETRY_LIMIT = 2; // Retry failed accounts up to 2 times

async function generateIntelligenceForPivotalOnly() {
  console.log("=".repeat(80));
  console.log("INTELLIGENCE GENERATION: Pivotal B2B Demand Campaign Only");
  console.log("=".repeat(80));

  // Find the Pivotal B2B campaigns (Agentic DemandGen and Survey)
  const pivotalCampaignQuery = await db.execute(sql`
    SELECT id, name, status
    FROM campaigns
    WHERE (name LIKE '%Pivotal B2B%' OR name LIKE '%Agentic DemandGen%')
      AND dial_mode = 'ai_agent'
    ORDER BY name
  `);

  if (pivotalCampaignQuery.rows.length === 0) {
    console.log("\n❌ No 'Pivotal B2B Demand' campaign found");
    console.log("\nSearching for similar campaigns...");

    const similarQuery = await db.execute(sql`
      SELECT id, name, status, dial_mode
      FROM campaigns
      WHERE (name ILIKE '%pivotal%' OR name ILIKE '%demand%')
        AND dial_mode = 'ai_agent'
      ORDER BY name
      LIMIT 10
    `);

    console.log("\nFound similar campaigns:");
    (similarQuery.rows as any[]).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.name} (${c.id}) - ${c.status}`);
    });

    return;
  }

  console.log("\n📋 Found Pivotal campaigns:");
  (pivotalCampaignQuery.rows as any[]).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} (${c.id})`);
  });

  const campaignIds = (pivotalCampaignQuery.rows as any[]).map(c => c.id);

  // Get accounts that need intelligence for this specific campaign
  const accountsQuery = await db.execute(sql`
    WITH pivotal_accounts AS (
      SELECT DISTINCT c.account_id, a.name, COUNT(*) as contact_count
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      JOIN accounts a ON a.id = c.account_id
      WHERE cq.campaign_id IN (${sql.raw(campaignIds.map(id => `'${id}'`).join(", "))})
        AND cq.status IN ('queued', 'in_progress')
        AND c.account_id IS NOT NULL
      GROUP BY c.account_id, a.name
    )
    SELECT pa.account_id, pa.name, pa.contact_count
    FROM pivotal_accounts pa
    LEFT JOIN account_intelligence air ON air.account_id = pa.account_id
    WHERE air.account_id IS NULL
    ORDER BY pa.contact_count DESC, pa.name
  `);

  const accountsToProcess = accountsQuery.rows as any[];
  const totalCount = accountsToProcess.length;

  console.log(`\n📊 Accounts in Pivotal campaign needing intelligence: ${totalCount}`);

  if (totalCount === 0) {
    console.log("\n✅ All accounts in Pivotal campaign already have intelligence!");

    // Show coverage stats
    const statsQuery = await db.execute(sql`
      WITH pivotal_accounts AS (
        SELECT DISTINCT c.account_id
        FROM campaign_queue cq
        JOIN contacts c ON c.id = cq.contact_id
        WHERE cq.campaign_id IN (${sql.raw(campaignIds.map(id => `'${id}'`).join(", "))})
          AND cq.status IN ('queued', 'in_progress')
          AND c.account_id IS NOT NULL
      )
      SELECT
        COUNT(DISTINCT pa.account_id) as total_accounts,
        COUNT(DISTINCT air.account_id) as accounts_with_intelligence
      FROM pivotal_accounts pa
      LEFT JOIN account_intelligence air ON air.account_id = pa.account_id
    `);

    const stats = statsQuery.rows[0] as any;
    console.log(`\n📈 Pivotal Campaign Intelligence Coverage:`);
    console.log(`   Total: ${stats.total_accounts}`);
    console.log(`   With Intelligence: ${stats.accounts_with_intelligence} (${Math.round(stats.accounts_with_intelligence / stats.total_accounts * 100)}%)`);

    return;
  }

  console.log(`\n⏱️  Estimated time: ${Math.round(totalCount * 15 / 60)} - ${Math.round(totalCount * 30 / 60)} minutes`);
  console.log(`   (Assuming 15-30 seconds per account)\n`);

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  const errors: Array = [];

  const startTime = Date.now();

  console.log(`🚀 Starting generation for Pivotal campaign (batch size: ${BATCH_SIZE})...\n`);

  for (let i = 0; i  {
      const accountName = account.name.substring(0, 40);
      let retries = 0;

      while (retries  0) {
            console.log(`   🔄 Retry ${retries}/${RETRY_LIMIT}: ${accountName}...`);
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
            campaignId: campaignIds[0], // Use first Pivotal campaign ID
            intelligenceRecord,
          });

          console.log(`   ✅ Success: ${accountName}`);
          return { status: 'success', account: accountName };
        } catch (error: any) {
          const errorMsg = error?.message || String(error);

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
        }
      } else {
        failureCount++;
        errors.push({ account: 'Unknown', error: String(result.reason) });
      }
    });

    const processed = i + batch.length;
    const percentComplete = Math.round((processed / totalCount) * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const avgTimePerAccount = elapsed / processed;
    const remaining = totalCount - processed;
    const estimatedTimeRemaining = Math.round((remaining * avgTimePerAccount) / 60);

    console.log(`\n   📊 Progress: ${processed}/${totalCount} (${percentComplete}%)`);
    console.log(`   ✅ Success: ${successCount} | ⚠️  Skipped: ${skippedCount} | ❌ Failed: ${failureCount}`);
    console.log(`   ⏱️  Elapsed: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s | Remaining: ~${estimatedTimeRemaining}m`);

    if (i + BATCH_SIZE  setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  // Final Summary
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 GENERATION COMPLETE - Pivotal Campaign Only`);
  console.log(`${"=".repeat(80)}`);
  console.log(`\n✅ Successfully generated: ${successCount}`);
  console.log(`⚠️  Skipped (no data): ${skippedCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`⏱️  Total time: ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`);
  console.log(`📈 Success rate: ${Math.round((successCount / (successCount + failureCount + skippedCount)) * 100)}%`);

  if (errors.length > 0) {
    console.log(`\n❌ ERRORS (first 10):`);
    errors.slice(0, 10).forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.account}: ${err.error.substring(0, 80)}`);
    });
  }

  // Verification
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔍 VERIFICATION - Pivotal Campaign`);
  console.log(`${"=".repeat(80)}`);

  const verificationQuery = await db.execute(sql`
    WITH pivotal_accounts AS (
      SELECT DISTINCT c.account_id
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id IN (${sql.raw(campaignIds.map(id => `'${id}'`).join(", "))})
        AND cq.status IN ('queued', 'in_progress')
        AND c.account_id IS NOT NULL
    )
    SELECT
      COUNT(DISTINCT pa.account_id) as total_accounts,
      COUNT(DISTINCT air.account_id) as accounts_with_intelligence,
      COUNT(DISTINCT amb.account_id) as accounts_with_brief
    FROM pivotal_accounts pa
    LEFT JOIN account_intelligence air ON air.account_id = pa.account_id
    LEFT JOIN account_messaging_briefs amb ON amb.account_id = pa.account_id
  `);

  const stats = verificationQuery.rows[0] as any;
  const coveragePercent = Math.round((stats.accounts_with_intelligence / stats.total_accounts) * 100);

  console.log(`\n📈 Pivotal Campaign Intelligence Coverage:`);
  console.log(`   Total Accounts: ${stats.total_accounts}`);
  console.log(`   With Intelligence: ${stats.accounts_with_intelligence} (${coveragePercent}%)`);
  console.log(`   With Messaging Brief: ${stats.accounts_with_brief}`);
  console.log(`   Remaining: ${stats.total_accounts - stats.accounts_with_intelligence}`);

  if (coveragePercent >= 95) {
    console.log(`\n🎉 SUCCESS! ${coveragePercent}% coverage achieved for Pivotal campaign.`);
    console.log(`   Your Pivotal AI campaign calls should now work properly!`);
  } else {
    console.log(`\n⏳ IN PROGRESS: ${coveragePercent}% coverage for Pivotal campaign.`);
    console.log(`   Run this script again to process remaining accounts.`);
  }

  console.log(`\n${"=".repeat(80)}`);
}

generateIntelligenceForPivotalOnly()
  .then(() => {
    console.log("\n✅ Script complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });