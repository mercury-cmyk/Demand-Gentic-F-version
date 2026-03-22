import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function addOrgIntelligenceColumns() {
  console.log("Adding 'events' and 'forums' columns to campaign_organizations...");

  try {
    // Add columns
    await db.execute(sql`
      ALTER TABLE campaign_organizations
      ADD COLUMN IF NOT EXISTS events JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS forums JSONB DEFAULT '{}'::jsonb;
    `);

    console.log("✅ Columns added successfully");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }

  console.log("\n✅ Migration complete!");
  process.exit(0);
}

addOrgIntelligenceColumns();