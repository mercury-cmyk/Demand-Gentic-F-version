import { db } from "../server/db";
import { campaigns } from "../shared/schema";
import { desc } from "drizzle-orm";

async function checkCampaignContext() {
  console.log("Checking campaign context fields in database...\n");

  // Get recent campaigns to see what fields are populated
  const recentCampaigns = await db.select({
    id: campaigns.id,
    name: campaigns.name,
    type: campaigns.type,
    campaignObjective: campaigns.campaignObjective,
    productServiceInfo: campaigns.productServiceInfo,
    talkingPoints: campaigns.talkingPoints,
    targetAudienceDescription: campaigns.targetAudienceDescription,
    successCriteria: campaigns.successCriteria,
    campaignObjections: campaigns.campaignObjections,
  })
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt))
    .limit(5);

  console.log(`Found ${recentCampaigns.length} recent campaigns:\n`);

  for (const campaign of recentCampaigns) {
    console.log(`Campaign: ${campaign.name}`);
    console.log(`  Type: ${campaign.type}`);
    console.log(`  Campaign Objective: ${campaign.campaignObjective || '(empty)'}`);
    console.log(`  Product/Service Info: ${campaign.productServiceInfo ? campaign.productServiceInfo.substring(0, 50) + '...' : '(empty)'}`);
    console.log(`  Talking Points: ${campaign.talkingPoints ? JSON.stringify(campaign.talkingPoints).substring(0, 50) + '...' : '(empty)'}`);
    console.log(`  Target Audience: ${campaign.targetAudienceDescription || '(empty)'}`);
    console.log(`  Success Criteria: ${campaign.successCriteria || '(empty)'}`);
    console.log(`  Objections: ${campaign.campaignObjections ? 'populated' : '(empty)'}`);
    console.log('');
  }

  process.exit(0);
}

checkCampaignContext().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
