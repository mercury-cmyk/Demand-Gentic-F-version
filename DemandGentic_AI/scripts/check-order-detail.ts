import { db } from '../server/db';
import { clientPortalOrders, verificationCampaigns, clientAccounts } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const orderId = '7ff38b6e-9c7c-4064-a6c3-576e6f5006cb';

  console.log('Checking order:', orderId);

  const [order] = await db.select().from(clientPortalOrders).where(eq(clientPortalOrders.id, orderId));

  if (!order) {
    console.log('Order not found in database');
    process.exit(0);
  }

  console.log('\n=== ORDER DETAILS ===');
  console.log('ID:', order.id);
  console.log('Order Number:', order.orderNumber);
  console.log('Status:', order.status);
  console.log('Campaign ID:', order.campaignId);
  console.log('Client Account ID:', order.clientAccountId);

  // Check if campaign exists (API uses INNER JOIN so this is required)
  if (order.campaignId) {
    const [campaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, order.campaignId));
    if (campaign) {
      console.log('\n✓ Campaign EXISTS:', campaign.name);
    } else {
      console.log('\n✗ Campaign NOT FOUND - This breaks the INNER JOIN in the API!');
    }
  } else {
    console.log('\n✗ Order has NO campaignId - This breaks the INNER JOIN in the API!');
  }

  // Check if client exists
  if (order.clientAccountId) {
    const [client] = await db.select().from(clientAccounts).where(eq(clientAccounts.id, order.clientAccountId));
    if (client) {
      console.log('✓ Client EXISTS:', client.name);
    } else {
      console.log('✗ Client NOT FOUND - This breaks the INNER JOIN in the API!');
    }
  } else {
    console.log('✗ Order has NO clientAccountId - This breaks the INNER JOIN in the API!');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });