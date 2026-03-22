/**
 * Assign UKEF Call Flow to Content Syndication campaign type
 */

import { db } from './server/db';
import { customCallFlowMappings, customCallFlows } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function assignUKEFToContentSyndication() {
  console.log('Checking UKEF flow and assigning to content_syndication...');

  // First verify the UKEF flow exists
  const flows = await db.select().from(customCallFlows).where(eq(customCallFlows.id, 'ukef-export-finance-flow'));
  console.log('UKEF Flow found:', flows.length > 0 ? flows[0].name : 'NOT FOUND');

  if (flows.length === 0) {
    console.error('❌ UKEF flow not found! Run seed-ukef-call-flow.ts first.');
    return;
  }

  // Check existing mappings
  const existingMappings = await db.select().from(customCallFlowMappings);
  console.log('Existing mappings:', JSON.stringify(existingMappings, null, 2));

  // Insert/update the mapping for content_syndication
  await db.insert(customCallFlowMappings)
    .values({
      campaignType: 'content_syndication',
      callFlowId: 'ukef-export-finance-flow',
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: customCallFlowMappings.campaignType,
      set: {
        callFlowId: 'ukef-export-finance-flow',
        updatedAt: new Date()
      }
    });

  console.log('✅ Assigned UKEF Export Finance flow to content_syndication');

  // Verify the mapping
  const verifyMapping = await db.select().from(customCallFlowMappings).where(eq(customCallFlowMappings.campaignType, 'content_syndication'));
  console.log('Verified mapping:', JSON.stringify(verifyMapping, null, 2));
}

assignUKEFToContentSyndication()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });