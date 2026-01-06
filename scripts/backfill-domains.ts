import { backfillAccountDomainsForCampaign } from '../server/lib/backfill-account-domains';

async function main() {
  const campaignId = '4087214f-e520-4ec4-94d6-1fde590a82e0';

  console.log('Starting domain backfill...');
  const stats = await backfillAccountDomainsForCampaign(campaignId);

  console.log('\n=== BACKFILL RESULTS ===');
  console.log('Processed:', stats.processed);
  console.log('Updated:', stats.updated);
  console.log('Skipped:', stats.skipped);
  console.log('Errors:', stats.errors);
  console.log('\nFirst 20 updates:');
  stats.details.slice(0, 20).forEach(d => {
    if (d.action === 'updated') {
      console.log(`  ✓ ${d.accountName} → ${d.domain}`);
    }
  });
  
  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
