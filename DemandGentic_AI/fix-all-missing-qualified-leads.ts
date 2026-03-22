/**
 * Fix Missing Qualified Leads
 * 
 * Retroactively processes all call attempts that have disposition = 'qualified_lead'
 * but dispositionProcessed = false, which means leads were never created.
 * 
 * This script:
 * 1. Finds all qualified call attempts without dispositionProcessed flag
 * 2. Calls processDisposition() for each to create leads properly
 * 3. Handles all downstream effects (queue updates, suppression, etc.)
 */

import { db } from './server/db';
import { dialerCallAttempts, leads } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { processDisposition } from './server/services/disposition-engine';

async function fixMissingLeads() {
  console.log('========================================');
  console.log('  FIX MISSING QUALIFIED LEADS');
  console.log('========================================\n');

  // Find all qualified call attempts that haven't been processed
  const unprocessedQualified = await db
    .select({
      id: dialerCallAttempts.id,
      contactId: dialerCallAttempts.contactId,
      disposition: dialerCallAttempts.disposition,
      dispositionProcessed: dialerCallAttempts.dispositionProcessed,
      callDurationSeconds: dialerCallAttempts.callDurationSeconds,
      createdAt: dialerCallAttempts.createdAt,
    })
    .from(dialerCallAttempts)
    .where(
      and(
        eq(dialerCallAttempts.disposition, 'qualified_lead'),
        eq(dialerCallAttempts.dispositionProcessed, false)
      )
    )
    .orderBy(dialerCallAttempts.createdAt);

  console.log(`Found ${unprocessedQualified.length} unprocessed qualified call attempts\n`);

  if (unprocessedQualified.length === 0) {
    console.log('✅ No missing leads to fix!');
    process.exit(0);
  }

  let processed = 0;
  let errors = 0;
  let alreadyExists = 0;

  for (const attempt of unprocessedQualified) {
    try {
      // Check if lead already exists (defensive check)
      const [existingLead] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.callAttemptId, attempt.id))
        .limit(1);

      if (existingLead) {
        console.log(`⏭️  ${attempt.id} - Lead already exists, skipping`);
        alreadyExists++;
        continue;
      }

      // CRITICAL FIX: Backfill callStartedAt and duration if missing
      const [fullAttempt] = await db
        .select()
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, attempt.id))
        .limit(1);

      if (!fullAttempt.callStartedAt && fullAttempt.callEndedAt && fullAttempt.createdAt) {
        // Estimate start time: created + 2s connection delay
        const estimatedStartTime = new Date(fullAttempt.createdAt.getTime() + 2000);
        const calculatedDuration = Math.floor((fullAttempt.callEndedAt.getTime() - estimatedStartTime.getTime()) / 1000);
        
        console.log(`Backfilling timing for ${attempt.id}: duration=${calculatedDuration}s`);
        
        await db
          .update(dialerCallAttempts)
          .set({
            callStartedAt: estimatedStartTime,
            callDurationSeconds: calculatedDuration,
            updatedAt: new Date()
          })
          .where(eq(dialerCallAttempts.id, attempt.id));
      }

      // Process disposition through the engine
      console.log(`Processing ${attempt.id}...`);
      const result = await processDisposition(
        attempt.id,
        'qualified_lead',
        'retroactive_fix_script'
      );

      if (result.success) {
        console.log(`  ✅ Lead created: ${result.leadId || 'N/A'}`);
        console.log(`     Actions: ${result.actions.join(', ')}`);
        processed++;
      } else {
        console.error(`  ❌ Failed: ${result.errors.join(', ')}`);
        errors++;
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${attempt.id}:`, error);
      errors++;
    }
  }

  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================');
  console.log(`Total qualified calls: ${unprocessedQualified.length}`);
  console.log(`Successfully processed: ${processed}`);
  console.log(`Already had leads: ${alreadyExists}`);
  console.log(`Errors: ${errors}`);
  console.log('========================================\n');

  process.exit(errors > 0 ? 1 : 0);
}

fixMissingLeads().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});