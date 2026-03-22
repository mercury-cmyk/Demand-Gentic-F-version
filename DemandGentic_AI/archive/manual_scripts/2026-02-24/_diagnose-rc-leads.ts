import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function diagnose() {
  // 1. Find the RingCentral campaign
  const camps = await pool.query(`SELECT id, name, type FROM campaigns WHERE name ILIKE '%ringcentral%' OR name ILIKE '%ring%central%' LIMIT 5`);
  console.log('=== RingCentral Campaigns ===');
  for (const r of camps.rows) console.log(r.id, '|', r.name, '|', r.type);

  if (camps.rows.length === 0) { console.log('No campaign found'); await pool.end(); return; }
  const cid = camps.rows[0].id;

  // 2. Count leads vs total calls
  const totalCalls = await pool.query('SELECT COUNT(*) as c FROM dialer_call_attempts WHERE campaign_id = $1', [cid]);
  const totalLeads = await pool.query('SELECT COUNT(*) as c FROM leads WHERE campaign_id = $1', [cid]);
  const totalQC = await pool.query('SELECT COUNT(*) as c FROM qc_work_queue WHERE campaign_id = $1', [cid]);
  console.log('\n=== Counts ===');
  console.log('Total call attempts:', totalCalls.rows[0].c);
  console.log('Total leads:', totalLeads.rows[0].c);
  console.log('Total QC entries:', totalQC.rows[0].c);

  // 3. Recent leads — check notes/source/custom_fields for creation path
  const recentLeads = await pool.query(`
    SELECT id, contact_name, qa_status, notes, created_at, call_duration,
           delivery_source,
           custom_fields->>'aiAgentCall' as ai_agent,
           custom_fields->>'aiDisposition' as ai_dispo
    FROM leads WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 15
  `, [cid]);
  console.log('\n=== Recent 15 Leads ===');
  for (const r of recentLeads.rows) {
    console.log(`${r.id.substring(0,8)} | ${r.contact_name} | qa:${r.qa_status} | delSrc:${r.delivery_source} | dur:${r.call_duration}s | ai:${r.ai_agent} | aiDispo:${r.ai_dispo} | notes:${(r.notes || '').substring(0, 100)}`);
  }

  // 4. Disposition breakdown for call attempts
  const disps = await pool.query('SELECT disposition, COUNT(*) as c FROM dialer_call_attempts WHERE campaign_id = $1 GROUP BY disposition ORDER BY c DESC', [cid]);
  console.log('\n=== Call Attempt Dispositions ===');
  for (const r of disps.rows) console.log(`  ${r.disposition}: ${r.c}`);

  // 5. Lead qa_status breakdown
  const qaStatuses = await pool.query('SELECT qa_status, COUNT(*) as c FROM leads WHERE campaign_id = $1 GROUP BY qa_status ORDER BY c DESC', [cid]);
  console.log('\n=== Lead QA Status Breakdown ===');
  for (const r of qaStatuses.rows) console.log(`  ${r.qa_status}: ${r.c}`);

  // 6. Leads created today with their matching call attempt dispositions
  const todayLeads = await pool.query(`
    SELECT l.id, l.contact_name, l.notes, l.delivery_source, l.created_at::text,
           dca.disposition as call_dispo, dca.call_duration_seconds, dca.agent_type
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.campaign_id = $1 AND l.created_at >= CURRENT_DATE - interval '3 days'
    ORDER BY l.created_at DESC LIMIT 20
  `, [cid]);
  console.log('\n=== Leads Last 3 Days + Their Call Dispositions ===');
  for (const r of todayLeads.rows) {
    console.log(`${r.id.substring(0,8)} | ${r.contact_name} | callDispo:${r.call_dispo} | dur:${r.call_duration_seconds}s | agentType:${r.agent_type} | delSrc:${r.delivery_source} | notes:${(r.notes || '').substring(0, 100)}`);
  }

  // 7. Check for leads WITHOUT qualified disposition
  const nonQual = await pool.query(`
    SELECT l.id, l.contact_name, l.notes, l.delivery_source,
           dca.disposition as call_dispo, dca.call_duration_seconds, dca.agent_type
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.campaign_id = $1
    AND (dca.disposition IS NULL OR dca.disposition NOT IN ('qualified_lead', 'callback_requested'))
    ORDER BY l.created_at DESC LIMIT 20
  `, [cid]);
  console.log('\n=== Leads with NON-QUALIFIED dispositions (THE PROBLEM) ===');
  console.log(`Found: ${nonQual.rows.length} leads`);
  for (const r of nonQual.rows) {
    console.log(`${r.id.substring(0,8)} | ${r.contact_name} | callDispo:${r.call_dispo} | dur:${r.call_duration_seconds}s | agentType:${r.agent_type} | delSrc:${r.delivery_source} | notes:${(r.notes || '').substring(0, 100)}`);
  }

  // 8. Check if leads are missing call_attempt_id (created via legacy path)
  const noAttempt = await pool.query(`SELECT COUNT(*) as c FROM leads WHERE campaign_id = $1 AND call_attempt_id IS NULL`, [cid]);
  console.log(`\n=== Leads without call_attempt_id: ${noAttempt.rows[0].c} ===`);

  await pool.end();
}

diagnose().catch(e => { console.error(e); process.exit(1); });