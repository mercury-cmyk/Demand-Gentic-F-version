import { db } from './server/db';
import { clientAccounts, clientCampaignAccess, campaigns } from './shared/schema';
import { eq, ilike } from 'drizzle-orm';

async function check() {
  try {
    const client = await db.query.clientAccounts.findFirst({
      where: ilike(clientAccounts.name, '%Argyle%')
    });

    if (!client) {
      console.log('Client Argyle not found');
      process.exit(0);
    }
    console.log('Client:', client.name, client.id);

    const access = await db.select().from(clientCampaignAccess).where(eq(clientCampaignAccess.clientAccountId, client.id));
    console.log('Raw Access Records:', JSON.stringify(access, null, 2));

    if (access.length > 0) {
      for (const a of access) {
        if (a.regularCampaignId) {
           const c = await db.query.campaigns.findFirst({ where: eq(campaigns.id, a.regularCampaignId) });
           console.log('Linked Campaign (Regular):', c?.name, c?.type);
        }
        if (a.campaignId) {
           console.log('Linked Campaign (Verification ID):', a.campaignId);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
check();