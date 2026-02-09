
import { db } from './server/db';
import { campaigns, campaignContacts, campaignQueue } from './shared/schema';
import { eq, count } from 'drizzle-orm'; 

async function check() {
  const names = ['Campaign - ORD-202602-15BWXD', 'Harver Appoitnment Gen'];
  
  for (const name of names) {
    const camp = await db.select().from(campaigns).where(eq(campaigns.name, name)).limit(1);
    if (!camp.length) {
      console.log(\Campaign not found: \\);
      continue;
    }
    const campId = camp[0].id;
    console.log(\\nCampaign: \ (ID: \)\);
    
    // Count total contacts assigned
    const contactCount = await db.select({ count: count() })
      .from(campaignContacts)
      .where(eq(campaignContacts.campaignId, campId));
      
    // Count queue items
    const queueCount = await db.select({ count: count() })
        .from(campaignQueue)
        .where(eq(campaignQueue.campaignId, campId));

    console.log(\Total Contacts Linked: \\);
    console.log(\Items in Call Queue: \\);
  }
}

check().catch(console.error).then(() => process.exit(0));

