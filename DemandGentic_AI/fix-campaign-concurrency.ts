import { db } from './server/db';
import { campaigns } from '@shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';

async function fixConcurrency() {
  const ids = [
    'ae5b353d-64a9-44d8-92cf-69d4726ca121',
    '70434f6e-3ab6-49e4-acf7-350b81f60ea2'
  ];

  console.log('Checking campaigns...');
  const found = await db.select().from(campaigns).where(inArray(campaigns.id, ids));

  for (const camp of found) {
    const settings: any = camp.aiAgentSettings || {};
    console.log(`Campaign ${camp.id} current maxConcurrentCalls:`, settings.maxConcurrentCalls);
    
    settings.maxConcurrentCalls = 2; // Lower to 2 to avoid Telnyx D2 limits
    
    await db.update(campaigns)
      .set({ aiAgentSettings: settings })
      .where(eq(campaigns.id, camp.id));
      
    console.log(`Updated Campaign ${camp.id} maxConcurrentCalls to 2`);
  }
  
  // Also checking for any other active campaigns
  const allActive = await db.select().from(campaigns).where(eq(campaigns.status, 'active'));
  for (const camp of allActive) {
      if (ids.includes(camp.id)) continue;
       const settings: any = camp.aiAgentSettings || {};
       if (settings.maxConcurrentCalls && settings.maxConcurrentCalls > 2) {
           console.log(`Found other active campaign ${camp.id} with high concurrency: ${settings.maxConcurrentCalls}. Lowering...`);
           settings.maxConcurrentCalls = 2;
           await db.update(campaigns)
             .set({ aiAgentSettings: settings })
             .where(eq(campaigns.id, camp.id));
       }
  }

  process.exit(0);
}

fixConcurrency().catch(console.error);