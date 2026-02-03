import { db } from './server/db';
import { clientAccounts, clientCampaignAccess, campaigns, verificationCampaigns } from './shared/schema';
import { eq, ilike } from 'drizzle-orm';

async function check() {
  const client = await db.query.clientAccounts.findFirst({ where: ilike(clientAccounts.name, '%Argyle%') });
  if (!client) { console.log('Client not found'); return; }

  const accessList = await db.select().from(clientCampaignAccess).where(eq(clientCampaignAccess.clientAccountId, client.id));

  // Simulate what the backend route does
  const results = [];
  for (const access of accessList) {
      if (access.campaignId) {
          const c = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, access.campaignId));
           if(c.length > 0) results.push({...c[0], accessType: 'verification'});
      }
       if (access.regularCampaignId) {
          // NOTICE: The original route logic might be ONLY looking at verificationCampaigns
          // Let's verify if the route fetches 'campaigns' table data.
          const c = await db.select().from(campaigns).where(eq(campaigns.id, access.regularCampaignId));
          if(c.length > 0) results.push({...c[0], accessType: 'regular'});
      }
  }

  console.log('Simulated Fetched Campaigns:', results.map(r => ({id: r.id, name: r.name, type: r.accessType})));
  process.exit(0);
}
check();