import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const p = new Pool({ connectionString: 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require' });

async function main() {
  // Get lead IDs of rejected leads from today's cleanup
  const leads = await p.query(`SELECT id FROM leads WHERE created_at >= '2026-02-23'::date AND qa_status = 'rejected' AND rejected_reason = 'auto_cleanup_short_call'`);
  const leadIds = leads.rows.map((r: any) => r.id);
  console.log('Rejected lead IDs count:', leadIds.length);

  // Clear QC queue entries with correct enum values 
  const qc = await p.query(`
    UPDATE qc_work_queue 
    SET status = 'rejected', 
        updated_at = NOW() 
    WHERE lead_id = ANY($1) 
      AND status IN ('pending', 'in_review')
  `, [leadIds]);
  console.log('QC entries cleared:', (qc as any).rowCount);

  // Fix ghost session dispositions (< 15s)
  const sessions = await p.query(`
    UPDATE call_sessions 
    SET ai_disposition = 'no_answer', updated_at = NOW() 
    WHERE id IN (
      SELECT dca.call_session_id 
      FROM dialer_call_attempts dca 
      JOIN leads l ON l.call_attempt_id = dca.id 
      WHERE l.rejected_reason = 'auto_cleanup_short_call' 
        AND dca.call_session_id IS NOT NULL
    ) 
    AND duration_sec < 15 
    AND ai_disposition IN ('qualified_lead', 'callback_requested')
  `);
  console.log('Ghost sessions downgraded:', (sessions as any).rowCount);

  // Verification: Today's lead distribution
  const v = await p.query(`
    SELECT qa_status, COUNT(*) as c 
    FROM leads 
    WHERE created_at >= '2026-02-23'::date 
    GROUP BY qa_status 
    ORDER BY c DESC
  `);
  console.log('\nToday lead distribution:');
  for (const r of v.rows) console.log(`  ${r.qa_status}: ${r.c}`);

  // Count active leads remaining
  const active = await p.query(`
    SELECT COUNT(*) as c 
    FROM leads 
    WHERE created_at >= '2026-02-23'::date 
      AND qa_status NOT IN ('rejected')
  `);
  console.log(`\nActive leads remaining today: ${active.rows[0].c}`);

  await p.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
