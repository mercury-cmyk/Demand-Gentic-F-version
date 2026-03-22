import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkSettings() {
  console.log("Checking campaign intelligence settings...\n");

  const result = await db.execute(sql`
    SELECT
      name,
      status,
      require_account_intelligence
    FROM campaigns
    WHERE dial_mode = 'ai_agent'
    ORDER BY name
    LIMIT 10
  `);

  console.log("AI Agent Campaigns:");
  console.log("=".repeat(80));

  result.rows.forEach((row: any) => {
    const intelligenceStatus = row.require_account_intelligence ? "✅ ENABLED (Full)" : "⚡ DISABLED (Basic)";
    console.log(`${row.name}`);
    console.log(`  Status: ${row.status}`);
    console.log(`  Intelligence: ${intelligenceStatus}`);
    console.log("");
  });

  console.log("=".repeat(80));
  console.log("\nLegend:");
  console.log("  ⚡ DISABLED (Basic) - Uses campaign context + industry/description (FAST)");
  console.log("  ✅ ENABLED (Full) - Uses full account intelligence (PERSONALIZED)");

  process.exit(0);
}

checkSettings();