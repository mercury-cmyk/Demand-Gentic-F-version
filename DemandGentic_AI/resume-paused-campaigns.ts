import { db } from './server/db';
import { campaigns } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function resumePausedCampaigns() {
  try {
    // Find all paused AI agent campaigns
    const pausedCampaigns = await db.query.campaigns.findMany({
      where: (campaigns: any) => campaigns.status === 'paused' && campaigns.dialMode === 'ai_agent',
    });

    if (pausedCampaigns.length === 0) {
      console.log('✅ No paused AI agent campaigns found');
      return;
    }

    console.log(`Found ${pausedCampaigns.length} paused AI agent campaign(s):`);
    pausedCampaigns.forEach((c: any) => {
      console.log(`  - ${c.id}: ${c.name}`);
    });

    // Resume each paused campaign
    for (const campaign of pausedCampaigns) {
      try {
        await db.update(campaigns).set({ status: 'active' }).where(eq(campaigns.id, campaign.id));
        console.log(`✅ Resumed: ${campaign.id}`);
      } catch (error) {
        console.error(`❌ Failed to resume ${campaign.id}:`, error);
      }
    }

    console.log(`\n✅ Successfully resumed ${pausedCampaigns.length} campaign(s)`);
  } catch (error) {
    console.error('Error resuming campaigns:', error);
    process.exit(1);
  }
}

resumePausedCampaigns().then(() => {
  process.exit(0);
});