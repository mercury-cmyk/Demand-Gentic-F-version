/**
 * Update ai_score on ALL leads that have call quality records.
 * Sets ai_score = weighted conversation quality score.
 * This ensures scores are visible in the Leads and QA dashboard.
 */
import { pool } from '../server/db';

async function main() {
  const client = await pool.connect();
  try {
    // Update ai_score for all leads with quality records
    const res = await client.query(`
      UPDATE leads l
      SET 
        ai_score = sub.conv_quality,
        updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (l2.id)
          l2.id as lead_id,
          ROUND(
            COALESCE(cqr.clarity_score, 0) * 0.25 +
            COALESCE(cqr.engagement_score, 0) * 0.20 +
            COALESCE(cqr.empathy_score, 0) * 0.15 +
            COALESCE(cqr.objection_handling_score, 0) * 0.15 +
            COALESCE(cqr.qualification_score, 0) * 0.15 +
            COALESCE(cqr.closing_score, 0) * 0.10
          ) as conv_quality,
          cqr.overall_quality_score
        FROM leads l2
        JOIN call_sessions cs ON cs.telnyx_call_id = l2.telnyx_call_id
        JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
        WHERE l2.deleted_at IS NULL
        ORDER BY l2.id, cqr.created_at DESC
      ) sub
      WHERE l.id = sub.lead_id
      RETURNING l.id, l.qa_status, sub.conv_quality, sub.overall_quality_score
    `);

    console.log(`Updated ai_score for ${res.rows.length} leads.\n`);

    // Breakdown by qa_status
    const byStatus: Record<string, { total: number; above70: number }> = {};
    for (const r of res.rows) {
      if (!byStatus[r.qa_status]) byStatus[r.qa_status] = { total: 0, above70: 0 };
      byStatus[r.qa_status].total++;
      if (parseInt(r.conv_quality) >= 70) byStatus[r.qa_status].above70++;
    }

    console.log('Scores updated by QA status:');
    for (const [status, stats] of Object.entries(byStatus)) {
      console.log(`  ${status}: ${stats.total} updated (${stats.above70} with CQ >= 70)`);
    }

    // Score distribution
    const dist = { '90-100': 0, '80-89': 0, '70-79': 0, '50-69': 0, '0-49': 0 };
    for (const r of res.rows) {
      const cq = parseInt(r.conv_quality);
      if (cq >= 90) dist['90-100']++;
      else if (cq >= 80) dist['80-89']++;
      else if (cq >= 70) dist['70-79']++;
      else if (cq >= 50) dist['50-69']++;
      else dist['0-49']++;
    }

    console.log('\nScore distribution:');
    for (const [range, count] of Object.entries(dist)) {
      console.log(`  ${range}: ${count}`);
    }

    console.log('\nAll leads now have ai_score visible in the dashboard.');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
