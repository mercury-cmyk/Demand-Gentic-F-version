/**
 * Analyze ALL leads in "New" QA status (qa_status = 'new' OR 'under_review')
 * These are the 115 leads visible in the QA pipeline.
 * Focus: Qualify calls with score >= 50
 */
import { pool } from '../server/db';

async function analyzeAllQANew() {
  const c = await pool.connect();
  try {
    console.log('='.repeat(80));
    console.log('ANALYSIS: All Leads in QA Pipeline (new + under_review)');
    console.log('='.repeat(80));
    console.log(`Run at: ${new Date().toISOString()}\n`);

    // Count
    const { rows: [counts] } = await c.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN qa_status = 'new' THEN 1 END) as new_count,
        COUNT(CASE WHEN qa_status = 'under_review' THEN 1 END) as review_count
      FROM leads
      WHERE qa_status IN ('new', 'under_review')
        AND deleted_at IS NULL
    `);
    console.log(`Total in QA pipeline: ${counts.total} (new: ${counts.new_count}, under_review: ${counts.review_count})\n`);

    // Get all leads with quality scores
    const { rows: leads } = await c.query(`
      SELECT 
        l.id AS lead_id,
        l.qa_status,
        l.contact_name,
        l.contact_email,
        l.account_name,
        l.account_industry,
        l.campaign_id,
        l.call_duration,
        l.created_at,
        l.ai_score,
        l.ai_qualification_status,
        l.telnyx_call_id,
        l.recording_url,
        l.recording_s3_key,
        CASE WHEN l.transcript IS NOT NULL AND length(l.transcript) > 20 THEN true ELSE false END as has_transcript,
        c2.name AS campaign_name,
        ct.job_title,
        ct.direct_phone,
        -- Get best quality score
        COALESCE(
          cqr.overall_quality_score,
          (l.ai_analysis->>'overallScore')::numeric,
          l.ai_score::numeric
        ) AS effective_score,
        cqr.overall_quality_score AS quality_score,
        cqr.engagement_score,
        cqr.qualification_score,
        cqr.closing_score,
        cqr.assigned_disposition,
        cqr.expected_disposition,
        cqr.disposition_accurate,
        cqr.sentiment,
        -- Call session info
        cs.ai_disposition AS session_disposition,
        cs.duration_sec AS session_duration,
        cs.ai_transcript IS NOT NULL AND length(cs.ai_transcript) > 20 AS session_has_transcript
      FROM leads l
      LEFT JOIN campaigns c2 ON l.campaign_id = c2.id
      LEFT JOIN contacts ct ON l.contact_id = ct.id
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN LATERAL (
        SELECT cqr2.* FROM call_quality_records cqr2
        WHERE cqr2.call_session_id = cs.id
        ORDER BY cqr2.created_at DESC LIMIT 1
      ) cqr ON true
      WHERE l.qa_status IN ('new', 'under_review')
        AND l.deleted_at IS NULL
      ORDER BY effective_score DESC NULLS LAST, l.created_at DESC
    `);

    // Categorize
    const qualifying = leads.filter(l => l.effective_score !== null && parseFloat(l.effective_score) >= 50);
    const nonQualifying = leads.filter(l => l.effective_score !== null && parseFloat(l.effective_score)  l.effective_score === null);

    console.log('─'.repeat(80));
    console.log('SUMMARY');
    console.log('─'.repeat(80));
    console.log(`  Total leads in QA:         ${leads.length}`);
    console.log(`  Score >= 50 (QUALIFY):      ${qualifying.length}`);
    console.log(`  Score  l.has_transcript || l.session_has_transcript);
    const withoutTranscript = leads.filter(l => !l.has_transcript && !l.session_has_transcript);
    console.log(`  With transcript:           ${withTranscript.length}`);
    console.log(`  Without transcript:        ${withoutTranscript.length}`);

    // Campaign breakdown
    const byCampaign: Record = {};
    for (const l of leads) {
      const camp = l.campaign_name || 'Unknown';
      if (!byCampaign[camp]) byCampaign[camp] = { total: 0, qualify: 0, notQualify: 0, noScore: 0 };
      byCampaign[camp].total++;
      if (l.effective_score === null) byCampaign[camp].noScore++;
      else if (parseFloat(l.effective_score) >= 50) byCampaign[camp].qualify++;
      else byCampaign[camp].notQualify++;
    }
    console.log('\nCampaign Breakdown:');
    console.log('Campaign'.padEnd(50) + 'Total  Qualify  NotQual  NoScore');
    console.log('─'.repeat(80));
    for (const [camp, data] of Object.entries(byCampaign).sort((a, b) => b[1].total - a[1].total)) {
      console.log(
        camp.substring(0, 48).padEnd(50) +
        String(data.total).padStart(5) +
        String(data.qualify).padStart(9) +
        String(data.notQualify).padStart(9) +
        String(data.noScore).padStart(9)
      );
    }

    // Score distribution
    const scored = leads.filter(l => l.effective_score !== null);
    if (scored.length > 0) {
      const scores = scored.map(l => parseFloat(l.effective_score));
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      console.log(`\nScore Stats: Avg=${avg.toFixed(1)} | Min=${min} | Max=${max} | Scored=${scored.length}/${leads.length}`);
      
      const dist = [
        { label: '90-100 (Excellent)', min: 90, max: 100 },
        { label: '80-89  (Strong)', min: 80, max: 89 },
        { label: '70-79  (Good)', min: 70, max: 79 },
        { label: '60-69  (Fair)', min: 60, max: 69 },
        { label: '50-59  (Borderline)', min: 50, max: 59 },
        { label: '40-49  (Below)', min: 40, max: 49 },
        { label: '30-39  (Poor)', min: 30, max: 39 },
        { label: '20-29  (Very Poor)', min: 20, max: 29 },
        { label: '0-19   (Minimal)', min: 0, max: 19 },
      ];
      console.log('\nScore Distribution:');
      for (const d of dist) {
        const count = scores.filter(s => s >= d.min && s  0) console.log(`  ${d.label.padEnd(25)} ${String(count).padStart(3)} ${'█'.repeat(Math.min(count, 50))}`);
      }
    }

    // QUALIFYING LEADS detail
    console.log(`\n${'='.repeat(80)}`);
    console.log(`QUALIFYING LEADS (Score >= 50) — ${qualifying.length} leads`);
    console.log('='.repeat(80));
    for (let i = 0; i  l.has_transcript || l.session_has_transcript);
    const noScoreNoTranscript = noScore.filter(l => !l.has_transcript && !l.session_has_transcript);
    const noScoreWithRecording = noScore.filter(l => l.recording_url || l.recording_s3_key);
    console.log(`  With transcript (can be scored):  ${noScoreWithTranscript.length}`);
    console.log(`  Without transcript:               ${noScoreNoTranscript.length}`);
    console.log(`  With recording (can transcribe):  ${noScoreWithRecording.length}`);
    
    if (noScoreWithTranscript.length > 0) {
      console.log('\n  --- Has transcript, needs scoring ---');
      for (const l of noScoreWithTranscript) {
        console.log(`    ${(l.contact_name||'?').padEnd(25)} | ${(l.campaign_name||'?').substring(0,30).padEnd(32)} | ${l.call_duration||'?'}s | ${l.qa_status}`);
      }
    }
    if (noScoreNoTranscript.length > 0) {
      console.log('\n  --- No transcript ---');
      for (const l of noScoreNoTranscript.slice(0, 30)) {
        const hasRec = (l.recording_url || l.recording_s3_key) ? 'Has recording' : 'No recording';
        console.log(`    ${(l.contact_name||'?').padEnd(25)} | ${(l.campaign_name||'?').substring(0,30).padEnd(32)} | ${l.call_duration||'?'}s | ${hasRec} | ${l.qa_status}`);
      }
      if (noScoreNoTranscript.length > 30) {
        console.log(`    ... and ${noScoreNoTranscript.length - 30} more`);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('ANALYSIS COMPLETE');
    console.log('='.repeat(80));

  } finally {
    c.release();
    await pool.end();
  }
}
analyzeAllQANew().catch(e => { console.error(e); process.exit(1); });