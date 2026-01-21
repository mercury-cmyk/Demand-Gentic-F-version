/**
 * Script to repopulate Proton UK 2026 campaign queue
 */
import { db } from '../server/db';
import { campaigns, campaignQueue, lists, contacts } from '../shared/schema';
import { eq, and, inArray, sql, count, isNotNull } from 'drizzle-orm';

async function repopulateQueue() {
  console.log('Starting queue repopulation for Proton UK 2026...\n');

  // Get the campaign
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.name, 'Proton UK 2026')).limit(1);
  if (!campaign) {
    console.error('Campaign not found');
    process.exit(1);
  }
  console.log('Campaign ID:', campaign.id);

  // Get the audience refs
  const audienceRefs = campaign.audienceRefs as { lists?: string[] } | null;
  const listIds = audienceRefs?.lists || [];
  console.log('List IDs:', listIds);

  if (listIds.length === 0) {
    console.error('No lists attached to campaign');
    process.exit(1);
  }

  // Get all contact IDs from lists
  let allContactIds: string[] = [];
  for (const listId of listIds) {
    const [list] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (list) {
      console.log(`List "${list.name}": ${list.recordIds?.length || 0} recordIds`);
      if (list.recordIds) {
        allContactIds = [...allContactIds, ...list.recordIds];
      }
    }
  }

  console.log(`\nTotal contact IDs from lists: ${allContactIds.length}`);

  // Load contacts in batches
  const BATCH_SIZE = 1000;
  let validContacts: any[] = [];

  for (let i = 0; i < allContactIds.length; i += BATCH_SIZE) {
    const batch = allContactIds.slice(i, i + BATCH_SIZE);
    const batchContacts = await db.select({
      id: contacts.id,
      accountId: contacts.accountId,
      directPhoneE164: contacts.directPhoneE164,
      mobilePhoneE164: contacts.mobilePhoneE164,
      directPhone: contacts.directPhone,
      mobilePhone: contacts.mobilePhone,
    }).from(contacts).where(inArray(contacts.id, batch));
    
    // Filter to contacts with valid phone numbers
    const withPhone = batchContacts.filter(c => 
      c.directPhoneE164 || c.mobilePhoneE164 || c.directPhone || c.mobilePhone
    );
    validContacts = [...validContacts, ...withPhone];
    
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: loaded ${batchContacts.length}, with phone: ${withPhone.length}`);
  }

  console.log(`\nTotal contacts with phone: ${validContacts.length}`);

  // Get existing queue item contact IDs
  const existingItems = await db.select({ contactId: campaignQueue.contactId })
    .from(campaignQueue)
    .where(eq(campaignQueue.campaignId, campaign.id));
  
  const existingContactIds = new Set(existingItems.map(i => i.contactId).filter(Boolean));
  console.log(`Existing queue items: ${existingItems.length}`);

  // Filter to contacts not already in queue
  const newContacts = validContacts.filter(c => !existingContactIds.has(c.id));
  console.log(`New contacts to add: ${newContacts.length}`);

  if (newContacts.length === 0) {
    console.log('\nNo new contacts to add. Queue is already populated.');
    process.exit(0);
  }

  // Insert new queue items in batches
  let inserted = 0;
  const INSERT_BATCH = 500;

  for (let i = 0; i < newContacts.length; i += INSERT_BATCH) {
    const batch = newContacts.slice(i, i + INSERT_BATCH);
    
    const values = batch.map(contact => ({
      campaignId: campaign.id,
      contactId: contact.id,
      accountId: contact.accountId,
      phoneNumber: contact.directPhoneE164 || contact.mobilePhoneE164 || contact.directPhone || contact.mobilePhone,
      status: 'queued' as const,
      priority: 0,
      attemptCount: 0,
      targetAgentType: 'any' as const,
    }));

    await db.insert(campaignQueue).values(values);
    inserted += values.length;
    console.log(`Inserted batch ${Math.floor(i / INSERT_BATCH) + 1}: ${values.length} items (total: ${inserted})`);
  }

  console.log(`\n✅ Queue repopulated! Added ${inserted} new items.`);

  // Verify final count
  const [finalCount] = await db.select({ count: count() })
    .from(campaignQueue)
    .where(eq(campaignQueue.campaignId, campaign.id));

  console.log(`Final queue count: ${finalCount.count}`);

  process.exit(0);
}

repopulateQueue().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
