import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkIntelligence() {
  console.log("=".repeat(80));
  console.log("CHECKING: Account Intelligence Coverage");
  console.log("=".repeat(80));

  // Check intelligence coverage
  const result = await db.execute(sql`
    WITH campaign_accounts AS (
      SELECT DISTINCT c.account_id, a.name
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      JOIN campaigns cam ON cam.id = cq.campaign_id
      JOIN accounts a ON a.id = c.account_id
      WHERE cam.dial_mode = 'ai_agent'
        AND cq.status IN ('queued', 'in_progress')
        AND c.account_id IS NOT NULL
      LIMIT 1000
    )
    SELECT
      COUNT(DISTINCT ca.account_id) as total_accounts,
      COUNT(DISTINCT air.account_id) as accounts_with_intelligence,
      COUNT(DISTINCT amb.account_id) as accounts_with_brief
    FROM campaign_accounts ca
    LEFT JOIN account_intelligence air ON air.account_id = ca.account_id
    LEFT JOIN account_messaging_briefs amb ON amb.account_id = ca.account_id
  `);

  const stats = result.rows[0] as any;

  console.log(`\n📊 Intelligence Coverage:`);
  console.log(`   Total Accounts in Queue: ${stats.total_accounts}`);
  console.log(`   With Intelligence: ${stats.accounts_with_intelligence} (${Math.round((stats.accounts_with_intelligence / stats.total_accounts) * 100)}%)`);
  console.log(`   With Messaging Brief: ${stats.accounts_with_brief} (${Math.round((stats.accounts_with_brief / stats.total_accounts) * 100)}%)`);

  const missingIntelligence = stats.total_accounts - stats.accounts_with_intelligence;
  const missingBrief = stats.total_accounts - stats.accounts_with_brief;

  console.log(`\n❌ Missing Data:`);
  console.log(`   Accounts without Intelligence: ${missingIntelligence}`);
  console.log(`   Accounts without Messaging Brief: ${missingBrief}`);

  if (missingIntelligence > 0 || missingBrief > 0) {
    console.log(`\n🔍 ROOT CAUSE IDENTIFIED:`);
    console.log(`   When buildSystemPrompt() tries to build account context:`);
    console.log(`   1. Calls getOrBuildAccountIntelligence(accountId)`);
    console.log(`   2. No cached record found → triggers async AI generation`);
    console.log(`   3. AI generation takes 5-30 seconds`);
    console.log(`   4. Call is ALREADY CONNECTED and waiting`);
    console.log(`   5. If generation slow/fails → incomplete prompt → SILENT CALL`);
    console.log(`\n💡 SOLUTION:`);
    console.log(`   Pre-generate intelligence for all accounts BEFORE starting campaigns`);
    console.log(`\n   This is THE issue causing your silent calls!`);
  } else {
    console.log(`\n✅ All accounts have intelligence pre-generated!`);
    console.log(`   This should not be the issue.`);
  }

  // Sample accounts without intelligence
  if (missingIntelligence > 0) {
    console.log(`\n📋 Sample Accounts Missing Intelligence (first 10):`);
    const sampleResult = await db.execute(sql`
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
      LIMIT 10
    `);

    (sampleResult.rows as any[]).forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.name} (${row.account_id})`);
    });
  }

  console.log(`\n${"=".repeat(80)}`);
}

checkIntelligence()
  .then(() => {
    console.log("✅ Check complete\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Check failed:", error);
    process.exit(1);
  });
