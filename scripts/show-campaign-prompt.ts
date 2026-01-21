/**
 * Display Campaign System Prompt and Configuration
 */

import { db } from "../server/db";
import { campaigns } from "../shared/schema";
import { eq } from "drizzle-orm";

async function showCampaignPrompt() {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.name, "Proton UK 2026"));

  if (!campaign) {
    console.log("Campaign 'Proton UK 2026' not found");
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log("PROTON UK 2026 CAMPAIGN CONFIGURATION");
  console.log("=".repeat(70));
  console.log("\nID:", campaign.id);
  console.log("Name:", campaign.name);
  console.log("Status:", campaign.status);
  console.log("Type:", campaign.type);

  console.log("\n" + "=".repeat(70));
  console.log("AI AGENT SETTINGS / SYSTEM PROMPT");
  console.log("=".repeat(70));

  const aiSettings = campaign.aiAgentSettings as any;
  if (aiSettings) {
    if (aiSettings.systemPrompt) {
      console.log("\n--- SYSTEM PROMPT ---");
      console.log(aiSettings.systemPrompt);
    }
    if (aiSettings.persona) {
      console.log("\n--- PERSONA ---");
      console.log(JSON.stringify(aiSettings.persona, null, 2));
    }
    if (aiSettings.voiceSettings) {
      console.log("\n--- VOICE SETTINGS ---");
      console.log(JSON.stringify(aiSettings.voiceSettings, null, 2));
    }
    if (aiSettings.conversationFlow) {
      console.log("\n--- CONVERSATION FLOW ---");
      console.log(JSON.stringify(aiSettings.conversationFlow, null, 2));
    }
    // Show full settings if nothing specific found
    if (!aiSettings.systemPrompt && !aiSettings.persona) {
      console.log(JSON.stringify(aiSettings, null, 2));
    }
  } else {
    console.log("(No AI agent settings configured)");
  }

  console.log("\n" + "=".repeat(70));
  console.log("CAMPAIGN CONTEXT");
  console.log("=".repeat(70));
  console.log("\nObjective:", campaign.campaignObjective || "(not set)");
  console.log("\nProduct/Service Info:", campaign.productServiceInfo || "(not set)");
  console.log("\nTarget Audience:", campaign.targetAudienceDescription || "(not set)");
  console.log("\nSuccess Criteria:", campaign.successCriteria || "(not set)");

  const qualQuestions = campaign.qualificationQuestions as any;
  if (qualQuestions) {
    console.log("\n" + "=".repeat(70));
    console.log("QUALIFICATION QUESTIONS");
    console.log("=".repeat(70));
    console.log(JSON.stringify(qualQuestions, null, 2));
  }

  const powerSettings = campaign.powerSettings as any;
  if (powerSettings) {
    console.log("\n" + "=".repeat(70));
    console.log("POWER DIALER SETTINGS");
    console.log("=".repeat(70));
    console.log(JSON.stringify(powerSettings, null, 2));
  }

  console.log("\n" + "=".repeat(70));
  console.log("SUPPRESSION STATUS");
  console.log("=".repeat(70));

  // Check opt-outs count
  const { campaignOptOuts } = await import("../shared/schema");
  const optOuts = await db
    .select()
    .from(campaignOptOuts)
    .where(eq(campaignOptOuts.campaignId, campaign.id));

  console.log(`\nContacts opted out: ${optOuts.length}`);

  // Group by reason
  const byReason: Record<string, number> = {};
  optOuts.forEach(o => {
    const reason = (o.reason || "unknown").split(":")[0].trim();
    byReason[reason] = (byReason[reason] || 0) + 1;
  });

  Object.entries(byReason).forEach(([reason, count]) => {
    console.log(`  - ${reason}: ${count}`);
  });
}

showCampaignPrompt()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
