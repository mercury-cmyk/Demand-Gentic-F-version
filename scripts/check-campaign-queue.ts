/**
 * Diagnostic: Check campaign lists and re-populate queue
 */
import { db } from './server/db';
import { campaigns, campaignQueue, lists, contacts } from './shared/schema';
import { eq, count, desc } from 'drizzle-orm';

async function main() {
  console.log('=== Active Campaigns ===');
  const activeCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, 'active'));
  for (const c of activeCampaigns) {
    console.log(`\n${c.id}`);
    console.log(`  Name: ${c.name}`);
    console.log(`  Type: ${c.type}, DialMode: ${c.dialMode}`);
    console.log(`  AudienceRefs: ${JSON.stringify(c.audienceRefs)}`);
    
    // Count queue items for this campaign
    const queueCount = await db.select({ count: count() }).from(campaignQueue).where(eq(campaignQueue.campaignId, c.id));
    console.log(`  Queue items: ${queueCount[0].count}`);
  }
  
  console.log('\n\n=== All Lists ===');
  const allLists = await db.select().from(lists).orderBy(desc(lists.createdAt));
  for (const l of allLists) {
    console.log(`${l.id} | ${l.name} | Records: ${l.recordIds?.length || 0}`);
  }
  
  console.log('\n\n=== Total Contacts ===');
  const totalContacts = await db.select({ count: count() }).from(contacts);
  console.log(`Total contacts in DB: ${totalContacts[0].count}`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
