import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkLeads() {
  console.log('=== Checking Leads Data ===\n');

  // Count by qa_status
  const byStatus = await pool.query(`
    SELECT COUNT(*) as total, qa_status FROM leads GROUP BY qa_status
  `);
  console.log('Leads by qa_status:', byStatus.rows);

  // Count active (non-deleted) by qa_status
  const activeByStatus = await pool.query(`
    SELECT COUNT(*) as total, qa_status FROM leads WHERE deleted_at IS NULL GROUP BY qa_status
  `);
  console.log('\nActive leads by qa_status:', activeByStatus.rows);

  // Leads this month
  const thisMonth = await pool.query(`
    SELECT COUNT(*) as count FROM leads WHERE created_at >= date_trunc('month', CURRENT_DATE)
  `);
  console.log('\nLeads this month:', thisMonth.rows[0].count);

  // Deleted leads this month
  const deletedMonth = await pool.query(`
    SELECT COUNT(*) as count FROM leads WHERE deleted_at IS NOT NULL AND created_at >= date_trunc('month', CURRENT_DATE)
  `);
  console.log('Deleted leads this month:', deletedMonth.rows[0].count);

  // Check today's leads
  const today = await pool.query(`
    SELECT COUNT(*) as count FROM leads WHERE created_at >= CURRENT_DATE AND deleted_at IS NULL
  `);
  console.log('\nActive leads created today:', today.rows[0].count);

  // Total leads
  const total = await pool.query('SELECT COUNT(*) as count FROM leads WHERE deleted_at IS NULL');
  console.log('\nTotal active leads in DB:', total.rows[0].count);

  // Recent leads
  const recent = await pool.query(`
    SELECT id, contact_id, call_attempt_id, qa_status, deleted_at, created_at 
    FROM leads ORDER BY created_at DESC LIMIT 20
  `);
  console.log('\nRecent 20 leads:');
  for (const r of recent.rows) {
    const deleted = r.deleted_at ? '[DELETED]' : '';
    console.log(`  ID: ${r.id} | Contact: ${r.contact_id} | CallAttempt: ${r.call_attempt_id} | QA: ${r.qa_status} ${deleted} | ${r.created_at}`);
  }

  await pool.end();
}

checkLeads().catch(console.error);