/**
 * Analyze leads in "New" QA status and qualify calls with score >= 50
 * Uses raw SQL for maximum reliability.
 */

import { pool } from '../server/db';

async function analyzeNewLeadsWithQualityScores() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(100));
    console.log('ANALYSIS: Leads in "New" QA Status — Qualifying Calls with Score >= 50');
    console.log('='.repeat(100));
    console.log(`Run at: ${new Date().toISOString()}\n`);

    // 1. Get all leads with qaStatus = 'new' + enriched data
    const { rows: newLeads } = await client.query(`
      SELECT 
        l.id AS lead_id,
        l.contact_name,
        l.contact_email,
        l.account_name,
        l.account_industry,
        l.campaign_id,
        c2.name AS campaign_name,
        l.qa_status,
        l.ai_score,
        l.ai_qualification_status,
        l.call_duration,
        l.recording_url,
        l.transcript,
        l.created_at,
        l.qa_data,
        l.ai_analysis,
        l.telnyx_call_id,
        l.call_attempt_id,
        l.contact_id,
        ct.full_name AS contact_full_name,
        ct.direct_phone AS contact_phone,
        ct.job_title AS contact_job_title,
        ct.email AS contact_email_direct,
        ct.city AS contact_city,
        ct.state AS contact_state,
        ac.name AS account_company_name,
        ac.industry_standardized AS contact_industry,
        ac.domain AS account_website
      FROM leads l
      LEFT JOIN campaigns c2 ON l.campaign_id = c2.id
      LEFT JOIN contacts ct ON l.contact_id = ct.id
      LEFT JOIN accounts ac ON ct.account_id = ac.id
      WHERE l.qa_status = 'new'
        AND l.deleted_at IS NULL
      ORDER BY l.created_at DESC
    `);

    console.log(`Total leads with qaStatus = "new": ${newLeads.length}\n`);

    if (newLeads.length === 0) {
      console.log('No leads found in "new" QA status.');
      return;
    }

    // 2. For each lead, fetch quality records
    interface EnrichedLead {
      lead: any;
      qualityRecord: any | null;
      effectiveScore: number | null;
    }

    const enrichedLeads: EnrichedLead[] = [];

    for (const lead of newLeads) {
      let qualityRecord: any = null;

      // Try via telnyx_call_id
      if (lead.telnyx_call_id) {
        const { rows: qr } = await client.query(`
          SELECT 
            cqr.overall_quality_score,
            cqr.engagement_score,
            cqr.clarity_score,
            cqr.empathy_score,
            cqr.objection_handling_score,
            cqr.qualification_score,
            cqr.closing_score,
            cqr.sentiment,
            cqr.engagement_level,
            cqr.identity_confirmed,
            cqr.qualification_met,
            cqr.assigned_disposition,
            cqr.expected_disposition,
            cqr.disposition_accurate,
            cqr.issues,
            cqr.recommendations,
            cqr.campaign_alignment_score,
            cqr.flow_compliance_score,
            cqr.missed_talking_points,
            cqr.full_transcript AS quality_transcript
          FROM call_quality_records cqr
          INNER JOIN call_sessions cs ON cqr.call_session_id = cs.id
          WHERE cs.telnyx_call_id = $1
          ORDER BY cqr.created_at DESC
          LIMIT 1
        `, [lead.telnyx_call_id]);

        if (qr.length > 0) qualityRecord = qr[0];
      }

      // Fallback: match via contact + campaign
      if (!qualityRecord && lead.contact_id && lead.campaign_id) {
        const { rows: qr } = await client.query(`
          SELECT 
            cqr.overall_quality_score,
            cqr.engagement_score,
            cqr.clarity_score,
            cqr.empathy_score,
            cqr.objection_handling_score,
            cqr.qualification_score,
            cqr.closing_score,
            cqr.sentiment,
            cqr.engagement_level,
            cqr.identity_confirmed,
            cqr.qualification_met,
            cqr.assigned_disposition,
            cqr.expected_disposition,
            cqr.disposition_accurate,
            cqr.issues,
            cqr.recommendations,
            cqr.campaign_alignment_score,
            cqr.flow_compliance_score,
            cqr.missed_talking_points,
            cqr.full_transcript AS quality_transcript
          FROM call_quality_records cqr
          WHERE cqr.contact_id = $1 AND cqr.campaign_id = $2
          ORDER BY cqr.created_at DESC
          LIMIT 1
        `, [lead.contact_id, lead.campaign_id]);

        if (qr.length > 0) qualityRecord = qr[0];
      }

      const qualityScore = qualityRecord?.overall_quality_score ?? null;
      const aiScore = lead.ai_score ? parseFloat(lead.ai_score) : null;
      const effectiveScore = qualityScore ?? aiScore;

      enrichedLeads.push({ lead, qualityRecord, effectiveScore });
    }

    // 3. Split into categories
    const qualifyingLeads = enrichedLeads.filter(e => e.effectiveScore !== null && e.effectiveScore >= 50);
    const nonQualifyingLeads = enrichedLeads.filter(e => e.effectiveScore !== null && e.effectiveScore < 50);
    const noScoreLeads = enrichedLeads.filter(e => e.effectiveScore === null);

    // 4. Summary
    console.log('-'.repeat(100));
    console.log('SUMMARY');
    console.log('-'.repeat(100));
    console.log(`Total "New" leads:              ${enrichedLeads.length}`);
    console.log(`  Score >= 50 (QUALIFY):         ${qualifyingLeads.length}`);
    console.log(`  Score < 50 (NOT QUALIFY):      ${nonQualifyingLeads.length}`);
    console.log(`  No score available:            ${noScoreLeads.length}`);
    console.log('');

    // Campaign breakdown
    const campaignBreakdown: Record<string, { total: number; qualify: number; notQualify: number; noScore: number }> = {};
    for (const e of enrichedLeads) {
      const key = e.lead.campaign_name || e.lead.campaign_id || 'Unknown';
      if (!campaignBreakdown[key]) campaignBreakdown[key] = { total: 0, qualify: 0, notQualify: 0, noScore: 0 };
      campaignBreakdown[key].total++;
      if (e.effectiveScore !== null && e.effectiveScore >= 50) campaignBreakdown[key].qualify++;
      else if (e.effectiveScore !== null) campaignBreakdown[key].notQualify++;
      else campaignBreakdown[key].noScore++;
    }

    console.log('Campaign Breakdown:');
    console.log(
      'Campaign'.padEnd(50) +
      'Total'.padStart(8) +
      'Qualify'.padStart(10) +
      'Not Qual'.padStart(10) +
      'No Score'.padStart(10)
    );
    console.log('-'.repeat(88));
    for (const [name, stats] of Object.entries(campaignBreakdown).sort((a, b) => b[1].total - a[1].total)) {
      console.log(
        name.substring(0, 49).padEnd(50) +
        String(stats.total).padStart(8) +
        String(stats.qualify).padStart(10) +
        String(stats.notQualify).padStart(10) +
        String(stats.noScore).padStart(10)
      );
    }
    console.log('');

    // 5. Detailed qualifying leads (score >= 50)
    console.log('='.repeat(100));
    console.log(`QUALIFYING LEADS (Score >= 50) - ${qualifyingLeads.length} leads`);
    console.log('='.repeat(100));

    qualifyingLeads.sort((a, b) => (b.effectiveScore ?? 0) - (a.effectiveScore ?? 0));

    for (let i = 0; i < qualifyingLeads.length; i++) {
      const { lead: l, qualityRecord: qr, effectiveScore } = qualifyingLeads[i];
      console.log(`\n${'-'.repeat(100)}`);
      console.log(`#${i + 1} | Lead ID: ${l.lead_id}`);
      console.log(`${'-'.repeat(100)}`);
      console.log(`  Contact:          ${l.contact_name || l.contact_full_name || 'N/A'}`);
      console.log(`  Email:            ${l.contact_email || l.contact_email_direct || 'N/A'}`);
      console.log(`  Phone:            ${l.contact_phone || 'N/A'}`);
      console.log(`  Job Title:        ${l.contact_job_title || 'N/A'}`);
      console.log(`  Account:          ${l.account_name || l.account_company_name || 'N/A'}`);
      console.log(`  Industry:         ${l.account_industry || l.contact_industry || 'N/A'}`);
      console.log(`  Location:         ${[l.contact_city, l.contact_state].filter(Boolean).join(', ') || 'N/A'}`);
      console.log(`  Campaign:         ${l.campaign_name || l.campaign_id || 'N/A'}`);
      console.log(`  Created:          ${new Date(l.created_at).toISOString()}`);
      console.log(`  Call Duration:    ${l.call_duration ? `${l.call_duration}s (${Math.floor(l.call_duration / 60)}m ${l.call_duration % 60}s)` : 'N/A'}`);
      console.log(`  Recording:        ${l.recording_url ? 'Available' : 'No recording'}`);

      console.log(`\n  --- Scores ---`);
      console.log(`  EFFECTIVE SCORE:  ${effectiveScore?.toFixed(1)}`);
      console.log(`  AI Score:         ${l.ai_score ?? 'N/A'}`);
      console.log(`  AI Qual Status:   ${l.ai_qualification_status ?? 'N/A'}`);

      if (qr) {
        console.log(`  Quality Score:    ${qr.overall_quality_score ?? 'N/A'}`);
        console.log(`  Engagement:       ${qr.engagement_score ?? 'N/A'}`);
        console.log(`  Clarity:          ${qr.clarity_score ?? 'N/A'}`);
        console.log(`  Empathy:          ${qr.empathy_score ?? 'N/A'}`);
        console.log(`  Objection Handle: ${qr.objection_handling_score ?? 'N/A'}`);
        console.log(`  Qualification:    ${qr.qualification_score ?? 'N/A'}`);
        console.log(`  Closing:          ${qr.closing_score ?? 'N/A'}`);
        console.log(`  Campaign Align:   ${qr.campaign_alignment_score ?? 'N/A'}`);
        console.log(`  Flow Compliance:  ${qr.flow_compliance_score ?? 'N/A'}`);
        console.log(`  Sentiment:        ${qr.sentiment ?? 'N/A'}`);
        console.log(`  Engagement Lvl:   ${qr.engagement_level ?? 'N/A'}`);
        console.log(`  Identity OK:      ${qr.identity_confirmed ?? 'N/A'}`);
        console.log(`  Qualification Met:${qr.qualification_met ?? 'N/A'}`);
      }

      if (qr?.assigned_disposition || qr?.expected_disposition) {
        console.log(`\n  --- Disposition ---`);
        console.log(`  Assigned:         ${qr.assigned_disposition ?? 'N/A'}`);
        console.log(`  Expected:         ${qr.expected_disposition ?? 'N/A'}`);
        console.log(`  Accurate:         ${qr.disposition_accurate ?? 'N/A'}`);
      }

      // AI Analysis
      if (l.ai_analysis) {
        const analysis = typeof l.ai_analysis === 'string' ? JSON.parse(l.ai_analysis) : l.ai_analysis;
        console.log(`\n  --- AI Analysis ---`);
        if (analysis.summary) console.log(`  Summary:          ${analysis.summary}`);
        if (analysis.outcome) console.log(`  Outcome:          ${analysis.outcome}`);
        if (analysis.sentiment) console.log(`  AI Sentiment:     ${analysis.sentiment}`);
        if (analysis.highlights && Array.isArray(analysis.highlights)) {
          console.log(`  Highlights:       ${analysis.highlights.join('; ')}`);
        }
        if (analysis.recommendations && Array.isArray(analysis.recommendations)) {
          console.log(`  AI Recommends:    ${analysis.recommendations.join('; ')}`);
        }
      }

      // QA Data
      if (l.qa_data && typeof l.qa_data === 'object') {
        const qaObj = typeof l.qa_data === 'string' ? JSON.parse(l.qa_data) : l.qa_data;
        const qaEntries = Object.entries(qaObj);
        if (qaEntries.length > 0) {
          console.log(`\n  --- QA Data ---`);
          for (const [k, v] of qaEntries.slice(0, 10)) {
            console.log(`  ${String(k).padEnd(25)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
          }
          if (qaEntries.length > 10) console.log(`  ... and ${qaEntries.length - 10} more fields`);
        }
      }

      // Quality Issues
      if (qr?.issues && Array.isArray(qr.issues) && qr.issues.length > 0) {
        console.log(`\n  --- Quality Issues (${qr.issues.length}) ---`);
        for (const issue of qr.issues.slice(0, 5)) {
          console.log(`  [${issue.severity || 'info'}] ${issue.type || 'general'}: ${issue.description || ''}`);
        }
      }

      // Quality Recommendations
      if (qr?.recommendations && Array.isArray(qr.recommendations) && qr.recommendations.length > 0) {
        console.log(`\n  --- Quality Recommendations (${qr.recommendations.length}) ---`);
        for (const rec of qr.recommendations.slice(0, 5)) {
          if (typeof rec === 'string') {
            console.log(`  - ${rec}`);
          } else {
            console.log(`  - [${rec.category || ''}] ${rec.suggestedChange || rec.description || JSON.stringify(rec)}`);
          }
        }
      }

      // Missed Talking Points
      if (qr?.missed_talking_points && Array.isArray(qr.missed_talking_points) && qr.missed_talking_points.length > 0) {
        console.log(`\n  --- Missed Talking Points ---`);
        for (const tp of qr.missed_talking_points) {
          console.log(`  - ${tp}`);
        }
      }

      // Transcript snippet
      const transcript = l.transcript || qr?.quality_transcript;
      if (transcript) {
        const words = transcript.split(/\s+/);
        console.log(`\n  --- Transcript Preview (${words.length} words) ---`);
        console.log(`  ${words.slice(0, 80).join(' ')}${words.length > 80 ? '...' : ''}`);
      }

      // Qualification recommendation
      const score = effectiveScore ?? 0;
      let recommendation = '';
      if (score >= 70) {
        recommendation = 'STRONGLY RECOMMEND APPROVAL - High score, likely qualified';
      } else if (score >= 60) {
        recommendation = 'RECOMMEND REVIEW - Good score, verify qualification criteria met';
      } else {
        recommendation = 'BORDERLINE - Score 50-59, manual review strongly recommended';
      }
      console.log(`\n  >>> RECOMMENDATION: ${recommendation}`);
    }

    // 6. Non-qualifying leads (score < 50)
    if (nonQualifyingLeads.length > 0) {
      console.log(`\n\n${'='.repeat(100)}`);
      console.log(`NON-QUALIFYING LEADS (Score < 50) - ${nonQualifyingLeads.length} leads`);
      console.log('='.repeat(100));

      nonQualifyingLeads.sort((a, b) => (b.effectiveScore ?? 0) - (a.effectiveScore ?? 0));

      for (const { lead: l, effectiveScore } of nonQualifyingLeads) {
        console.log(
          `  Score: ${String(effectiveScore?.toFixed(0) ?? '?').padStart(3)} | ` +
          `${(l.contact_name || 'N/A').padEnd(30)} | ` +
          `${(l.account_name || 'N/A').padEnd(30)} | ` +
          `${(l.campaign_name || 'N/A').substring(0, 30).padEnd(30)} | ` +
          `Duration: ${l.call_duration ? `${l.call_duration}s` : 'N/A'}`
        );
      }
    }

    // 7. No-score leads
    if (noScoreLeads.length > 0) {
      console.log(`\n\n${'='.repeat(100)}`);
      console.log(`LEADS WITHOUT SCORES - ${noScoreLeads.length} leads`);
      console.log('='.repeat(100));

      for (const { lead: l } of noScoreLeads) {
        console.log(
          `  ${(l.contact_name || 'N/A').padEnd(30)} | ` +
          `${(l.account_name || 'N/A').padEnd(30)} | ` +
          `${(l.campaign_name || 'N/A').substring(0, 30).padEnd(30)} | ` +
          `Duration: ${l.call_duration ? `${l.call_duration}s` : 'N/A'} | ` +
          `Has Transcript: ${l.transcript ? 'Yes' : 'No'}`
        );
      }
    }

    // 8. Score distribution
    const scoredLeads = enrichedLeads.filter(e => e.effectiveScore !== null);
    if (scoredLeads.length > 0) {
      console.log(`\n\n${'='.repeat(100)}`);
      console.log('SCORE DISTRIBUTION');
      console.log('='.repeat(100));
      const ranges = [
        { label: '90-100 (Excellent)', min: 90, max: 101 },
        { label: '80-89  (Strong)',    min: 80, max: 90 },
        { label: '70-79  (Good)',      min: 70, max: 80 },
        { label: '60-69  (Fair)',      min: 60, max: 70 },
        { label: '50-59  (Borderline)',min: 50, max: 60 },
        { label: '40-49  (Below)',     min: 40, max: 50 },
        { label: '30-39  (Poor)',      min: 30, max: 40 },
        { label: '20-29  (Very Poor)', min: 20, max: 30 },
        { label: '0-19   (Minimal)',   min: 0,  max: 20 },
      ];
      for (const r of ranges) {
        const count = scoredLeads.filter(e => e.effectiveScore! >= r.min && e.effectiveScore! < r.max).length;
        const bar = '#'.repeat(Math.min(count * 2, 50));
        console.log(`  ${r.label.padEnd(22)} ${String(count).padStart(4)} ${bar}`);
      }

      const avgScore = scoredLeads.reduce((s, e) => s + e.effectiveScore!, 0) / scoredLeads.length;
      const maxScore = Math.max(...scoredLeads.map(e => e.effectiveScore!));
      const minScore = Math.min(...scoredLeads.map(e => e.effectiveScore!));
      console.log(`\n  Average Score: ${avgScore.toFixed(1)} | Min: ${minScore.toFixed(1)} | Max: ${maxScore.toFixed(1)}`);
    }

    console.log(`\n\n${'='.repeat(100)}`);
    console.log('ANALYSIS COMPLETE');
    console.log(`${'='.repeat(100)}`);

  } finally {
    client.release();
    await pool.end();
  }
}

analyzeNewLeadsWithQualityScores().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
