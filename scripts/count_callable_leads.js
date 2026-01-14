// Count callable leads in the current active campaign
import { getCampaigns, getCampaignQueue } from '../server/storage.js';

(async () => {
  // Get the most recent campaign (assumed active)
  const campaigns = await getCampaigns();
  if (!campaigns.length) {
    console.log('No campaigns found.');
    return;
  }
  const activeCampaign = campaigns[0];
  const campaignId = activeCampaign.id;
  console.log('Active Campaign:', activeCampaign.name, campaignId);

  // Get callable leads (status: queued)
  const queue = await getCampaignQueue(campaignId, 'queued');
  console.log('Callable leads in active campaign:', queue.length);
})();
