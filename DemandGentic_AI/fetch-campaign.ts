import { db } from "./server/db";
import { campaigns } from "./shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const allCampaigns = await db.select().from(campaigns).limit(5);
  console.log("Found campaigns:");
  for (const c of allCampaigns) {
    console.log(`- ID: ${c.id}, Name: ${c.name}, Mode: ${c.dialMode}`);
    console.log(`  Objective: ${c.campaignObjective || 'N/A'}`);
    console.log(`  Talking Points: ${JSON.stringify(c.talkingPoints)}`);
  }
  process.exit(0);
}

main().catch(console.error);