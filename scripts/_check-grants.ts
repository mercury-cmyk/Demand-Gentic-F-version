import { db } from '../server/db';
import { clientAccounts, clientPermissionGrants } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const accs = await db.select({
    id: clientAccounts.id,
    name: clientAccounts.name,
    company: clientAccounts.companyName,
  }).from(clientAccounts).limit(20);

  for (const a of accs) {
    const grants = await db.select({
      feature: clientPermissionGrants.feature,
      enabled: clientPermissionGrants.isEnabled,
    }).from(clientPermissionGrants)
      .where(eq(clientPermissionGrants.clientAccountId, a.id));

    const enabledFeatures = grants.filter(g => g.enabled).map(g => g.feature);
    console.log(`${a.id.slice(0, 8)} | ${a.company || a.name} | ${enabledFeatures.length} grants`);
    if (enabledFeatures.length > 0) {
      console.log(`  Features: ${enabledFeatures.join(', ')}`);
    }
    
    // Check specifically for the missing ones
    const hasPipelineView = enabledFeatures.includes('pipeline_view');
    const hasCampaignQueueView = enabledFeatures.includes('campaign_queue_view');
    const hasWorkOrders = enabledFeatures.includes('work_orders');
    if (!hasPipelineView || !hasCampaignQueueView) {
      console.log(`  ⚠ MISSING: ${!hasPipelineView ? 'pipeline_view ' : ''}${!hasCampaignQueueView ? 'campaign_queue_view ' : ''}${!hasWorkOrders ? 'work_orders' : ''}`);
    }
  }
  process.exit(0);
}
main();
