import { db } from "./server/db";
import { accounts, contacts, accountIntelligenceRecords, accountMessagingBriefs } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

async function testAccountIntelligence() {
  console.log("=".repeat(80));
  console.log("TESTING: Account Intelligence Data for System Prompt");
  console.log("=".repeat(80));

  // Get a sample contact from Proton UK campaign
  const testContactQuery = await db.execute(sql`
    SELECT
      c.id as contact_id,
      c.first_name,
      c.last_name,
      c.account_id,
      a.id as account_check,
      a.name as account_name,
      a.domain,
      a.website_domain,
      a.industry_standardized,
      a.industry_raw,
      a.industry_ai_suggested,
      a.description,
      a.staff_count as employee_count,
      a.annual_revenue as revenue
    FROM contacts c
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE c.account_id IS NOT NULL
    ORDER BY RANDOM()
    LIMIT 1
  `);

  if (testContactQuery.rows.length === 0) {
    console.log("\n❌ No contacts with accounts found");
    return;
  }

  const contact = testContactQuery.rows[0] as any;

  console.log(`\n👤 Test Contact:`);
  console.log(`   Contact ID: ${contact.contact_id}`);
  console.log(`   Name: ${contact.first_name} ${contact.last_name}`);
  console.log(`   Account ID: ${contact.account_id}`);

  console.log(`\n🏢 Account Data (from accounts table):`);
  console.log(`   Name: ${contact.account_name}`);
  console.log(`   Domain: ${contact.domain || contact.website_domain || "N/A"}`);
  console.log(`   Industry: ${contact.industry_standardized || contact.industry_raw || contact.industry_ai_suggested || "N/A"}`);
  console.log(`   Description: ${contact.description ? contact.description.substring(0, 100) + "..." : "N/A"}`);
  console.log(`   Employees: ${contact.employee_count || "N/A"}`);
  console.log(`   Revenue: ${contact.revenue || "N/A"}`);

  // Check if account intelligence exists
  console.log(`\n🧠 Account Intelligence Records:`);
  const intelligenceQuery = await db
    .select({
      id: accountIntelligenceRecords.id,
      version: accountIntelligenceRecords.version,
      payloadJson: accountIntelligenceRecords.payloadJson,
      generatedAt: accountIntelligenceRecords.generatedAt,
    })
    .from(accountIntelligenceRecords)
    .where(eq(accountIntelligenceRecords.accountId, contact.account_id))
    .orderBy(desc(accountIntelligenceRecords.version))
    .limit(1);

  if (intelligenceQuery.length === 0) {
    console.log(`   ❌ NO intelligence record found!`);
    console.log(`   ⚠️  System will generate new intelligence on first call`);
    console.log(`   ⚠️  This takes time and may delay the call`);
  } else {
    const intel = intelligenceQuery[0];
    console.log(`   ✅ Intelligence record found (version ${intel.version})`);
    console.log(`   Generated: ${intel.generatedAt}`);
    console.log(`   Payload preview:`);
    const payload = intel.payloadJson as any;
    console.log(`      - Key Insights: ${payload.keyInsights?.length || 0} items`);
    console.log(`      - Pain Points: ${payload.painPoints?.length || 0} items`);
    console.log(`      - Business Context: ${payload.businessContext ? "Present" : "Missing"}`);
  }

  // Check if messaging brief exists
  console.log(`\n📧 Account Messaging Brief:`);
  const briefQuery = await db
    .select({
      id: accountMessagingBriefs.id,
      version: accountMessagingBriefs.version,
      payloadJson: accountMessagingBriefs.payloadJson,
      generatedAt: accountMessagingBriefs.generatedAt,
    })
    .from(accountMessagingBriefs)
    .where(eq(accountMessagingBriefs.accountId, contact.account_id))
    .orderBy(desc(accountMessagingBriefs.version))
    .limit(1);

  if (briefQuery.length === 0) {
    console.log(`   ❌ NO messaging brief found!`);
    console.log(`   ⚠️  System will generate new brief on first call`);
  } else {
    const brief = briefQuery[0];
    console.log(`   ✅ Messaging brief found (version ${brief.version})`);
    console.log(`   Generated: ${brief.generatedAt}`);
    const payload = brief.payloadJson as any;
    console.log(`   Payload preview:`);
    console.log(`      - Core Message: ${payload.coreMessage ? "Present" : "Missing"}`);
    console.log(`      - Value Props: ${payload.valuePropositions?.length || 0} items`);
  }

  // Check statistics across all accounts
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 INTELLIGENCE COVERAGE STATISTICS`);
  console.log(`${"=".repeat(80)}`);

  const coverageQuery = await db.execute(sql`
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
      COUNT(DISTINCT amb.account_id) as accounts_with_brief,
      COUNT(DISTINCT CASE WHEN air.account_id IS NOT NULL AND amb.account_id IS NOT NULL THEN ca.account_id END) as accounts_fully_prepared
    FROM campaign_accounts ca
    LEFT JOIN account_intelligence_records air ON air.account_id = ca.account_id
    LEFT JOIN account_messaging_briefs amb ON amb.account_id = ca.account_id
  `);

  const stats = coverageQuery.rows[0] as any;
  console.log(`\n📈 Accounts in AI Campaign Queues:`);
  console.log(`   Total Accounts: ${stats.total_accounts}`);
  console.log(`   With Intelligence: ${stats.accounts_with_intelligence} (${Math.round(stats.accounts_with_intelligence / stats.total_accounts * 100)}%)`);
  console.log(`   With Messaging Brief: ${stats.accounts_with_brief} (${Math.round(stats.accounts_with_brief / stats.total_accounts * 100)}%)`);
  console.log(`   Fully Prepared: ${stats.accounts_fully_prepared} (${Math.round(stats.accounts_fully_prepared / stats.total_accounts * 100)}%)`);

  const unpreparedCount = stats.total_accounts - stats.accounts_fully_prepared;
  if (unpreparedCount > 0) {
    console.log(`\n⚠️  WARNING: ${unpreparedCount} accounts lack intelligence/brief data`);
    console.log(`   First calls to these accounts will:`);
    console.log(`   1. Take longer (generating intelligence on the fly)`);
    console.log(`   2. May fail if AI generation times out`);
    console.log(`   3. Could result in silent calls if generation fails`);
  }

  // Check account field completeness
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📋 ACCOUNT DATA COMPLETENESS`);
  console.log(`${"=".repeat(80)}`);

  const completenessQuery = await db.execute(sql`
    WITH campaign_accounts AS (
      SELECT DISTINCT c.account_id, a.name, a.domain, a.website_domain,
             a.industry_standardized, a.industry_raw, a.industry_ai_suggested,
             a.description, a.staff_count, a.annual_revenue
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      JOIN campaigns cam ON cam.id = cq.campaign_id
      JOIN accounts a ON a.id = c.account_id
      WHERE cam.dial_mode = 'ai_agent'
        AND cq.status IN ('queued', 'in_progress')
        AND c.account_id IS NOT NULL
    )
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE name IS NOT NULL AND name != '') as has_name,
      COUNT(*) FILTER (WHERE domain IS NOT NULL OR website_domain IS NOT NULL) as has_domain,
      COUNT(*) FILTER (WHERE industry_standardized IS NOT NULL OR industry_raw IS NOT NULL OR industry_ai_suggested IS NOT NULL) as has_industry,
      COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') as has_description,
      COUNT(*) FILTER (WHERE staff_count IS NOT NULL) as has_employee_count,
      COUNT(*) FILTER (WHERE annual_revenue IS NOT NULL) as has_revenue
    FROM campaign_accounts
  `);

  const completeness = completenessQuery.rows[0] as any;
  console.log(`\n📊 Account Field Completeness:`);
  console.log(`   Name: ${completeness.has_name}/${completeness.total} (${Math.round(completeness.has_name / completeness.total * 100)}%)`);
  console.log(`   Domain: ${completeness.has_domain}/${completeness.total} (${Math.round(completeness.has_domain / completeness.total * 100)}%)`);
  console.log(`   Industry: ${completeness.has_industry}/${completeness.total} (${Math.round(completeness.has_industry / completeness.total * 100)}%)`);
  console.log(`   Description: ${completeness.has_description}/${completeness.total} (${Math.round(completeness.has_description / completeness.total * 100)}%)`);
  console.log(`   Employee Count: ${completeness.has_employee_count}/${completeness.total} (${Math.round(completeness.has_employee_count / completeness.total * 100)}%)`);
  console.log(`   Revenue: ${completeness.has_revenue}/${completeness.total} (${Math.round(completeness.has_revenue / completeness.total * 100)}%)`);

  // CRITICAL INSIGHT
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔍 CRITICAL INSIGHT: Why Calls Might Be Silent`);
  console.log(`${"=".repeat(80)}`);

  if (stats.accounts_fully_prepared  {
    console.log("\n✅ Test complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });