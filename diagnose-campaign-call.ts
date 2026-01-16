import { db } from "./server/db";
import { campaigns, contacts, accounts, campaignQueue, virtualAgents, campaignAgentAssignments } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";

async function diagnoseFirstQueuedContact() {
  console.log("=".repeat(80));
  console.log("DIAGNOSTIC: Campaign Call Flow Analysis");
  console.log("=".repeat(80));

  // Find active AI campaign with queued items
  const activeCampaignQuery = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.status,
      c.dial_mode,
      COUNT(cq.id) as queued_count
    FROM campaigns c
    LEFT JOIN campaign_queue cq ON cq.campaign_id = c.id AND cq.status = 'queued'
    WHERE c.dial_mode = 'ai_agent'
      AND c.status IN ('active', 'paused')
    GROUP BY c.id, c.name, c.status, c.dial_mode
    HAVING COUNT(cq.id) > 0
    ORDER BY c.status DESC, COUNT(cq.id) DESC
    LIMIT 1
  `);

  if (activeCampaignQuery.rows.length === 0) {
    console.log("\n❌ No AI campaigns with queued contacts found");
    return;
  }

  const campaign = activeCampaignQuery.rows[0] as any;
  console.log(`\n📋 Analyzing Campaign: ${campaign.name}`);
  console.log(`   ID: ${campaign.id}`);
  console.log(`   Status: ${campaign.status}`);
  console.log(`   Queued Contacts: ${campaign.queued_count}`);

  // Get first queued contact
  const queuedItemQuery = await db.execute(sql`
    SELECT
      cq.id as queue_item_id,
      cq.contact_id,
      cq.campaign_id,
      c.first_name,
      c.last_name,
      c.full_name,
      c.account_id,
      c.email,
      c.job_title,
      c.direct_phone_e164,
      c.mobile_phone_e164,
      a.id as account_id_check,
      a.name as account_name
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE cq.campaign_id = ${campaign.id}
      AND cq.status = 'queued'
      AND (c.direct_phone_e164 IS NOT NULL OR c.mobile_phone_e164 IS NOT NULL)
    ORDER BY cq.created_at
    LIMIT 1
  `);

  if (queuedItemQuery.rows.length === 0) {
    console.log("\n❌ No queued contacts with phone numbers found");
    return;
  }

  const queuedItem = queuedItemQuery.rows[0] as any;
  console.log(`\n👤 First Queued Contact:`);
  console.log(`   Queue Item ID: ${queuedItem.queue_item_id}`);
  console.log(`   Contact ID: ${queuedItem.contact_id}`);
  console.log(`   Name: ${queuedItem.full_name}`);
  console.log(`   Email: ${queuedItem.email || "N/A"}`);
  console.log(`   Job Title: ${queuedItem.job_title || "N/A"}`);
  console.log(`   Phone: ${queuedItem.direct_phone_e164 || queuedItem.mobile_phone_e164}`);

  // Check account assignment
  console.log(`\n🏢 Account Information:`);
  if (queuedItem.account_id) {
    console.log(`   ✅ Has account_id: ${queuedItem.account_id}`);
    console.log(`   ✅ Account name: ${queuedItem.account_name || "N/A"}`);
  } else {
    console.log(`   ❌ NO account_id assigned!`);
    console.log(`   ⚠️  This will cause silent calls - system prompt won't be personalized`);
  }

  // Check virtual agent assignment
  const virtualAgentQuery = await db
    .select({
      virtualAgentId: campaignAgentAssignments.virtualAgentId,
      agentName: virtualAgents.name,
      provider: virtualAgents.provider,
      systemPromptLength: sql<number>`LENGTH(${virtualAgents.systemPrompt})`,
      firstMessageLength: sql<number>`LENGTH(${virtualAgents.firstMessage})`,
    })
    .from(campaignAgentAssignments)
    .leftJoin(virtualAgents, eq(campaignAgentAssignments.virtualAgentId, virtualAgents.id))
    .where(
      and(
        eq(campaignAgentAssignments.campaignId, campaign.id),
        eq(campaignAgentAssignments.isActive, true),
        eq(campaignAgentAssignments.agentType, "ai")
      )
    )
    .limit(1);

  console.log(`\n🤖 Virtual Agent Configuration:`);
  if (virtualAgentQuery.length > 0) {
    const agent = virtualAgentQuery[0];
    console.log(`   ✅ Virtual Agent: ${agent.agentName}`);
    console.log(`   ✅ Agent ID: ${agent.virtualAgentId}`);
    console.log(`   ✅ Provider: ${agent.provider}`);
    console.log(`   ${agent.systemPromptLength > 0 ? '✅' : '❌'} System Prompt Length: ${agent.systemPromptLength} chars`);
    console.log(`   ${agent.firstMessageLength > 0 ? '✅' : '❌'} First Message Length: ${agent.firstMessageLength} chars`);

    if (agent.systemPromptLength === 0) {
      console.log(`   ⚠️  WARNING: Virtual agent has no system prompt!`);
    }
  } else {
    console.log(`   ❌ NO virtual agent assigned to campaign!`);
    console.log(`   ⚠️  This will cause issues - campaign needs a virtual agent`);
  }

  // Check campaign settings
  const campaignDetailsQuery = await db.execute(sql`
    SELECT
      agent_name,
      organization_name,
      campaign_objective,
      campaign_context_brief,
      product_service_info,
      ai_agent_settings
    FROM campaigns
    WHERE id = ${campaign.id}
    LIMIT 1
  `);

  if (campaignDetailsQuery.rows.length > 0) {
    const details = campaignDetailsQuery.rows[0] as any;
    console.log(`\n📝 Campaign Settings:`);
    console.log(`   Agent Name: ${details.agent_name || "N/A"}`);
    console.log(`   Organization: ${details.organization_name || "N/A"}`);
    console.log(`   ${details.campaign_objective ? '✅' : '⚠️ '} Campaign Objective: ${details.campaign_objective ? 'Set' : 'Not set'}`);
    console.log(`   ${details.campaign_context_brief ? '✅' : '⚠️ '} Context Brief: ${details.campaign_context_brief ? 'Set' : 'Not set'}`);
    console.log(`   ${details.product_service_info ? '✅' : '⚠️ '} Product Info: ${details.product_service_info ? 'Set' : 'Not set'}`);
    console.log(`   ${details.ai_agent_settings ? '✅' : '⚠️ '} AI Agent Settings: ${details.ai_agent_settings ? 'Present' : 'Not present'}`);
  }

  // Simulate the call flow
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔍 CALL FLOW SIMULATION`);
  console.log(`${"=".repeat(80)}`);

  console.log(`\n1️⃣  Campaign Orchestrator creates CallContext:`);
  console.log(`   contactId: "${queuedItem.contact_id}"`);
  console.log(`   contactFirstName: "${queuedItem.first_name || "there"}"`);
  console.log(`   contactLastName: "${queuedItem.last_name || ""}"`);
  console.log(`   companyName: "${queuedItem.account_name || "your company"}"`);

  console.log(`\n2️⃣  Telnyx Bridge packages client_state:`);
  console.log(`   contact_id: "${queuedItem.contact_id}"`);
  console.log(`   campaign_id: "${campaign.id}"`);

  console.log(`\n3️⃣  OpenAI Realtime Dialer receives WebSocket connection:`);
  console.log(`   session.contactId = "${queuedItem.contact_id}"`);

  console.log(`\n4️⃣  getContactInfo(session.contactId) queries database:`);
  console.log(`   SELECT contacts.*, accounts.name`);
  console.log(`   FROM contacts`);
  console.log(`   LEFT JOIN accounts ON contacts.account_id = accounts.id`);
  console.log(`   WHERE contacts.id = '${queuedItem.contact_id}'`);

  console.log(`\n5️⃣  Result returned to buildSystemPrompt:`);
  console.log(`   contactInfo.id: "${queuedItem.contact_id}"`);
  console.log(`   contactInfo.accountId: "${queuedItem.account_id || "NULL - PROBLEM!"}"`);
  console.log(`   contactInfo.firstName: "${queuedItem.first_name}"`);
  console.log(`   contactInfo.company: "${queuedItem.account_name || "NULL"}"`);

  if (!queuedItem.account_id) {
    console.log(`\n   ❌ ISSUE FOUND: No accountId!`);
    console.log(`   ⚠️  buildSystemPrompt will skip account intelligence generation`);
    console.log(`   ⚠️  System prompt will be incomplete`);
    console.log(`   ⚠️  AI won't know how to respond → SILENT CALL`);
  } else {
    console.log(`\n   ✅ Contact has accountId - should work!`);
    console.log(`   ✅ buildSystemPrompt will generate account intelligence`);
    console.log(`   ✅ Full personalized prompt will be created`);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 DIAGNOSIS SUMMARY`);
  console.log(`${"=".repeat(80)}`);

  const issues: string[] = [];
  const allGood: string[] = [];

  if (!queuedItem.account_id) {
    issues.push("❌ Contact has no account_id - will cause silent calls");
  } else {
    allGood.push("✅ Contact has valid account_id");
  }

  if (virtualAgentQuery.length === 0) {
    issues.push("❌ Campaign has no virtual agent assigned");
  } else if (virtualAgentQuery[0].systemPromptLength === 0) {
    issues.push("❌ Virtual agent has empty system prompt");
  } else {
    allGood.push("✅ Virtual agent properly configured");
  }

  const campaignDetails = campaignDetailsQuery.rows[0] as any;
  if (!campaignDetails?.campaign_objective && !campaignDetails?.campaign_context_brief) {
    issues.push("⚠️  Campaign missing objective and context brief");
  } else {
    allGood.push("✅ Campaign has objective/context configured");
  }

  if (issues.length > 0) {
    console.log(`\n🚨 ISSUES FOUND:`);
    issues.forEach(issue => console.log(`   ${issue}`));
  }

  if (allGood.length > 0) {
    console.log(`\n✅ CHECKS PASSED:`);
    allGood.forEach(check => console.log(`   ${check}`));
  }

  if (issues.length === 0) {
    console.log(`\n🎉 All checks passed! Campaign should work properly.`);
    console.log(`\nIf calls are still silent, check:`);
    console.log(`   1. Server logs for "Missing accountId or contactId" warnings`);
    console.log(`   2. WebSocket connection logs in openai-realtime-dialer.ts`);
    console.log(`   3. System prompt being sent to OpenAI (look for token count logs)`);
  } else {
    console.log(`\n💡 RECOMMENDED ACTIONS:`);
    if (issues.some(i => i.includes("account_id"))) {
      console.log(`   1. Run: npm run fix-orphaned-contacts`);
    }
    if (issues.some(i => i.includes("virtual agent"))) {
      console.log(`   2. Assign a virtual agent to this campaign in the UI`);
    }
    if (issues.some(i => i.includes("objective"))) {
      console.log(`   3. Add campaign objective and context in campaign settings`);
    }
  }

  console.log(`\n${"=".repeat(80)}`);
}

diagnoseFirstQueuedContact()
  .then(() => {
    console.log("\n✅ Diagnostic complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Diagnostic failed:", error);
    process.exit(1);
  });
