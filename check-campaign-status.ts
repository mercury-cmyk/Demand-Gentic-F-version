import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkStatus() {
  console.log("=".repeat(80));
  console.log("CAMPAIGN STATUS CHECK");
  console.log("=".repeat(80));

  // Check active campaigns and their queue
  const campaignStatus = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.status,
      c.require_account_intelligence,
      COUNT(cq.id) FILTER (WHERE cq.status = 'queued') as queued_count,
      COUNT(cq.id) FILTER (WHERE cq.status = 'in_progress') as in_progress_count,
      COUNT(cq.id) FILTER (WHERE cq.status = 'done') as completed_count,
      COUNT(cq.id) FILTER (WHERE cq.status = 'removed') as removed_count,
      MAX(cq.next_attempt_at) as next_scheduled_call
    FROM campaigns c
    LEFT JOIN campaign_queue cq ON cq.campaign_id = c.id
    WHERE c.dial_mode = 'ai_agent'
      AND c.status IN ('active', 'paused')
    GROUP BY c.id, c.name, c.status, c.require_account_intelligence
    ORDER BY c.status, c.name
  `);

  console.log("\n📊 AI Agent Campaigns:\n");

  if (campaignStatus.rows.length === 0) {
    console.log("No AI agent campaigns found.");
  } else {
    campaignStatus.rows.forEach((camp: any) => {
      const statusEmoji = camp.status === 'active' ? '🟢' : '⏸️';
      const intelligenceMode = camp.require_account_intelligence ? '✅ Full Intelligence' : '⚡ Basic Context';

      console.log(`${statusEmoji} ${camp.name}`);
      console.log(`   Status: ${camp.status.toUpperCase()}`);
      console.log(`   Intelligence: ${intelligenceMode}`);
      console.log(`   Queue Status:`);
      console.log(`     - Queued: ${camp.queued_count}`);
      console.log(`     - In Progress: ${camp.in_progress_count}`);
      console.log(`     - Completed: ${camp.completed_count}`);
      console.log(`     - Removed: ${camp.removed_count}`);

      if (camp.next_scheduled_call) {
        console.log(`   Next Call: ${new Date(camp.next_scheduled_call).toLocaleString()}`);
      }

      // Warnings
      if (camp.status === 'active' && camp.queued_count === 0 && camp.in_progress_count === 0) {
        console.log(`   ⚠️  WARNING: Campaign is active but has no queued calls!`);
      }

      if (camp.require_account_intelligence) {
        console.log(`   ℹ️  Note: Requires pre-generated intelligence to avoid delays`);
      }

      console.log("");
    });
  }

  // Check for orchestrator issues
  console.log("=".repeat(80));
  console.log("SYSTEM STATUS");
  console.log("=".repeat(80));

  // Check recent queue activity
  const recentActivity = await db.execute(sql`
    SELECT
      status,
      COUNT(*) as count,
      MAX(updated_at) as last_update
    FROM campaign_queue
    WHERE updated_at > NOW() - INTERVAL '1 hour'
    GROUP BY status
  `);

  console.log("\n📈 Recent Queue Activity (last hour):\n");

  if (recentActivity.rows.length === 0) {
    console.log("  ⚠️  No queue activity in the last hour");
    console.log("     This suggests the campaign orchestrator may not be running.");
  } else {
    recentActivity.rows.forEach((row: any) => {
      console.log(`  ${row.status}: ${row.count} (last: ${new Date(row.last_update).toLocaleTimeString()})`);
    });
  }

  // Check account intelligence coverage for active campaigns
  console.log("\n" + "=".repeat(80));
  console.log("INTELLIGENCE COVERAGE (Active Campaigns)");
  console.log("=".repeat(80));

  const intelligenceCoverage = await db.execute(sql`
    WITH active_campaign_accounts AS (
      SELECT DISTINCT
        c.account_id,
        camp.name as campaign_name,
        camp.require_account_intelligence
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      JOIN campaigns camp ON camp.id = cq.campaign_id
      WHERE camp.status = 'active'
        AND camp.dial_mode = 'ai_agent'
        AND cq.status IN ('queued', 'in_progress')
        AND c.account_id IS NOT NULL
    )
    SELECT
      aca.campaign_name,
      aca.require_account_intelligence,
      COUNT(DISTINCT aca.account_id) as total_accounts,
      COUNT(DISTINCT ai.account_id) as with_intelligence
    FROM active_campaign_accounts aca
    LEFT JOIN account_intelligence ai ON ai.account_id = aca.account_id
    GROUP BY aca.campaign_name, aca.require_account_intelligence
  `);

  console.log("");

  if (intelligenceCoverage.rows.length === 0) {
    console.log("  No active campaigns with queued contacts.");
  } else {
    intelligenceCoverage.rows.forEach((row: any) => {
      const coverage = row.total_accounts > 0 ? Math.round((row.with_intelligence / row.total_accounts) * 100) : 0;
      const needsIntelligence = row.require_account_intelligence;

      console.log(`  ${row.campaign_name}:`);
      console.log(`    Mode: ${needsIntelligence ? '✅ Full Intelligence Required' : '⚡ Basic Context Only'}`);
      console.log(`    Total Accounts: ${row.total_accounts}`);
      console.log(`    With Intelligence: ${row.with_intelligence} (${coverage}%)`);

      if (needsIntelligence && coverage < 50) {
        console.log(`    🚨 WARNING: Low intelligence coverage! Calls may have delays.`);
        console.log(`       Recommendation: Run intelligence generation or disable requirement`);
      } else if (needsIntelligence && coverage < 100) {
        console.log(`    ⚠️  Some accounts missing intelligence - may cause delays`);
      } else if (needsIntelligence) {
        console.log(`    ✅ Good coverage - calls should work smoothly`);
      } else {
        console.log(`    ✅ Basic mode - calls work immediately`);
      }

      console.log("");
    });
  }

  console.log("=".repeat(80));
  console.log("\n💡 Recommendations:");
  console.log("   1. If no calls are happening, check if orchestrator is running");
  console.log("   2. If queue is empty, populate it with contacts");
  console.log("   3. For active campaigns requiring intelligence with low coverage:");
  console.log("      - Either run intelligence generation");
  console.log("      - Or disable requirement for immediate calls");
  console.log("   4. Restart application server to load latest code changes");

  process.exit(0);
}

checkStatus().catch(console.error);
