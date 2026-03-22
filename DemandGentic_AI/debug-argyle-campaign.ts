import { db } from './server/db';
import { campaigns, clientCampaignAccess, clientAccounts } from './shared/schema';
import { eq, like } from 'drizzle-orm';

async function debugCampaign() {
  console.log("Searching for campaign 'Argyle_Inside Sales Demo Campaign'...");

  const campaignList = await db.select().from(campaigns).where(like(campaigns.name, '%Argyle_Inside Sales Demo Campaign%'));

  if (campaignList.length === 0) {
      console.log("No campaign found with that name.");
      process.exit(0);
  }

  const campaign = campaignList[0];
  console.log(`\nFound Campaign: ${campaign.name} (ID: ${campaign.id})`);
  console.log(`- Status: ${campaign.status}`);
  console.log(`- Approval Status: ${campaign.approvalStatus}`);
  console.log(`- Client Account ID (on campaign record): ${campaign.clientAccountId ?? 'NULL'}`);
  console.log(`- Project ID: ${campaign.projectId ?? 'NULL'}`);

  console.log("\nChecking Access Records...");
  const accesses = await db
      .select({
          clientName: clientAccounts.companyName,
          accessId: clientCampaignAccess.id
      })
      .from(clientCampaignAccess)
      .leftJoin(clientAccounts, eq(clientCampaignAccess.clientAccountId, clientAccounts.id))
      .where(eq(clientCampaignAccess.regularCampaignId, campaign.id));

  console.log(`Found ${accesses.length} clients with access to this campaign:`);
  accesses.forEach(a => console.log(` - ${a.clientName}`));

  process.exit(0);
}

debugCampaign().catch(console.error);