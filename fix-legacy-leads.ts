import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';

const args = process.argv.slice(2);
const command = args[0];
const apply = args.includes('--apply');
const dryRun = !apply;

const VM_NOTES_FILTER = "(LOWER(notes) LIKE '%voicemail%' OR LOWER(notes) LIKE '%no answer%' OR LOWER(notes) LIKE '%left message%' OR LOWER(notes) LIKE '%vm%')";
const VM_TRANSCRIPT_FILTER = "(transcript IS NOT NULL AND (LOWER(transcript) LIKE '%voicemail%' OR LOWER(transcript) LIKE '%leave a message%' OR LOWER(transcript) LIKE '%after the tone%' OR LOWER(transcript) LIKE '%beep%' OR LOWER(transcript) LIKE '%not available%please leave%'))";
const VM_FILTER = `(${VM_NOTES_FILTER} OR ${VM_TRANSCRIPT_FILTER})`;

function requireCommand() {
  if (!command) {
    console.error('Usage: npx tsx fix-legacy-leads.ts <qa-reject-voicemail|soft-delete-voicemail|backfill-call-attempts> [--apply]');
    process.exit(1);
  }
}

async function qaRejectVoicemailLeads() {
  console.log(`\n[qa-reject-voicemail] ${dryRun ? 'DRY RUN' : 'APPLY'}`);

  const count = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM leads
    WHERE call_attempt_id IS NULL
      AND deleted_at IS NULL
      AND ${sql.raw(VM_FILTER)}
  `);
  const total = count.rows?.[0]?.count ?? 0;
  console.log('Voicemail-flagged legacy leads:', total);

  if (dryRun || total === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE leads
      SET
        qa_status = 'rejected',
        rejected_reason = COALESCE(rejected_reason, 'Auto-rejected: legacy voicemail pattern detected'),
        rejected_at = COALESCE(rejected_at, NOW()),
        updated_at = NOW(),
        notes = CASE
          WHEN notes IS NULL THEN '[Auto] Legacy voicemail pattern detected; QA-rejected.'
          ELSE notes || '\n[Auto] Legacy voicemail pattern detected; QA-rejected.'
        END
      WHERE call_attempt_id IS NULL
        AND deleted_at IS NULL
        AND ${sql.raw(VM_FILTER)}
    `);
  });

  console.log('QA-reject applied.');
}

async function softDeleteVoicemailLeads() {
  console.log(`\n[soft-delete-voicemail] ${dryRun ? 'DRY RUN' : 'APPLY'}`);

  const count = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM leads
    WHERE call_attempt_id IS NULL
      AND deleted_at IS NULL
      AND ${sql.raw(VM_FILTER)}
  `);
  const total = count.rows?.[0]?.count ?? 0;
  console.log('Voicemail-flagged legacy leads:', total);

  if (dryRun || total === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE leads
      SET
        deleted_at = NOW(),
        updated_at = NOW(),
        notes = CASE
          WHEN notes IS NULL THEN '[Auto] Legacy voicemail pattern detected; soft-deleted.'
          ELSE notes || '\n[Auto] Legacy voicemail pattern detected; soft-deleted.'
        END
      WHERE call_attempt_id IS NULL
        AND deleted_at IS NULL
        AND ${sql.raw(VM_FILTER)}
    `);
  });

  console.log('Soft-delete applied.');
}

