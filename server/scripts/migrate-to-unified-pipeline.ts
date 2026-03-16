/**
 * Migration Script: Old Journey Pipeline → Unified Account-Based Pipeline
 *
 * Migrates data from clientJourneyPipelines/clientJourneyLeads/clientJourneyActions
 * into unifiedPipelines/unifiedPipelineAccounts/unifiedPipelineContacts/unifiedPipelineActions
 *
 * Run: npx tsx server/scripts/migrate-to-unified-pipeline.ts
 */

import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const STAGE_MAP: Record<string, string> = {
  new_lead: 'target',
  callback_scheduled: 'outreach',
  contacted: 'outreach',
  engaged: 'engaged',
  appointment_set: 'appointment_set',
  closed: 'closed_won',
};

const STAGE_ORDER = ['target', 'outreach', 'engaged', 'qualifying', 'qualified', 'appointment_set', 'closed_won', 'closed_lost'];

async function migrate() {
  console.log('=== STARTING PIPELINE DATA MIGRATION ===\n');

  // 1. Migrate pipelines
  const oldPipelines = await pool.query('SELECT * FROM client_journey_pipelines ORDER BY created_at');
  console.log(`Old pipelines: ${oldPipelines.rows.length}`);

  const pipelineIdMap: Record<string, string> = {};

  for (const op of oldPipelines.rows) {
    const orgLink = await pool.query(
      'SELECT campaign_organization_id FROM client_organization_links WHERE client_account_id = $1 LIMIT 1',
      [op.client_account_id]
    );
    const orgId = orgLink.rows[0]?.campaign_organization_id || null;

    const result = await pool.query(
      `INSERT INTO unified_pipelines (organization_id, client_account_id, name, description, status, objective, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        orgId,
        op.client_account_id,
        op.name,
        op.description || 'Migrated from legacy pipeline',
        op.status === 'active' ? 'active' : 'paused',
        'Migrated pipeline — full-funnel account-based tracking',
        op.created_at,
        op.updated_at,
      ]
    );

    pipelineIdMap[op.id] = result.rows[0].id;
    console.log(`  Pipeline: "${op.name}" → ${result.rows[0].id}`);
  }

  // 2. Migrate leads → accounts + contacts
  const oldLeads = await pool.query(`
    SELECT jl.*, c.account_id
    FROM client_journey_leads jl
    LEFT JOIN contacts c ON jl.contact_id = c.id
    ORDER BY jl.created_at
  `);
  console.log(`\nOld leads: ${oldLeads.rows.length}`);

  const accountMap: Record<string, string> = {};
  const leadToAccountMap: Record<string, string> = {};
  let accountsCreated = 0;
  let contactsCreated = 0;

  for (const lead of oldLeads.rows) {
    const newPipelineId = pipelineIdMap[lead.pipeline_id];
    if (!newPipelineId || !lead.account_id) continue;

    const key = `${newPipelineId}:${lead.account_id}`;
    let newStage = STAGE_MAP[lead.current_stage_id] || 'target';
    if (lead.status === 'lost') newStage = 'closed_lost';

    if (!accountMap[key]) {
      const result = await pool.query(
        `INSERT INTO unified_pipeline_accounts
         (pipeline_id, account_id, funnel_stage, stage_changed_at, priority_score, engagement_score, last_activity_at, total_touchpoints, next_action_type, next_action_at, enrollment_source, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (pipeline_id, account_id) DO UPDATE SET funnel_stage = EXCLUDED.funnel_stage
         RETURNING id`,
        [
          newPipelineId,
          lead.account_id,
          newStage,
          lead.current_stage_entered_at,
          (lead.priority || 3) * 20,
          (lead.total_actions || 0) > 5 ? 80 : (lead.total_actions || 0) > 2 ? 50 : 20,
          lead.last_activity_at,
          lead.total_actions || 0,
          lead.next_action_type,
          lead.next_action_at,
          'migration',
          JSON.stringify({ migratedFrom: 'clientJourneyLeads', originalLeadId: lead.id }),
          lead.created_at,
          lead.updated_at,
        ]
      );
      accountMap[key] = result.rows[0].id;
      accountsCreated++;
    } else {
      // Advance stage if this contact is more advanced
      const existing = await pool.query('SELECT funnel_stage FROM unified_pipeline_accounts WHERE id = $1', [accountMap[key]]);
      const existingIdx = STAGE_ORDER.indexOf(existing.rows[0]?.funnel_stage || 'target');
      const newIdx = STAGE_ORDER.indexOf(newStage);
      if (newIdx > existingIdx && newStage !== 'closed_lost') {
        await pool.query('UPDATE unified_pipeline_accounts SET funnel_stage = $1 WHERE id = $2', [newStage, accountMap[key]]);
      }
      await pool.query(
        'UPDATE unified_pipeline_accounts SET total_touchpoints = total_touchpoints + $1 WHERE id = $2',
        [lead.total_actions || 0, accountMap[key]]
      );
    }

    leadToAccountMap[lead.id] = accountMap[key];

    // Create contact record
    if (lead.contact_id) {
      const engLevel = newStage === 'engaged' || newStage === 'appointment_set' ? 'engaged' : newStage === 'outreach' ? 'aware' : 'none';
      await pool.query(
        `INSERT INTO unified_pipeline_contacts
         (pipeline_account_id, contact_id, engagement_level, source_campaign_id, source_call_session_id, source_disposition, source_call_summary, source_ai_analysis, last_contacted_at, total_attempts, last_disposition, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (pipeline_account_id, contact_id) DO NOTHING`,
        [
          accountMap[key],
          lead.contact_id,
          engLevel,
          lead.source_campaign_id,
          lead.source_call_session_id,
          lead.source_disposition,
          lead.source_call_summary,
          lead.source_ai_analysis ? JSON.stringify(lead.source_ai_analysis) : null,
          lead.last_activity_at,
          lead.total_actions || 0,
          lead.source_disposition,
          lead.created_at,
          lead.updated_at,
        ]
      );
      contactsCreated++;
    }
  }
  console.log(`  Accounts created: ${accountsCreated}`);
  console.log(`  Contacts created: ${contactsCreated}`);

  // 3. Migrate actions
  const oldActions = await pool.query('SELECT * FROM client_journey_actions ORDER BY created_at');
  console.log(`\nOld actions: ${oldActions.rows.length}`);
  let actionsMigrated = 0;

  for (const action of oldActions.rows) {
    const pipelineAccountId = leadToAccountMap[action.journey_lead_id];
    const newPipelineId = pipelineIdMap[action.pipeline_id];
    if (!pipelineAccountId || !newPipelineId) continue;

    await pool.query(
      `INSERT INTO unified_pipeline_actions
       (pipeline_account_id, pipeline_id, action_type, status, scheduled_at, executed_at, completed_at, title, description, ai_generated_context, previous_activity_summary, outcome, outcome_details, result_disposition, execution_method, linked_entity_type, linked_entity_id, created_by, completed_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        pipelineAccountId,
        newPipelineId,
        action.action_type,
        action.status,
        action.scheduled_at,
        action.executed_at,
        action.completed_at,
        action.title,
        action.description,
        action.ai_generated_context ? JSON.stringify(action.ai_generated_context) : null,
        action.previous_activity_summary,
        action.outcome,
        action.outcome_details ? JSON.stringify(action.outcome_details) : null,
        action.result_disposition,
        action.execution_method,
        action.linked_entity_type,
        action.linked_entity_id,
        action.created_by,
        action.completed_by,
        action.created_at,
        action.updated_at,
      ]
    );
    actionsMigrated++;
  }
  console.log(`  Actions migrated: ${actionsMigrated}`);

  // 4. Update denormalized counts
  for (const [, newId] of Object.entries(pipelineIdMap)) {
    const cnt = await pool.query('SELECT COUNT(*) as cnt FROM unified_pipeline_accounts WHERE pipeline_id = $1', [newId]);
    await pool.query('UPDATE unified_pipelines SET total_accounts = $1, updated_at = NOW() WHERE id = $2', [cnt.rows[0].cnt, newId]);
  }

  // Verification
  const up = await pool.query('SELECT COUNT(*) as cnt FROM unified_pipelines');
  const upa = await pool.query('SELECT COUNT(*) as cnt FROM unified_pipeline_accounts');
  const upc = await pool.query('SELECT COUNT(*) as cnt FROM unified_pipeline_contacts');
  const upact = await pool.query('SELECT COUNT(*) as cnt FROM unified_pipeline_actions');
  console.log('\n=== MIGRATION COMPLETE ===');
  console.log(`Unified pipelines: ${up.rows[0].cnt}`);
  console.log(`Unified pipeline accounts: ${upa.rows[0].cnt}`);
  console.log(`Unified pipeline contacts: ${upc.rows[0].cnt}`);
  console.log(`Unified pipeline actions: ${upact.rows[0].cnt}`);

  pool.end();
}

migrate().catch((e) => {
  console.error('MIGRATION ERROR:', e.message);
  pool.end();
  process.exit(1);
});
