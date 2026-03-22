import { pool } from '../server/db';

async function main() {
  const client = await pool.connect();
  try {
    // Update all scored qualifying leads to ensure they're visible in QA dashboard
    const res = await client.query(`
      UPDATE leads l
      SET 
        qa_status = CASE 
          WHEN l.qa_status IN ('new', 'rejected') THEN 'under_review'
          ELSE l.qa_status 
        END,
        ai_score = sub.conv_quality,
        ai_qualification_status = 'qualified',
        updated_at = NOW()
      FROM (
        SELECT 
          l2.id as lead_id,
          ROUND(
            COALESCE(cqr.clarity_score, 0) * 0.25 +
            COALESCE(cqr.engagement_score, 0) * 0.20 +
            COALESCE(cqr.empathy_score, 0) * 0.15 +
            COALESCE(cqr.objection_handling_score, 0) * 0.15 +
            COALESCE(cqr.qualification_score, 0) * 0.15 +
            COALESCE(cqr.closing_score, 0) * 0.10
          ) as conv_quality
        FROM leads l2
        JOIN call_sessions cs ON cs.telnyx_call_id = l2.telnyx_call_id
        JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
        WHERE l2.deleted_at IS NULL
          AND ROUND(
            COALESCE(cqr.clarity_score, 0) * 0.25 +
            COALESCE(cqr.engagement_score, 0) * 0.20 +
            COALESCE(cqr.empathy_score, 0) * 0.15 +
            COALESCE(cqr.objection_handling_score, 0) * 0.15 +
            COALESCE(cqr.qualification_score, 0) * 0.15 +
            COALESCE(cqr.closing_score, 0) * 0.10
          ) >= 70
      ) sub
      WHERE l.id = sub.lead_id
        AND l.qa_status NOT IN ('approved', 'published')
      RETURNING l.id, l.qa_status, sub.conv_quality
    `);

    console.log(`Updated ${res.rows.length} qualifying leads for QA dashboard visibility.`);
    for (const r of res.rows) {
      console.log(`  Lead ${r.id} -> qa_status=${r.qa_status}, ai_score=${r.conv_quality}`);
    }

    // Count what's in QA now
    const counts = await client.query(`
      SELECT qa_status, COUNT(*) as cnt
      FROM leads
      WHERE deleted_at IS NULL AND ai_qualification_status = 'qualified'
      GROUP BY qa_status
      ORDER BY cnt DESC
    `);
    console.log('\nQualified leads by QA status:');
    for (const r of counts.rows) {
      console.log(`  ${r.qa_status}: ${r.cnt}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });