import { pool } from '../server/db';

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        l.id as lead_id,
        COALESCE(c.first_name || ' ' || c.last_name, 'Unknown') as name,
        camp.name as campaign,
        cqr.overall_quality_score,
        cqr.clarity_score,
        cqr.engagement_score,
        cqr.empathy_score,
        cqr.objection_handling_score,
        cqr.qualification_score,
        cqr.closing_score,
        l.qa_status,
        cs.ai_disposition
      FROM leads l
      JOIN contacts c ON l.contact_id = c.id
      JOIN campaigns camp ON l.campaign_id = camp.id
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
      WHERE l.deleted_at IS NULL
        AND l.qa_status IN ('new','under_review')
        AND cqr.overall_quality_score IS NOT NULL
      ORDER BY cqr.overall_quality_score DESC
    `);

    console.log(`\nFound ${res.rows.length} scored leads in QA pipeline:\n`);

    const qualifying: any[] = [];
    const nonQualifying: any[] = [];

    for (const r of res.rows) {
      const cq = Math.round(
        (r.clarity_score || 0) * 0.25 +
        (r.engagement_score || 0) * 0.20 +
        (r.empathy_score || 0) * 0.15 +
        (r.objection_handling_score || 0) * 0.15 +
        (r.qualification_score || 0) * 0.15 +
        (r.closing_score || 0) * 0.10
      );
      const entry = { ...r, convQ: cq };
      if (cq >= 70) qualifying.push(entry);
      else nonQualifying.push(entry);
    }

    console.log(`=== QUALIFYING (Conversation Quality >= 70) === [${qualifying.length}]`);
    for (const r of qualifying) {
      console.log(`  Overall: ${r.overall_quality_score} | ConvQ: ${r.convQ} | ${r.name} | ${r.campaign} | ${r.ai_disposition}`);
      console.log(`    clarity:${r.clarity_score} engage:${r.engagement_score} empathy:${r.empathy_score} objection:${r.objection_handling_score} qual:${r.qualification_score} close:${r.closing_score}`);
    }

    console.log(`\n=== NOT QUALIFYING (ConvQ  { console.error(e); process.exit(1); });