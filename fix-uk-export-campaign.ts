import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { like } from 'drizzle-orm';

async function fixCampaign() {
  try {
    // Find the campaign by exact name
    const campaign = await db.query.campaigns.findFirst({
      where: (campaigns: any) => like(campaigns.name, '%UK Export Finance%'),
    });

    if (!campaign) {
      console.log('❌ Campaign not found');
      return;
    }

    console.log(`Found Campaign: ${campaign.name}`);
    console.log(`  ID: ${campaign.id}`);
    console.log(`  Type: ${campaign.type}`);
    console.log(`  Dial Mode: ${campaign.dialMode}`);
    console.log(`  Current Status: ${campaign.status}`);
    console.log(`  Updated At: ${campaign.updatedAt}`);

    if (campaign.status === 'paused') {
      console.log(`\n⚠️ Campaign is PAUSED. Resuming...`);
      
      await db.execute(sql`
        UPDATE campaigns 
        SET status = 'active', updated_at = NOW()
        WHERE id = ${campaign.id}
      `);
      
      console.log(`✅ Campaign ${campaign.id} has been RESUMED`);
    } else {
      console.log(`✅ Campaign status is already: ${campaign.status}`);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixCampaign().then(() => {
  process.exit(0);
});
