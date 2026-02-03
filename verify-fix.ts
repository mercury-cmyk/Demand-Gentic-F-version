
import { db } from './server/db';
import { clientCampaignAccess, verificationCampaigns, campaigns, clientAccounts } from './shared/schema';
import { eq, and, isNotNull, desc } from 'drizzle-orm';

async function verifyFix() {
  console.log("Verifying fix for Client Portal Campaign Access...");

  // 1. Find the Argyle account ID again
  const clientRes = await db.select().from(clientAccounts).where(eq(clientAccounts.companyName, 'Argyle'));
  const clientAccountId = clientRes[0]?.id;

  if (!clientAccountId) {
    console.error("Argyle client not found");
    return;
  }
  console.log(`Checking campaigns for Client Account ID: ${clientAccountId}`);

  // 2. Fetch Verification Campaigns (Old Logic)
  const verificationAccessList = await db
      .select({
        campaign: verificationCampaigns,
      })
      .from(clientCampaignAccess)
      .innerJoin(verificationCampaigns, eq(clientCampaignAccess.campaignId, verificationCampaigns.id))
      .where(
        and(
           eq(clientCampaignAccess.clientAccountId, clientAccountId),
           isNotNull(clientCampaignAccess.campaignId)
        )
      );
  
  console.log(`Found ${verificationAccessList.length} Verification Campaigns`);

  // 3. Fetch Regular Campaigns (New Logic)
  const regularAccessList = await db
      .select({
        campaign: campaigns,
      })
      .from(clientCampaignAccess)
      .innerJoin(campaigns, eq(clientCampaignAccess.regularCampaignId, campaigns.id))
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          isNotNull(clientCampaignAccess.regularCampaignId)
        )
      );

  console.log(`Found ${regularAccessList.length} Regular Campaigns`);
  regularAccessList.forEach(item => {
      console.log(` - ID: ${item.campaign.id}, Name: ${item.campaign.name}`);
  });

  const total = verificationAccessList.length + regularAccessList.length;
  console.log(`Total campaigns to be returned: ${total}`);

  if (regularAccessList.length > 0) {
      console.log("\n[SUCCESS] Fix verified! Regular campaigns are now being retrieved.");
  } else {
      console.log("\n[WARNING] No regular campaigns found. Please ensure the assignment exists.");
  }

  process.exit(0);
}

verifyFix().catch(console.error);
