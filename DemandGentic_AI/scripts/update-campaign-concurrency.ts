import { db } from '../server/db';
import { campaigns } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function updateCampaign() {
  const campaignId = 'ad8c5155-fcc3-4b4c-bdc6-55b4b58cbb37';

  // Get current campaign
  const [campaign] = await db.select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));

  if (!campaign) {
    console.error('Campaign not found');
    process.exit(1);
  }

  console.log('Current Phone:', campaign.phoneNumber);
  console.log('Current AI Settings:', campaign.aiAgentSettings);

  // Update phone number and concurrency
  const updatedSettings = {
    ...(campaign.aiAgentSettings as object || {}),
    maxConcurrentCalls: 50,
  };

  await db.update(campaigns)
    .set({
      phoneNumber: '+12094571966',
      aiAgentSettings: updatedSettings
    })
    .where(eq(campaigns.id, campaignId));

  console.log('\nUpdated:');
  console.log('  Phone: +12094571966');
  console.log('  AI Settings:', updatedSettings);
  console.log('\nCampaign ready for 50 concurrent calls!');

  process.exit(0);
}

updateCampaign().catch(e => { console.error(e); process.exit(1); });