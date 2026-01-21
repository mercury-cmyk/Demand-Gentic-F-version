import { db } from "../server/db";
import { campaigns, campaignQueue, lists, contacts, accounts } from "../shared/schema";
import { eq, count, and, inArray, isNotNull, isNull, sql } from "drizzle-orm";

async function main() {
  // Find Proton UK 2026 campaign
  const [campaign] = await db.select().from(campaigns)
    .where(eq(campaigns.name, "Proton UK 2026"))
    .limit(1);
  
  if (!campaign) {
    console.log("Campaign 'Proton UK 2026' not found");
    process.exit(1);
  }
  
  console.log("=== Proton UK 2026 Campaign Analysis ===");
  console.log("Campaign ID:", campaign.id);
  console.log("Status:", campaign.status);
  
  // Parse audienceRefs
  const audienceRefs = campaign.audienceRefs as any;
  console.log("\nAudienceRefs:", JSON.stringify(audienceRefs, null, 2));
  
  const listIds = audienceRefs?.lists || audienceRefs?.selectedLists || [];
  console.log("\nNumber of lists:", listIds.length);
  
  // Check each list
  let totalRecordIds: string[] = [];
  for (const listId of listIds) {
    const [list] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (list) {
      const recordCount = list.recordIds?.length || 0;
      console.log(`- List: ${list.name} | recordIds: ${recordCount}`);
      totalRecordIds.push(...(list.recordIds || []));
    } else {
      console.log(`- List ID ${listId}: NOT FOUND`);
    }
  }
  
  const uniqueRecordIds = [...new Set(totalRecordIds)];
  console.log("\nTotal unique recordIds from lists:", uniqueRecordIds.length);
  
  // Check current queue status
  const queueStats = await db.select({
    status: campaignQueue.status,
    count: count()
  }).from(campaignQueue)
    .where(eq(campaignQueue.campaignId, campaign.id))
    .groupBy(campaignQueue.status);
  
  console.log("\nQueue by status:");
  let totalInQueue = 0;
  for (const stat of queueStats) {
    console.log(`  ${stat.status}: ${stat.count}`);
    totalInQueue += Number(stat.count);
  }
  console.log(`  Total: ${totalInQueue}`);
  
  // Check how many contacts from lists have valid phones
  if (uniqueRecordIds.length > 0) {
    const sampleSize = Math.min(100, uniqueRecordIds.length);
    const sampleIds = uniqueRecordIds.slice(0, sampleSize);
    
    // Check contacts (assuming recordIds are contact IDs)
    const contactsWithPhones = await db.select({
      id: contacts.id,
      directPhone: contacts.directPhone,
      mobilePhone: contacts.mobilePhone,
      accountId: contacts.accountId
    }).from(contacts)
      .where(inArray(contacts.id, sampleIds))
      .limit(100);
    
    console.log(`\nSample of ${sampleSize} contacts from lists:`);
    console.log(`  Found as contacts: ${contactsWithPhones.length}`);
    
    const withPhone = contactsWithPhones.filter(c => (c.directPhone && c.directPhone.trim() !== "") || (c.mobilePhone && c.mobilePhone.trim() !== "")).length;
    const withAccountId = contactsWithPhones.filter(c => c.accountId).length;
    console.log(`  With phone: ${withPhone}`);
    console.log(`  With accountId: ${withAccountId}`);
    
    // If not contacts, check if they're accounts
    if (contactsWithPhones.length === 0) {
      const accountsFromIds = await db.select({
        id: accounts.id,
        mainPhone: accounts.mainPhone
      }).from(accounts)
        .where(inArray(accounts.id, sampleIds))
        .limit(100);
      
      console.log(`  Found as accounts: ${accountsFromIds.length}`);
      const accWithPhone = accountsFromIds.filter(a => a.mainPhone && a.mainPhone.trim() !== "").length;
      console.log(`  Accounts with phone: ${accWithPhone}`);
    }
  }
  
  // Check why only 188 are in queue
  // Get a sample of queue items to see their structure
  const sampleQueueItems = await db.select({
    contactId: campaignQueue.contactId,
    status: campaignQueue.status,
    priority: campaignQueue.priority
  }).from(campaignQueue)
    .where(and(
      eq(campaignQueue.campaignId, campaign.id),
      eq(campaignQueue.status, "queued")
    ))
    .limit(5);
  
  console.log("\nSample queued items:", JSON.stringify(sampleQueueItems, null, 2));
  
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
