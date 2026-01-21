/**
 * Start AI Calls for Campaign (Direct DB Access)
 * Usage: npx tsx scripts/start-ai-calls.ts [campaignId] [limit]
 */
import 'dotenv/config';
import { db } from '../server/db';
import { campaigns, campaignQueue, contacts, accounts } from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getTelnyxAiBridge } from '../server/services/telnyx-ai-bridge';

const CAMPAIGN_ID = process.argv[2] || 'ad8c5155-fcc3-4b4c-bdc6-55b4b58cbb37';
const LIMIT = parseInt(process.argv[3] || '10', 10);
const DELAY_BETWEEN_CALLS = 3000;

async function main() {
  console.log(`Starting AI calls for campaign: ${CAMPAIGN_ID}`);
  console.log(`Limit: ${LIMIT} calls`);
  console.log(`Delay between calls: ${DELAY_BETWEEN_CALLS}ms`);

  // Get campaign
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, CAMPAIGN_ID));
  if (!campaign) {
    console.error('Campaign not found!');
    process.exit(1);
  }
  console.log(`Campaign: ${campaign.name}`);

  // Get queue items with contact info via join
  const queueItems = await db.select({
    queueId: campaignQueue.id,
    contactId: campaignQueue.contactId,
    accountId: campaignQueue.accountId,
    firstName: contacts.firstName,
    lastName: contacts.lastName,
    jobTitle: contacts.jobTitle,
    email: contacts.email,
    directPhone: contacts.directPhone,
    directPhoneE164: contacts.directPhoneE164,
    mobilePhone: contacts.mobilePhone,
    mobilePhoneE164: contacts.mobilePhoneE164,
  })
    .from(campaignQueue)
    .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
    .where(
      and(
        eq(campaignQueue.campaignId, CAMPAIGN_ID),
        eq(campaignQueue.status, 'queued')
      )
    )
    .limit(LIMIT);

  console.log(`Found ${queueItems.length} queue items`);

  const bridge = getTelnyxAiBridge();
  const fromNumber = process.env.TELNYX_FROM_NUMBER || '+15593366940';
  
  let initiated = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of queueItems) {
    try {
      // Get phone number from contact
      const phoneNumber = item.directPhoneE164 || item.mobilePhoneE164 || item.directPhone || item.mobilePhone;
      
      if (!phoneNumber) {
        console.log(`Skipping ${item.queueId} - no phone number on contact`);
        skipped++;
        continue;
      }

      // Get account
      let account = null;
      if (item.accountId) {
        const [a] = await db.select().from(accounts).where(eq(accounts.id, item.accountId));
        account = a;
      }

      console.log(`Calling ${phoneNumber} (Contact: ${item.firstName || 'N/A'} ${item.lastName || 'N/A'})`);

      const aiSettings = campaign.aiAgentSettings as any;
      
      // Initiate the call
      const result = await bridge.initiateAiCall(
        phoneNumber,
        fromNumber,
        aiSettings,
        {
          contactFirstName: item.firstName || 'Unknown',
          contactLastName: item.lastName || 'Contact',
          contactTitle: item.jobTitle || undefined,
          contactEmail: item.email || 'no-email@placeholder.com',
          companyName: account?.name || 'Unknown Company',
          phoneNumber,
          campaignId: CAMPAIGN_ID,
          contactId: item.contactId || undefined,
          accountId: item.accountId || undefined,
          queueItemId: item.queueId,
        }
      );
      
      console.log(`  ✅ Call initiated: ${result.callId}`);

      initiated++;
      
      // Delay between calls
      if (initiated < queueItems.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS));
      }
    } catch (error) {
      console.error(`Failed to call:`, error);
      failed++;
    }
  }

  console.log(`\n✅ AI Calls Started!`);
  console.log(`Initiated: ${initiated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  
  // Keep process alive briefly for calls to connect
  console.log('\nWaiting 5 seconds for calls to initiate...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
