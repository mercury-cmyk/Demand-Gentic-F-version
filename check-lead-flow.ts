/**
 * Diagnostic script to check lead creation flow
 * Run with: npx tsx check-lead-flow.ts
 */

import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkLeadFlow() {
  console.log("\n========== LEAD CREATION FLOW DIAGNOSTIC ==========\n");

  // 1. Check recent dialer runs
  console.log("1. Recent Dialer Runs (last 7 days):");
  const dialerRuns = await db.execute(sql`
    SELECT id, campaign_id, status, agent_type, virtual_agent_id,
           qualified_leads, contacts_processed, started_at
    FROM dialer_runs
    WHERE started_at > NOW() - INTERVAL '7 days'
    ORDER BY started_at DESC
    LIMIT 10
  `);
  console.table(dialerRuns.rows);

  // 2. Check recent call attempts
  console.log("\n2. Recent Call Attempts (last 7 days):");
  const callAttempts = await db.execute(sql`
    SELECT id, campaign_id, disposition, connected, voicemail_detected,
           call_duration_seconds, created_at,
           CASE WHEN telnyx_call_id IS NOT NULL THEN 'yes' ELSE 'no' END as has_telnyx_id
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.table(callAttempts.rows);

  // 3. Check disposition breakdown
  console.log("\n3. Disposition Breakdown (last 7 days):");
  const dispositions = await db.execute(sql`
    SELECT disposition, COUNT(*) as count,
           SUM(CASE WHEN connected THEN 1 ELSE 0 END) as connected_count,
           AVG(call_duration_seconds) as avg_duration
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY disposition
    ORDER BY count DESC
  `);
  console.table(dispositions.rows);

  // 4. Check call_sessions with qualified dispositions
  console.log("\n4. Call Sessions with Qualified Dispositions:");
  const qualifiedSessions = await db.execute(sql`
    SELECT id, ai_disposition, duration_sec, campaign_id, contact_id, created_at,
           CASE WHEN recording_url IS NOT NULL THEN 'yes' ELSE 'no' END as has_recording
    FROM call_sessions
    WHERE ai_disposition = 'qualified_lead'
      AND created_at > NOW() - INTERVAL '30 days'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.table(qualifiedSessions.rows);

  // 5. Check leads table
  console.log("\n5. Recent Leads:");
  const leads = await db.execute(sql`
    SELECT id, campaign_id, contact_name, qa_status, call_duration,
           created_at, call_attempt_id,
           CASE WHEN recording_url IS NOT NULL THEN 'yes' ELSE 'no' END as has_recording
    FROM leads
    WHERE created_at > NOW() - INTERVAL '30 days'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.table(leads.rows);

  // 6. Check for orphaned qualified calls (calls marked qualified but no lead)
  console.log("\n6. Orphaned Qualified Calls (qualified but no lead created):");
  const orphanedQualified = await db.execute(sql`
    SELECT dca.id, dca.campaign_id, dca.disposition, dca.call_duration_seconds,
           dca.created_at, dca.telnyx_call_id
    FROM dialer_call_attempts dca
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.disposition = 'qualified_lead'
      AND l.id IS NULL
      AND dca.created_at > NOW() - INTERVAL '30 days'
    ORDER BY dca.created_at DESC
    LIMIT 20
  `);
  console.table(orphanedQualified.rows);

  // 7. Summary stats
  console.log("\n7. Summary Stats (last 7 days):");
  const summary = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM dialer_runs WHERE started_at > NOW() - INTERVAL '7 days') as total_runs,
      (SELECT COUNT(*) FROM dialer_call_attempts WHERE created_at > NOW() - INTERVAL '7 days') as total_attempts,
      (SELECT COUNT(*) FROM dialer_call_attempts WHERE disposition = 'qualified_lead' AND created_at > NOW() - INTERVAL '7 days') as qualified_attempts,
      (SELECT COUNT(*) FROM call_sessions WHERE created_at > NOW() - INTERVAL '7 days') as total_sessions,
      (SELECT COUNT(*) FROM leads WHERE created_at > NOW() - INTERVAL '7 days') as total_leads
  `);
  console.table(summary.rows);

  console.log("\n========== END DIAGNOSTIC ==========\n");
}

checkLeadFlow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error running diagnostic:", err);
    process.exit(1);
  });
