import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require' });

async function rejectBadLeads() {
  const cid = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';

  // 1. First count the bad leads (not already rejected)
  const countResult = await pool.query(`
    SELECT COUNT(*) as total_bad,
           COUNT(*) FILTER (WHERE l.qa_status != 'rejected') as not_yet_rejected
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.campaign_id = $1
    AND dca.disposition NOT IN ('qualified_lead', 'callback_requested')
  `, [cid]);
  
  console.log('=== BAD LEADS STATUS ===');
  console.log('Total bad leads:', countResult.rows[0].total_bad);
  console.log('Not yet rejected:', countResult.rows[0].not_yet_rejected);

  // 2. Reject all bad leads where call attempt disposition is NOT qualified
  const rejectResult = await pool.query(`
    UPDATE leads l
    SET qa_status = 'rejected',
        qa_decision = 'Auto-rejected: Call attempt disposition is non-qualifying (' || dca.disposition || ')',
        updated_at = NOW()
    FROM dialer_call_attempts dca
    WHERE dca.id = l.call_attempt_id
    AND l.campaign_id = $1
    AND dca.disposition NOT IN ('qualified_lead', 'callback_requested')
    AND l.qa_status != 'rejected'
    RETURNING l.id, dca.disposition, l.contact_name
  `, [cid]);

  console.log(`\n=== REJECTED ${rejectResult.rowCount} leads ===`);
  for (const r of rejectResult.rows) {
    console.log(`  ${r.id.substring(0, 8)} | ${r.contact_name} | was: ${r.disposition}`);
  }

  // 3. Also reject leads without any call_attempt_id (orphans) that aren't already rejected
  const orphanResult = await pool.query(`
    UPDATE leads
    SET qa_status = 'rejected',
        qa_decision = 'Auto-rejected: Orphan lead with no call attempt link',
        updated_at = NOW()
    WHERE campaign_id = $1
    AND call_attempt_id IS NULL
    AND qa_status != 'rejected'
    RETURNING id, contact_name
  `, [cid]);

  console.log(`\n=== REJECTED ${orphanResult.rowCount} orphan leads ===`);
  for (const r of orphanResult.rows) {
    console.log(`  ${r.id.substring(0, 8)} | ${r.contact_name}`);
  }

  // 4. Final status
  const finalStatus = await pool.query(`
    SELECT qa_status, COUNT(*) as c
    FROM leads
    WHERE campaign_id = $1
    GROUP BY qa_status ORDER BY c DESC
  `, [cid]);
  console.log('\n=== FINAL QA STATUS BREAKDOWN ===');
  for (const r of finalStatus.rows) console.log(`  ${r.qa_status}: ${r.c}`);

  // 5. Also clean up QC work queue for rejected leads
  const qcClean = await pool.query(`
    UPDATE qc_work_queue q
    SET status = 'completed',
        updated_at = NOW()
    FROM leads l
    WHERE l.id = q.lead_id
    AND l.campaign_id = $1
    AND l.qa_status = 'rejected'
    AND q.status IN ('pending', 'in_progress')
    RETURNING q.id
  `, [cid]);
  console.log(`\n=== Cleaned ${qcClean.rowCount} QC work queue entries ===`);

  await pool.end();
}

rejectBadLeads().catch(e => { console.error(e); process.exit(1); });
