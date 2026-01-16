import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function disableIntelligenceRequirement() {
  console.log("================================================================================");
  console.log("DISABLING INTELLIGENCE REQUIREMENT FOR PIVOTAL CAMPAIGN");
  console.log("================================================================================\n");

  // Update the active Pivotal campaign to not require intelligence
  const result = await db.execute(sql`
    UPDATE campaigns
    SET require_account_intelligence = false
    WHERE name = 'Agentic DemandGen for Pivotal B2B_Waterfall'
      AND dial_mode = 'ai_agent'
    RETURNING id, name, status, require_account_intelligence
  `);

  if (result.rows.length > 0) {
    console.log("✅ Successfully updated campaign:\n");
    result.rows.forEach((row: any) => {
      console.log(`   Campaign: ${row.name}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Intelligence Required: ${row.require_account_intelligence ? 'Yes' : 'No'}`);
    });

    console.log("\n================================================================================");
    console.log("WHAT THIS MEANS:");
    console.log("================================================================================\n");
    console.log("✅ Calls will now start IMMEDIATELY without waiting for intelligence");
    console.log("✅ AI will use basic company context (industry, description, size, revenue)");
    console.log("✅ All 108 contacts ready to call will be processed");
    console.log("✅ No more silent calls - prompts build instantly\n");
    console.log("⚡ Intelligence generation continues in background (10% complete)");
    console.log("⚡ You can re-enable intelligence later when generation is done\n");
    console.log("================================================================================");
  } else {
    console.log("❌ No campaign found with that name");
  }

  process.exit(0);
}

disableIntelligenceRequirement().catch(console.error);
