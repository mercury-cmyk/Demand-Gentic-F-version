import { pool } from '../server/db';

async function main() {
  const c = await pool.connect();
  try {
    // Check what interest-related fields we have in existing quality records
    const r = await c.query(`
      SELECT 
        cqr.expected_disposition,
        cqr.qualification_met,
        cqr.sentiment,
        cqr.engagement_level,
        COUNT(*) as cnt
      FROM call_quality_records cqr
      GROUP BY cqr.expected_disposition, cqr.qualification_met, cqr.sentiment, cqr.engagement_level
      ORDER BY cnt DESC
      LIMIT 30
    `);
    console.log('=== Existing interest signals in quality records ===');
    for (const row of r.rows) {
      console.log(`  expected_dispo: ${row.expected_disposition || 'null'} | qual_met: ${row.qualification_met} | sentiment: ${row.sentiment || 'null'} | engagement: ${row.engagement_level || 'null'} | count: ${row.cnt}`);
    }

    // Check a few examples of expected_disposition = qualified
    const qual = await c.query(`
      SELECT 
        cqr.expected_disposition, cqr.assigned_disposition,
        cqr.qualification_met, cqr.overall_quality_score,
        cqr.qualification_score, cqr.engagement_score,
        l.contact_name, l.ai_score, l.qa_status
      FROM call_quality_records cqr
      JOIN call_sessions cs ON cs.id = cqr.call_session_id
      JOIN leads l ON l.telnyx_call_id = cs.telnyx_call_id AND l.deleted_at IS NULL
      WHERE cqr.expected_disposition ILIKE '%qualified%'
         OR cqr.qualification_met = true
      LIMIT 20
    `);
    console.log('\n=== Leads where AI detected interest (expected=qualified or qual_met=true) ===');
    for (const row of qual.rows) {
      console.log(`  ${row.contact_name} | expected: ${row.expected_disposition} | qual_met: ${row.qualification_met} | overall: ${row.overall_quality_score} | qual_dim: ${row.qualification_score} | ai_score: ${row.ai_score} | qa: ${row.qa_status}`);
    }

    // Count by expected_disposition
    const dispositions = await c.query(`
      SELECT cqr.expected_disposition, COUNT(*) as cnt
      FROM call_quality_records cqr
      GROUP BY cqr.expected_disposition
      ORDER BY cnt DESC
    `);
    console.log('\n=== Expected disposition distribution ===');
    for (const row of dispositions.rows) {
      console.log(`  ${row.expected_disposition || 'NULL'}: ${row.cnt}`);
    }

  } finally { c.release(); await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
