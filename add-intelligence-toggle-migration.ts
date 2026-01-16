import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function addIntelligenceToggle() {
  console.log("Adding require_account_intelligence column to campaigns table...");

  try {
    // Add the column
    await db.execute(sql`
      ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS require_account_intelligence BOOLEAN DEFAULT false
    `);

    console.log("✅ Column added successfully");

    // Optionally set Pivotal campaigns to require intelligence
    const result = await db.execute(sql`
      UPDATE campaigns
      SET require_account_intelligence = true
      WHERE (name LIKE '%Pivotal B2B%' OR name LIKE '%Agentic DemandGen%')
        AND dial_mode = 'ai_agent'
      RETURNING name
    `);

    console.log(`✅ Updated ${result.rows.length} Pivotal campaigns to require intelligence`);
    result.rows.forEach((row: any) => {
      console.log(`   - ${row.name}`);
    });

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }

  console.log("\n✅ Migration complete!");
  process.exit(0);
}

addIntelligenceToggle();
