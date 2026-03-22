/**
 * Diagnostic script to investigate orphaned qualified calls
 * Run with: npx tsx check-orphaned-leads.ts
 */

import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkOrphanedLeads() {
  console.log("\n========== ORPHANED QUALIFIED CALLS INVESTIGATION ==========\n");

  // 1. Check detailed state of orphaned qualified calls
  console.log("1. Detailed State of Orphaned Qualified Calls:");
  const orphanedDetails = await db.execute(sql`
    SELECT
      dca.id,
      dca.campaign_id,
      dca.contact_id,
      dca.disposition,
      dca.disposition_processed,
      dca.disposition_processed_at,
      dca.disposition_submitted_at,
      dca.disposition_submitted_by,
      dca.call_duration_seconds,
      dca.call_started_at,
      dca.call_ended_at,
      dca.connected,
      dca.agent_type,
      dca.human_agent_id,
      dca.virtual_agent_id,
      dca.telnyx_call_id,
      dca.queue_item_id,
      dca.created_at
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND dca.created_at > NOW() - INTERVAL '30 days'
    ORDER BY dca.created_at DESC
    LIMIT 30
  `);
  console.table(orphanedDetails.rows);

  // 2. Check if dispositionProcessed is TRUE for orphaned calls
  console.log("\n2. Disposition Processed Status Summary:");
  const processedStatus = await db.execute(sql`
    SELECT
      dca.disposition_processed,
      COUNT(*) as count
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND dca.created_at > NOW() - INTERVAL '30 days'
    GROUP BY dca.disposition_processed
  `);
  console.table(processedStatus.rows);

  // 3. Check agent type distribution of orphaned calls
  console.log("\n3. Agent Type Distribution of Orphaned Qualified Calls:");
  const agentTypes = await db.execute(sql`
    SELECT
      dca.agent_type,
      COUNT(*) as count,
      AVG(dca.call_duration_seconds) as avg_duration,
      SUM(CASE WHEN dca.disposition_processed THEN 1 ELSE 0 END) as processed_count
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND dca.created_at > NOW() - INTERVAL '30 days'
    GROUP BY dca.agent_type
  `);
  console.table(agentTypes.rows);

  // 4. Check if there are leads that DO have call_attempt_id set
  console.log("\n4. Successfully Created Leads (with call_attempt_id):");
  const successfulLeads = await db.execute(sql`
    SELECT
      l.id as lead_id,
      l.call_attempt_id,
      l.created_at as lead_created,
      l.qa_status,
      l.call_duration,
      dca.disposition,
      dca.disposition_processed,
      dca.agent_type
    FROM leads l
    JOIN dialer_call_attempts dca ON l.call_attempt_id = dca.id
    WHERE l.created_at > NOW() - INTERVAL '30 days'
    ORDER BY l.created_at DESC
    LIMIT 10
  `);
  console.table(successfulLeads.rows);

  // 5. Check dialer runs that generated orphaned calls
  console.log("\n5. Dialer Runs with Orphaned Qualified Calls:");
  const dialerRuns = await db.execute(sql`
    SELECT
      dr.id,
      dr.campaign_id,
      dr.agent_type,
      dr.status,
      dr.qualified_leads,
      dr.started_at,
      (
        SELECT COUNT(*)
        FROM dialer_call_attempts dca
        LEFT JOIN leads l ON l.call_attempt_id = dca.id
        WHERE dca.dialer_run_id = dr.id
          AND dca.disposition = 'qualified_lead'
          AND l.id IS NULL
      ) as orphaned_count
    FROM dialer_runs dr
    WHERE dr.qualified_leads > 0
      AND dr.started_at > NOW() - INTERVAL '30 days'
    ORDER BY dr.started_at DESC
    LIMIT 10
  `);
  console.table(dialerRuns.rows);

  // 6. Check disposition_processed_at vs created_at timing
  console.log("\n6. Timing Analysis (was processDisposition ever called?):");
  const timingAnalysis = await db.execute(sql`
    SELECT
      CASE
        WHEN dca.disposition_processed_at IS NOT NULL THEN 'has_processed_at'
        ELSE 'no_processed_at'
      END as status,
      CASE
        WHEN dca.disposition_processed THEN 'processed_true'
        ELSE 'processed_false'
      END as flag_status,
      COUNT(*) as count
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND dca.created_at > NOW() - INTERVAL '30 days'
    GROUP BY
      CASE
        WHEN dca.disposition_processed_at IS NOT NULL THEN 'has_processed_at'
        ELSE 'no_processed_at'
      END,
      CASE
        WHEN dca.disposition_processed THEN 'processed_true'
        ELSE 'processed_false'
      END
  `);
  console.table(timingAnalysis.rows);

  // 7. Check governance_actions_log for these calls
  console.log("\n7. Governance Actions for Orphaned Calls:");
  const govActions = await db.execute(sql`
    SELECT
      gal.action_type,
      gal.result,
      gal.error_message,
      gal.executed_by,
      COUNT(*) as count
    FROM governance_actions_log gal
    WHERE gal.action_type = 'qc_review'
      AND gal.created_at > NOW() - INTERVAL '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM leads l
        WHERE l.campaign_id = gal.campaign_id
          AND l.contact_id = gal.contact_id
      )
    GROUP BY gal.action_type, gal.result, gal.error_message, gal.executed_by
    LIMIT 20
  `);
  console.table(govActions.rows);

  console.log("\n========== END INVESTIGATION ==========\n");
}

checkOrphanedLeads()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error running investigation:", err);
    process.exit(1);
  });