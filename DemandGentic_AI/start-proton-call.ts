/**
 * Start a test call for Proton UK campaign
 */
import { db } from "./server/db";
import { campaigns, campaignQueue, contacts, accounts } from "./shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getTelnyxAiBridge } from "./server/services/telnyx-ai-bridge";

const CAMPAIGN_ID = "ae5b353d-64a9-44d8-92cf-69d4726ca121";

async function startCall() {
  console.log("=".repeat(60));
  console.log("Starting test call for Proton UK campaign");
  console.log("=".repeat(60));

  // Get campaign details
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, CAMPAIGN_ID))
    .limit(1);

  if (!campaign) {
    console.error("Campaign not found!");
    return;
  }

  console.log(`\nCampaign: ${campaign.name}`);
  console.log(`Status: ${campaign.status}`);

  // Get queued contacts with complete data
  const queueItems = await db
    .select({
      queueItem: campaignQueue,
      contact: contacts,
      account: accounts,
    })
    .from(campaignQueue)
    .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
    .innerJoin(accounts, eq(campaignQueue.accountId, accounts.id))
    .where(
      and(
        eq(campaignQueue.campaignId, CAMPAIGN_ID),
        eq(campaignQueue.status, "queued"),
        isNotNull(contacts.email),
        isNotNull(contacts.jobTitle)
      )
    )
    .limit(5);

  console.log(`\nQueued contacts with complete data: ${queueItems.length}`);

  if (queueItems.length === 0) {
    console.log("No fully complete contacts. Trying any queued contact...");

    const anyQueued = await db
      .select({
        queueItem: campaignQueue,
        contact: contacts,
        account: accounts,
      })
      .from(campaignQueue)
      .innerJoin(contacts, eq(campaignQueue.contactId, contacts.id))
      .innerJoin(accounts, eq(campaignQueue.accountId, accounts.id))
      .where(
        and(
          eq(campaignQueue.campaignId, CAMPAIGN_ID),
          eq(campaignQueue.status, "queued")
        )
      )
      .limit(5);

    console.log(`\nAll queued contacts: ${anyQueued.length}`);
    anyQueued.forEach(item => {
      console.log(`  - ${item.contact.firstName} ${item.contact.lastName}`);
      console.log(`    Account: ${item.account.name || '(missing)'}`);
      console.log(`    Email: ${item.contact.email || '(missing)'}`);
      console.log(`    Job: ${item.contact.jobTitle || '(missing)'}`);
    });

    if (anyQueued.length === 0) return;

    // Use first available even if incomplete
    const first = anyQueued[0];
    console.log(`\nUsing first contact anyway: ${first.contact.firstName} ${first.contact.lastName}`);
    await makeCall(campaign, first.queueItem, first.contact, first.account);
    return;
  }

  // Get first complete contact from queue
  const item = queueItems[0];
  await makeCall(campaign, item.queueItem, item.contact, item.account);
}

async function makeCall(campaign: any, queueItem: any, contact: any, account: any) {
  console.log(`\nInitiating call to:`);
  console.log(`  Name: ${contact.firstName} ${contact.lastName}`);
  console.log(`  Account: ${account.name}`);
  console.log(`  Email: ${contact.email}`);
  console.log(`  Job: ${contact.jobTitle}`);
  console.log(`  Phone: ${contact.phone || contact.mobilePhone}`);

  // Get bridge and initiate call
  const bridge = getTelnyxAiBridge();

  const phoneNumber = contact.phone || contact.mobilePhone;
  if (!phoneNumber) {
    console.error("No phone number for contact");
    return;
  }

  const fromNumber = campaign.callerId || process.env.TELNYX_FROM_NUMBER;
  if (!fromNumber) {
    console.error("No from number configured");
    return;
  }

  console.log(`  From: ${fromNumber}`);
  console.log("\nInitiating AI call via Telnyx + Gemini Live...\n");

  try {
    const aiAgentSettings = campaign.aiAgentSettings as any || {};

    const result = await bridge.initiateAiCall(
      phoneNumber,
      fromNumber,
      aiAgentSettings,
      {
        campaignId: campaign.id,
        contactId: contact.id,
        queueItemId: queueItem.id,
        contactFirstName: contact.firstName || '',
        contactLastName: contact.lastName || '',
        contactTitle: contact.jobTitle || undefined,
        contactEmail: contact.email || undefined,
        companyName: account.name || '',
        phoneNumber: phoneNumber,
        accountId: account.id,
      },
      'gemini_live'
    );

    console.log("Call initiated successfully!");
    console.log(`  Call ID: ${result.callId}`);
    console.log(`  Call Control ID: ${result.callControlId}`);
  } catch (error) {
    console.error("Failed to initiate call:", error);
  }
}

startCall().then(() => {
  console.log("\nDone. Monitor server logs for call progress.");
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});