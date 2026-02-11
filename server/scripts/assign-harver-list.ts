/**
 * Assign HarverUAE list to Harver appointment generation campaign
 */
import { db } from "../db";
import { lists, campaigns } from "@shared/schema";
import { eq, sql, ilike } from "drizzle-orm";

async function main() {
  // Step 1: Find the HarverUAE list
  console.log("=== Finding HarverUAE list ===");
  const matchingLists = await db
    .select({
      id: lists.id,
      name: lists.name,
      entityType: lists.entityType,
      recordCount: sql<number>`array_length(${lists.recordIds}, 1)`,
      createdAt: lists.createdAt,
    })
    .from(lists)
    .where(ilike(lists.name, "%harver%"));

  if (matchingLists.length === 0) {
    console.log("No lists found matching 'harver'. Listing all lists:");
    const allLists = await db
      .select({ id: lists.id, name: lists.name, recordCount: sql<number>`array_length(${lists.recordIds}, 1)` })
      .from(lists)
      .limit(50);
    for (const l of allLists) {
      console.log(`  - ${l.name} (${l.id}) - ${l.recordCount || 0} records`);
    }
    process.exit(1);
  }

  console.log("Matching lists:");
  for (const l of matchingLists) {
    console.log(`  - "${l.name}" (${l.id}) - ${l.recordCount || 0} records, type: ${l.entityType}`);
  }

  // Step 2: Find the Harver appointment generation campaign
  console.log("\n=== Finding Harver appointment generation campaign ===");
  const matchingCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.type,
      status: campaigns.status,
      audienceRefs: campaigns.audienceRefs,
    })
    .from(campaigns)
    .where(ilike(campaigns.name, "%harver%"));

  if (matchingCampaigns.length === 0) {
    console.log("No campaigns found matching 'harver'. Listing recent campaigns:");
    const allCampaigns = await db
      .select({ id: campaigns.id, name: campaigns.name, type: campaigns.type, status: campaigns.status })
      .from(campaigns)
      .limit(50);
    for (const c of allCampaigns) {
      console.log(`  - "${c.name}" (${c.id}) - type: ${c.type}, status: ${c.status}`);
    }
    process.exit(1);
  }

  console.log("Matching campaigns:");
  for (const c of matchingCampaigns) {
    console.log(`  - "${c.name}" (${c.id}) - type: ${c.type}, status: ${c.status}`);
    console.log(`    Current audienceRefs: ${JSON.stringify(c.audienceRefs)}`);
  }

  // Step 3: Assign the HarverUAE list specifically to the campaign
  const targetList = matchingLists.find(l => l.name === "HarverUAE");
  if (!targetList) {
    console.log("Could not find list named 'HarverUAE'!");
    process.exit(1);
  }
  const targetCampaign = matchingCampaigns.find(c =>
    c.name?.toLowerCase().includes("appoitnment") || c.name?.toLowerCase().includes("appointment")
  ) || matchingCampaigns[0];

  console.log(`\n=== Assigning list "${targetList.name}" to campaign "${targetCampaign.name}" ===`);

  const existingRefs = (targetCampaign.audienceRefs as any) || {};
  const existingLists: string[] = existingRefs.lists || existingRefs.selectedLists || [];

  if (existingLists.includes(targetList.id)) {
    console.log("List is already assigned to this campaign!");
    process.exit(0);
  }

  const updatedAudienceRefs = {
    ...existingRefs,
    lists: [...existingLists, targetList.id],
  };

  await db
    .update(campaigns)
    .set({
      audienceRefs: updatedAudienceRefs,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, targetCampaign.id));

  console.log("Updated audienceRefs:", JSON.stringify(updatedAudienceRefs, null, 2));
  console.log(`\nDone! List "${targetList.name}" (${targetList.recordCount || 0} records) assigned to campaign "${targetCampaign.name}"`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
