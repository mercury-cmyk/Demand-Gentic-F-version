import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function setSingleCallMode() {
  console.log("================================================================================");
  console.log("SETTING SINGLE CALL MODE FOR TESTING");
  console.log("================================================================================\n");

  // Update all AI agent campaigns to max_concurrent_calls = 1
  const result = await db.execute(sql`
    UPDATE campaigns
    SET max_concurrent_calls = 1
    WHERE dial_mode = 'ai_agent'
    RETURNING id, name, status, max_concurrent_calls
  `);

  if (result.rows.length > 0) {
    console.log(`✅ Updated ${result.rows.length} campaigns to single-call mode:\n`);
    result.rows.forEach((campaign: any) => {
      console.log(`   ${campaign.name}`);
      console.log(`   Status: ${campaign.status}`);
      console.log(`   Max Concurrent Calls: ${campaign.max_concurrent_calls}`);
      console.log("");
    });
  } else {
    console.log("⚠️  No AI agent campaigns found");
  }

  console.log("================================================================================");
  console.log("WHAT THIS MEANS:\n");
  console.log("✅ System will now make only ONE call at a time");
  console.log("✅ Perfect for testing and debugging");
  console.log("✅ Next call will start only after current call completes");
  console.log("\n💡 To restore normal operation later, update max_concurrent_calls to desired value");
  console.log("================================================================================");

  process.exit(0);
}

setSingleCallMode().catch(console.error);
