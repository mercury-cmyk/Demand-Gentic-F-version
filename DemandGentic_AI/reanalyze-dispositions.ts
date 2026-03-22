/**
 * Reanalyze AI call dispositions using campaign success indicators
 * 
 * This script fixes the issue where AI calls are incorrectly marked as
 * "no_answer" when they actually had real conversations with positive signals.
 */

import { reanalyzeDispositions, loadCampaignQualificationContext } from './server/services/smart-disposition-analyzer';

const PROTON_CAMPAIGN_ID = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';

async function main() {
  console.log('='.repeat(80));
  console.log('🔄 REANALYZING AI CALL DISPOSITIONS');
  console.log('='.repeat(80));

  // First, show the campaign qualification context
  console.log('\n📋 Loading campaign qualification context...\n');
  const context = await loadCampaignQualificationContext(PROTON_CAMPAIGN_ID);
  
  if (!context) {
    console.error('❌ Failed to load campaign context');
    process.exit(1);
  }

  console.log(`Campaign: ${context.campaignName}`);
  console.log(`Primary Success: ${context.successIndicators.primarySuccess || 'Not set'}`);
  console.log(`Qualified Lead Definition: ${context.successIndicators.qualifiedLeadDefinition || 'Not set'}`);
  console.log(`Positive Keywords: ${context.positiveKeywords.slice(0, 10).join(', ')}...`);
  console.log(`Negative Keywords: ${context.negativeKeywords.slice(0, 10).join(', ')}...`);

  // DRY RUN FIRST - show what would be updated
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 DRY RUN - Analyzing what would change...');
  console.log('='.repeat(80));

  const dryRunResults = await reanalyzeDispositions(PROTON_CAMPAIGN_ID, {
    dryRun: true,
    limit: 500,
    dispositionsToCheck: ['no_answer', 'voicemail', null],
  });

  console.log(`\n📈 DRY RUN RESULTS:`);
  console.log(`   Sessions analyzed: ${dryRunResults.analyzed}`);
  console.log(`   Would update: ${dryRunResults.shouldUpdate}`);
  console.log(`   Errors: ${dryRunResults.errors}`);

  if (dryRunResults.shouldUpdate > 0) {
    console.log('\n📝 PROPOSED CHANGES:');
    console.log('-'.repeat(80));
    
    // Group by suggested disposition
    const byDisposition: Record = {};
    for (const detail of dryRunResults.details.filter(d => d.suggestedDisposition !== d.currentDisposition)) {
      const key = `${detail.currentDisposition} → ${detail.suggestedDisposition}`;
      if (!byDisposition[key]) byDisposition[key] = [];
      byDisposition[key].push(detail);
    }

    for (const [change, details] of Object.entries(byDisposition)) {
      console.log(`\n  ${change}: ${details.length} sessions`);
      // Show first 3 examples
      for (const d of details.slice(0, 3)) {
        console.log(`    - ${d.sessionId}: ${d.reasoning}`);
      }
      if (details.length > 3) {
        console.log(`    ... and ${details.length - 3} more`);
      }
    }

    // Ask user to confirm before applying
    console.log('\n\n' + '='.repeat(80));
    console.log('⚠️  To apply these changes, run with --apply flag');
    console.log('='.repeat(80));

    // Check if --apply flag is passed
    if (process.argv.includes('--apply')) {
      console.log('\n🔧 APPLYING CHANGES...\n');
      
      const applyResults = await reanalyzeDispositions(PROTON_CAMPAIGN_ID, {
        dryRun: false,
        limit: 500,
        dispositionsToCheck: ['no_answer', 'voicemail', null],
      });

      console.log(`\n✅ CHANGES APPLIED:`);
      console.log(`   Sessions updated: ${applyResults.updated}`);
      console.log(`   Errors: ${applyResults.errors}`);
    }
  } else {
    console.log('\n✅ No disposition changes needed - all dispositions are accurate.');
  }

  process.exit(0);
}

main().catch(console.error);