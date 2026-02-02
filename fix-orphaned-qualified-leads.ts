/**
 * Fix script for orphaned qualified leads
 *
 * Problem: 65 call attempts have disposition='qualified_lead' but no lead was created.
 * Root Cause: processDisposition() was never called for these calls.
 *
 * This script:
 * 1. Finds all orphaned qualified call attempts (disposition = 'qualified_lead', no lead, disposition_processed = false)
 * 2. Calls processDisposition() for each to create the leads
 *
 * Run with: npx tsx fix-orphaned-qualified-leads.ts
 */

import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { processDisposition } from "./server/services/disposition-engine";

async function fixOrphanedQualifiedLeads() {
  console.log("\n========== FIXING ORPHANED QUALIFIED LEADS ==========\n");

  // Find all orphaned qualified call attempts
  const orphanedCalls = await db.execute(sql`
    SELECT
      dca.id,
      dca.campaign_id,
      dca.contact_id,
      dca.disposition,
      dca.disposition_processed,
      dca.human_agent_id,
      dca.created_at
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND dca.disposition_processed = false
      AND dca.created_at > NOW() - INTERVAL '30 days'
    ORDER BY dca.created_at ASC
  `);

  console.log(`Found ${orphanedCalls.rows.length} orphaned qualified call attempts to fix.\n`);

  if (orphanedCalls.rows.length === 0) {
    console.log("No orphaned calls to fix. Exiting.");
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const call of orphanedCalls.rows) {
    const callAttemptId = call.id as string;
    const humanAgentId = call.human_agent_id as string | null;

    try {
      console.log(`Processing call attempt ${callAttemptId}...`);

      // Call processDisposition to create the lead and handle all the logic
      const result = await processDisposition(
        callAttemptId,
        'qualified_lead',
        humanAgentId || 'fix_orphaned_leads_script'
      );

      if (result.success && result.leadId) {
        console.log(`  ✅ SUCCESS: Lead created: ${result.leadId}`);
        successCount++;
      } else if (result.errors.length > 0) {
        console.log(`  ⚠️ PARTIAL: ${result.errors.join(', ')}`);
        if (result.leadId) {
          successCount++;
        } else {
          errorCount++;
          errors.push({ id: callAttemptId, error: result.errors.join(', ') });
        }
      } else {
        console.log(`  ❓ UNKNOWN: No lead created and no errors`);
        errorCount++;
        errors.push({ id: callAttemptId, error: 'No lead created and no errors reported' });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.log(`  ❌ ERROR: ${errorMsg}`);
      errorCount++;
      errors.push({ id: callAttemptId, error: errorMsg });
    }
  }

  console.log("\n========== SUMMARY ==========\n");
  console.log(`Total processed: ${orphanedCalls.rows.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log("\nErrors detail:");
    for (const e of errors) {
      console.log(`  - ${e.id}: ${e.error}`);
    }
  }

  // Verify the fix by counting remaining orphaned calls
  const remainingOrphaned = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND dca.created_at > NOW() - INTERVAL '30 days'
  `);

  console.log(`\nRemaining orphaned qualified calls: ${remainingOrphaned.rows[0]?.count || 0}`);
  console.log("\n========== END ==========\n");
}

fixOrphanedQualifiedLeads()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
