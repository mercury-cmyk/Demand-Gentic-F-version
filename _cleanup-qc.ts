import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require' });

async function run() {
  const cid = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';

  // Check valid statuses
  const r1 = await pool.query('SELECT DISTINCT status FROM qc_work_queue LIMIT 20');
  console.log('QC statuses:', r1.rows.map(r => r.status));

  // Clean up QC queue for rejected leads
  const qcClean = await pool.query(`
    UPDATE qc_work_queue q
    SET status = 'rejected',
        updated_at = NOW()
    FROM leads l
    WHERE l.id = q.lead_id
    AND l.campaign_id = $1
    AND l.qa_status = 'rejected'
    AND q.status = 'pending'
    RETURNING q.id
  `, [cid]);
  console.log('Cleaned pending QC entries:', qcClean.rowCount);

  // Final counts
  const finalLeads = await pool.query(`
    SELECT qa_status, COUNT(*) as c FROM leads WHERE campaign_id = $1 GROUP BY qa_status ORDER BY c DESC
  `, [cid]);
  console.log('\nFinal lead status:');
  for (const r of finalLeads.rows) console.log('  ' + r.qa_status + ': ' + r.c);

  const finalQC = await pool.query(`
    SELECT q.status, COUNT(*) as c FROM qc_work_queue q WHERE q.campaign_id = $1 GROUP BY q.status ORDER BY c DESC
  `, [cid]);
  console.log('\nFinal QC status:');
  for (const r of finalQC.rows) console.log('  ' + r.status + ': ' + r.c);

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