async function backfillCallAttempts() {
  console.log(`\n[backfill-call-attempts] ${dryRun ? 'DRY RUN' : 'APPLY'}`);

  const matchCount = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM leads l
    WHERE l.call_attempt_id IS NULL
      AND l.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM calls c
        WHERE c.contact_id = l.contact_id
          AND c.campaign_id = l.campaign_id
      )
  `);
  const total = matchCount.rows?.[0]?.count ?? 0;
  console.log('Leads with matching legacy calls:', total);

  if (dryRun || total === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      WITH target AS (
        SELECT
          l.id AS lead_id,
          c.id AS call_id,
          c.campaign_id,
          c.contact_id,
          c.agent_id,
          c.dialed_number,
          c.telnyx_call_id,
          c.recording_url,
          c.duration,
          c.disposition,
          c.created_at,
          ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY c.created_at DESC) AS rn
        FROM leads l
        JOIN calls c
          ON c.contact_id = l.contact_id
         AND c.campaign_id = l.campaign_id
        WHERE l.call_attempt_id IS NULL
          AND l.deleted_at IS NULL
      ),
      chosen AS (
        SELECT * FROM target WHERE rn = 1
      ),
      runs AS (
        INSERT INTO dialer_runs (
          campaign_id,
          run_type,
          status,
          agent_type,
          human_agent_id,
          started_at,
          ended_at,
          total_contacts,
          contacts_processed,
          contacts_connected,
          qualified_leads,
          dnc_requests,
          voicemails,
          no_answers,
          invalid_data,
          not_interested,
          max_concurrent_calls,
          call_timeout_seconds,
          created_at,
          updated_at
        )
        SELECT
          c.campaign_id,
          'manual_dial',
          'completed',
          'human',
          c.agent_id,
          MIN(c.created_at) AS started_at,
          MAX(c.created_at) AS ended_at,
          0, 0, 0, 0, 0, 0, 0, 0, 0,
          1, 30,
          NOW(), NOW()
        FROM chosen c
        GROUP BY c.campaign_id, c.agent_id
        RETURNING id, campaign_id, human_agent_id
      ),
      attempts AS (
        INSERT INTO dialer_call_attempts (
          dialer_run_id,
          campaign_id,
          contact_id,
          agent_type,
          human_agent_id,
          phone_dialed,
          attempt_number,
          call_started_at,
          call_ended_at,
          call_duration_seconds,
          connected,
          voicemail_detected,
          disposition,
          disposition_submitted_at,
          disposition_processed,
          notes,
          recording_url,
          telnyx_call_id,
          created_at,
          updated_at
        )
        SELECT
          r.id AS dialer_run_id,
          c.campaign_id,
          c.contact_id,
          'human',
          c.agent_id,
          COALESCE(c.dialed_number, l.dialed_number, 'unknown') AS phone_dialed,
          1,
          c.created_at AS call_started_at,
          CASE
            WHEN c.duration IS NOT NULL THEN c.created_at + (c.duration || ' seconds')::interval
            ELSE NULL
          END AS call_ended_at,
          c.duration AS call_duration_seconds,
          CASE
            WHEN c.disposition IN ('no-answer', 'busy', 'voicemail') THEN FALSE
            ELSE TRUE
          END AS connected,
          CASE WHEN c.disposition = 'voicemail' THEN TRUE ELSE FALSE END AS voicemail_detected,
          (CASE
            WHEN c.disposition = 'qualified' THEN 'qualified_lead'
            WHEN c.disposition = 'not_interested' THEN 'not_interested'
            WHEN c.disposition = 'dnc-request' THEN 'do_not_call'
            WHEN c.disposition = 'voicemail' THEN 'voicemail'
            WHEN c.disposition = 'no-answer' THEN 'no_answer'
            WHEN c.disposition = 'invalid_data' THEN 'invalid_data'
            WHEN c.disposition = 'wrong_number' THEN 'invalid_data'
            WHEN c.disposition = 'busy' THEN 'no_answer'
            ELSE NULL
          END)::canonical_disposition AS disposition,
          NOW() AS disposition_submitted_at,
          FALSE AS disposition_processed,
          '[Auto] Legacy call backfill from calls table.' AS notes,
          c.recording_url,
          c.telnyx_call_id,
          NOW(), NOW()
        FROM chosen c
        JOIN leads l ON l.id = c.lead_id
        JOIN runs r ON r.campaign_id = c.campaign_id AND ((r.human_agent_id IS NULL AND c.agent_id IS NULL) OR r.human_agent_id = c.agent_id)
        RETURNING id, contact_id, campaign_id
      )
      UPDATE leads l
      SET
        call_attempt_id = a.id,
        updated_at = NOW(),
        notes = CASE
          WHEN l.notes IS NULL THEN '[Auto] Linked to backfilled dialer_call_attempt.'
          ELSE l.notes || '\n[Auto] Linked to backfilled dialer_call_attempt.'
        END
      FROM attempts a
      JOIN chosen c ON c.contact_id = a.contact_id AND c.campaign_id = a.campaign_id
      WHERE l.id = c.lead_id;
    `);
  });

  console.log('Backfill applied.');
}

async function main() {
  requireCommand();
  switch (command) {
    case 'qa-reject-voicemail':
      await qaRejectVoicemailLeads();
      break;
    case 'soft-delete-voicemail':
      await softDeleteVoicemailLeads();
      break;
    case 'backfill-call-attempts':
      await backfillCallAttempts();
      break;
    default:
      console.error('Unknown command:', command);
      process.exit(1);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end().catch(() => undefined);
  process.exit(1);
});
