import { db } from './server/db';
import { campaigns, clientCampaignAccess, clientAccounts } from './shared/schema';
import { eq, and } from 'drizzle-orm';

async function checkCampaignDetails() {
  console.log("Checking campaign details for Argyle...");

  // 1. Get Client Account
  const clientRes = await db.select().from(clientAccounts).where(eq(clientAccounts.companyName, 'Argyle'));
  const clientAccountId = clientRes[0]?.id;
  
  if (!clientAccountId) {
    console.error("Argyle client not found");
    return;
  }
  console.log(`Client Account ID: ${clientAccountId}`);

  // 2. Get Access Records
  const accesses = await db.select().from(clientCampaignAccess).where(eq(clientCampaignAccess.clientAccountId, clientAccountId));
  console.log(`Found ${accesses.length} access records.`);

  for (const access of accesses) {
      if (access.regularCampaignId) {
          console.log(`\nChecking Regular Campaign ID: ${access.regularCampaignId}`);
          const camp = await db.select().from(campaigns).where(eq(campaigns.id, access.regularCampaignId));
          if (camp.length > 0) {
              const c = camp[0];
              console.log(` - Name: ${c.name}`);
              console.log(` - Status: ${c.status}`);
              console.log(` - Approval Status: ${c.approvalStatus}`);
              console.log(` - Client Account ID (on campaign): ${c.clientAccountId}`);
              console.log(` - Match Client ID? ${c.clientAccountId === clientAccountId}`);
          } else {
              console.log(" - Campaign record not found!");
          }
      }
  }

  process.exit(0);
}

checkCampaignDetails().catch(console.error);