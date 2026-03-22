import { db } from '../server/db';
import { clientPortalOrders, verificationCampaigns, clientAccounts, campaignOrders } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const orderId = 'c50c90a8-3c90-45f8-87af-641f5a675952';

  console.log('Checking order:', orderId);

  // Check if order exists
  const [order] = await db.select().from(clientPortalOrders).where(eq(clientPortalOrders.id, orderId));

  if (!order) {
    console.log('\nOrder NOT FOUND in client_portal_orders table');

    // List recent orders
    const recentOrders = await db.select({
      id: clientPortalOrders.id,
      status: clientPortalOrders.status,
      createdAt: clientPortalOrders.createdAt,
    }).from(clientPortalOrders).limit(5);

    console.log('\nRecent orders:');
    recentOrders.forEach(o => console.log(`- ${o.id} | ${o.status} | ${o.createdAt}`));

    // Also check campaign_orders table
    const [campOrder] = await db.select().from(campaignOrders).where(eq(campaignOrders.id, orderId));
    if (campOrder) {
      console.log('\nFound in campaign_orders table instead:', campOrder);
    } else {
      console.log('\nAlso not found in campaign_orders table');
    }
  } else {
    console.log('\nOrder found:');
    console.log('  ID:', order.id);
    console.log('  Status:', order.status);
    console.log('  Campaign ID:', order.campaignId);
    console.log('  Client Account ID:', order.clientAccountId);
    console.log('  Created:', order.createdAt);

    // Check if campaign exists
    if (order.campaignId) {
      const [campaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, order.campaignId));
      if (!campaign) {
        console.log('\n*** Campaign NOT FOUND in verification_campaigns:', order.campaignId);
      } else {
        console.log('\nCampaign found:', campaign.id, '-', campaign.name);
      }
    } else {
      console.log('\nOrder has no campaignId');
    }

    // Check client account
    if (order.clientAccountId) {
      const [client] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, order.clientAccountId));
      if (!client) {
        console.log('*** Client Account NOT FOUND:', order.clientAccountId);
      } else {
        console.log('Client Account found:', client.id, '-', client.companyName);
      }
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });