/**
 * Cleanup Script: Remove ALL false leads created today (2026-02-23)
 * 
 * Root cause analysis:
 * 1. processCallbackRequested creates leads for ALL callback_requested calls 
 *    with NO duration guard — even 3s "not in service" calls
 * 2. The AI misclassifies many calls as callback_requested when they should be
 *    invalid_data or no_answer (disconnected numbers, IVR, voicemail)
 * 3. bulk_disposition_reanalyzer creates qualified_lead for very short calls
 * 4. When reanalyzers later correct the disposition, they DON'T clean up the lead
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

const DRY_RUN = process.argv.includes('--dry-run');
const MIN_REAL_DURATION = 45;

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  FALSE LEAD CLEANUP — ${DRY_RUN ? '🔍 DRY RUN' : '🔧 LIVE MODE'}`);
  console.log(`  Date: 2026-02-23`);
  console.log(`  Min duration for real leads: ${MIN_REAL_DURATION}s`);
  console.log(`${'='.repeat(70)}\n`);

  // STEP 1: Identify all false leads from today
  const falseLeads = await pool.query(`
    SELECT 
      l.id as lead_id,
      l.contact_name,
      l.contact_email,
      l.qa_status,
      l.call_duration,
      l.notes,
      COALESCE(cs.duration_sec, dca.call_duration_seconds, l.call_duration, 0) as effective_duration,
      cs.id as session_id,
      cs.ai_disposition,
      dca.id as attempt_id,
      dca.disposition as attempt_disposition
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE l.created_at >= '2026-02-23'::date
      AND l.qa_status NOT IN ('rejected')
      AND COALESCE(cs.duration_sec, dca.call_duration_seconds, l.call_duration, 0) < $1
    ORDER BY COALESCE(cs.duration_sec, dca.call_duration_seconds, l.call_duration, 0) ASC
  `, [MIN_REAL_DURATION]);

  console.log(`📋 False leads to clean up: ${falseLeads.rows.length}`);
  console.log(`\nSample (first 25):`);
  for (const r of falseLeads.rows.slice(0, 25)) {
    console.log(`  ${r.effective_duration}s | ${r.qa_status} | ${r.ai_disposition || r.attempt_disposition || 'N/A'} | ${r.contact_name} (${r.contact_email})`);
  }

  if (falseLeads.rows.length === 0) {
    console.log('✅ No false leads found!');
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN — ${falseLeads.rows.length} leads would be rejected. Run without --dry-run to execute.`);
    await pool.end();
    return;
  }

  // STEP 2: Reject all false leads
  const leadIds = falseLeads.rows.map((r: any) => r.lead_id);
  
  const rejectResult = await pool.query(`
    UPDATE leads 
    SET qa_status = 'rejected',
        qa_decision = 'AUTO-REJECTED 2026-02-23: Ghost/short call (duration < ${MIN_REAL_DURATION}s). No real engagement detected.',
        rejected_reason = 'auto_cleanup_short_call',
        rejected_at = NOW(),
        updated_at = NOW()
    WHERE id = ANY($1)
      AND qa_status != 'rejected'
  `, [leadIds]);
  console.log(`\n✅ Rejected ${(rejectResult as any).rowCount} false leads`);

  // STEP 3: Clear QC work queue entries for rejected leads
  const qcResult = await pool.query(`
    UPDATE qc_work_queue
    SET status = 'completed',
        decision = 'auto_rejected',
        notes = 'Auto-rejected: ghost/short call cleanup 2026-02-23',
        updated_at = NOW()
    WHERE lead_id = ANY($1)
      AND status IN ('pending', 'in_progress')
  `, [leadIds]);
  console.log(`✅ Cleared ${(qcResult as any).rowCount} QC work queue entries`);

  // STEP 4: Fix session dispositions for ghost calls (< 15s marked as qualified_lead or callback_requested)
  const sessionIds = falseLeads.rows
    .filter((r: any) => r.session_id && r.effective_duration < 15 && ['qualified_lead', 'callback_requested'].includes(r.ai_disposition || ''))
    .map((r: any) => r.session_id);
  
  if (sessionIds.length > 0) {
    const sessionResult = await pool.query(`
      UPDATE call_sessions
      SET ai_disposition = 'no_answer',
          updated_at = NOW()
      WHERE id = ANY($1)
        AND ai_disposition IN ('qualified_lead', 'callback_requested')
    `, [sessionIds]);
    console.log(`✅ Downgraded ${(sessionResult as any).rowCount} ghost call sessions from qualified/callback to no_answer`);
  }

  // STEP 5: Verification
  const verification = await pool.query(`
    SELECT qa_status, COUNT(*) as count
    FROM leads
    WHERE created_at >= '2026-02-23'::date
    GROUP BY qa_status
    ORDER BY count DESC
  `);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  POST-CLEANUP: Today's Lead Distribution`);
  console.log(`${'='.repeat(70)}`);
  for (const r of verification.rows) {
    console.log(`  ${r.qa_status}: ${r.count}`);
  }

  const remaining = await pool.query(`
    SELECT COUNT(*) as c
    FROM leads
    WHERE created_at >= '2026-02-23'::date
      AND qa_status NOT IN ('rejected')
  `);
  console.log(`\n  Active leads remaining today: ${remaining.rows[0].c}`);

  console.log(`\n✅ Cleanup complete!\n`);
  await pool.end();
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
