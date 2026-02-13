/**
 * BATCH RE-ANALYSIS: All QA Pipeline Leads (new + under_review)
 * 
 * Qualification Rule:
 *   Conversation Quality Score = weighted average of:
 *     engagement, clarity, empathy, objection_handling, qualification, closing
 *   Qualify if Conversation Quality >= 70
 *   (Natural, professional, clear conversations qualify regardless of call outcome)
 * 
 * Processes ALL leads with transcripts. For leads that already have quality records,
 * we re-score them. For leads without records, we create new ones.
 */

import { pool } from '../server/db';
import { analyzeConversationQuality } from '../server/services/conversation-quality-analyzer';

const BATCH_DELAY_MS = 1500;

interface ScoredLead {
  leadId: string;
  name: string;
  campaign: string;
  overallScore: number;
  convQualityScore: number;
  engagement: number;
  clarity: number;
  empathy: number;
  objectionHandling: number;
  qualification: number;
  closing: number;
  disposition: string;
  qualified: boolean;
  qaStatus: string;
}

function computeConversationQuality(dims: any): number {
  // Weighted average: clarity 25%, engagement 20%, empathy 15%, 
  // objection_handling 15%, qualification 15%, closing 10%
  const clarity = dims?.clarity ?? 0;
  const engagement = dims?.engagement ?? 0;
  const empathy = dims?.empathy ?? 0;
  const objectionHandling = dims?.objectionHandling ?? 0;
  const qualification = dims?.qualification ?? 0;
  const closing = dims?.closing ?? 0;

  return Math.round(
    clarity * 0.25 +
    engagement * 0.20 +
    empathy * 0.15 +
    objectionHandling * 0.15 +
    qualification * 0.15 +
    closing * 0.10
  );
}

async function batchReanalyze() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('BATCH RE-ANALYSIS: Qualify by Conversation Quality >= 70');
    console.log('='.repeat(80));
    console.log(`Run at: ${new Date().toISOString()}`);
    console.log('Rule: Natural, professional, clear conversations qualify');
    console.log('       regardless of call outcome\n');

    // Find ALL leads in QA pipeline with transcripts
    const { rows: leads } = await client.query(`
      SELECT 
        l.id AS lead_id,
        l.qa_status,
        l.contact_name,
        l.account_name,
        l.campaign_id,
        l.contact_id,
        l.transcript,
        l.call_duration,
        l.telnyx_call_id,
        l.dialed_number,
        c2.name AS campaign_name,
        c2.campaign_objective,
        c2.campaign_context_brief,
        ct.direct_phone AS contact_phone,
        ct.job_title,
        cs.id AS call_session_id,
        cs.ai_transcript AS session_transcript,
        cs.ai_disposition AS session_disposition,
        cs.contact_id AS session_contact_id,
        -- Check for existing quality record
        existing_cqr.cqr_id AS existing_quality_record_id
      FROM leads l
      LEFT JOIN campaigns c2 ON l.campaign_id = c2.id
      LEFT JOIN contacts ct ON l.contact_id = ct.id
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN LATERAL (
        SELECT cqr2.id AS cqr_id FROM call_quality_records cqr2
        WHERE cqr2.call_session_id = cs.id
        ORDER BY cqr2.created_at DESC LIMIT 1
      ) existing_cqr ON true
      WHERE l.qa_status IN ('new', 'under_review')
        AND l.deleted_at IS NULL
        AND (l.transcript IS NOT NULL AND length(l.transcript) > 20)
      ORDER BY l.created_at DESC
    `);

    const needScoring = leads.filter(l => !l.existing_quality_record_id);
    const alreadyScored = leads.filter(l => l.existing_quality_record_id);
    
    console.log(`Total leads with transcripts: ${leads.length}`);
    console.log(`  Need scoring (no quality record): ${needScoring.length}`);
    console.log(`  Already scored (will re-evaluate): ${alreadyScored.length}\n`);

    // Phase 1: Score all unscored leads
    let scored = 0;
    let failed = 0;
    const allResults: ScoredLead[] = [];

    console.log('─'.repeat(80));
    console.log('PHASE 1: Scoring unscored leads');
    console.log('─'.repeat(80));

    for (let i = 0; i < needScoring.length; i++) {
      const lead = needScoring[i];
      const transcript = lead.transcript || lead.session_transcript;
      
      console.log(`[${i + 1}/${needScoring.length}] ${lead.contact_name || '?'} | ${(lead.campaign_name||'?').substring(0,30)}`);

      try {
        const analysis = await analyzeConversationQuality({
          transcript,
          interactionType: 'live_call',
          analysisStage: 'post_call',
          callDurationSeconds: lead.call_duration || undefined,
          disposition: lead.session_disposition || undefined,
          campaignId: lead.campaign_id || undefined,
          campaignName: lead.campaign_name || undefined,
          campaignObjective: lead.campaign_objective || undefined,
          contactName: lead.contact_name || undefined,
          accountName: lead.account_name || undefined,
        });

        if (analysis.status !== 'ok') {
          console.log(`  -> Analysis failed`);
          failed++;
          continue;
        }

        const convQuality = computeConversationQuality(analysis.qualityDimensions);
        const qualified = convQuality >= 70;
        console.log(`  -> Overall: ${analysis.overallScore} | ConvQ: ${convQuality} | ${qualified ? 'QUALIFIES' : 'below 70'}`);

        // Create session if needed
        let sessionId = lead.call_session_id;
        if (!sessionId) {
          const { rows: [newSession] } = await client.query(`
            INSERT INTO call_sessions (
              campaign_id, contact_id, telnyx_call_id,
              ai_transcript, ai_disposition, 
              duration_sec, status, to_number_e164, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, NOW())
            RETURNING id
          `, [
            lead.campaign_id,
            lead.contact_id || lead.session_contact_id,
            lead.telnyx_call_id,
            transcript,
            lead.session_disposition,
            lead.call_duration,
            lead.contact_phone || lead.dialed_number || '+0000000000',
          ]);
          sessionId = newSession.id;
        }

        // Store quality record
        await client.query(`
          INSERT INTO call_quality_records (
            call_session_id, campaign_id, contact_id,
            overall_quality_score, engagement_score, clarity_score,
            empathy_score, objection_handling_score, qualification_score, closing_score,
            sentiment, engagement_level,
            identity_confirmed, qualification_met,
            issues, recommendations, breakdowns,
            prompt_updates, next_best_actions,
            campaign_alignment_score, context_usage_score, talking_points_coverage_score,
            missed_talking_points, flow_compliance_score, missed_steps, flow_deviations,
            assigned_disposition, expected_disposition, disposition_accurate, disposition_notes,
            transcript_length, full_transcript,
            analysis_model, analysis_stage, interaction_type, analyzed_at,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25, $26,
            $27, $28, $29, $30, $31, $32, $33, $34, $35, NOW(), NOW(), NOW()
          )
        `, [
          sessionId, lead.campaign_id, lead.contact_id || lead.session_contact_id,
          analysis.overallScore,
          analysis.qualityDimensions?.engagement,
          analysis.qualityDimensions?.clarity,
          analysis.qualityDimensions?.empathy,
          analysis.qualityDimensions?.objectionHandling,
          analysis.qualityDimensions?.qualification,
          analysis.qualityDimensions?.closing,
          analysis.learningSignals?.sentiment || (analysis as any).sentiment || null,
          analysis.learningSignals?.engagementLevel || (analysis as any).engagementLevel || null,
          (analysis as any).identityConfirmed ?? null,
          (analysis as any).qualificationMet ?? null,
          JSON.stringify(analysis.issues || []),
          JSON.stringify(analysis.recommendations || []),
          JSON.stringify(analysis.breakdowns || []),
          JSON.stringify(analysis.promptUpdates || []),
          JSON.stringify(analysis.nextBestActions || []),
          analysis.campaignAlignment?.objectiveAdherence ?? null,
          analysis.campaignAlignment?.contextUsage ?? null,
          analysis.campaignAlignment?.talkingPointsCoverage ?? null,
          JSON.stringify(analysis.campaignAlignment?.missedTalkingPoints || []),
          analysis.flowCompliance?.score ?? null,
          JSON.stringify(analysis.flowCompliance?.missedSteps || []),
          JSON.stringify(analysis.flowCompliance?.deviations || []),
          analysis.dispositionReview?.assignedDisposition || lead.session_disposition || null,
          analysis.dispositionReview?.expectedDisposition || null,
          analysis.dispositionReview?.isAccurate ?? null,
          JSON.stringify(analysis.dispositionReview?.notes || []),
          transcript.length,
          transcript.substring(0, 12000),
          analysis.metadata?.model || 'deepseek-chat',
          'post_call', 'live_call',
        ]);

        scored++;
        allResults.push({
          leadId: lead.lead_id,
          name: lead.contact_name || '?',
          campaign: lead.campaign_name || '?',
          overallScore: analysis.overallScore,
          convQualityScore: convQuality,
          engagement: analysis.qualityDimensions?.engagement ?? 0,
          clarity: analysis.qualityDimensions?.clarity ?? 0,
          empathy: analysis.qualityDimensions?.empathy ?? 0,
          objectionHandling: analysis.qualityDimensions?.objectionHandling ?? 0,
          qualification: analysis.qualityDimensions?.qualification ?? 0,
          closing: analysis.qualityDimensions?.closing ?? 0,
          disposition: analysis.dispositionReview?.expectedDisposition || lead.session_disposition || 'N/A',
          qualified: qualified,
          qaStatus: lead.qa_status,
        });

      } catch (err: any) {
        console.error(`  -> Error: ${err.message}`);
        failed++;
      }

      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }

    // Phase 2: Re-evaluate already-scored leads using existing scores
    console.log(`\n${'─'.repeat(80)}`);
    console.log('PHASE 2: Re-evaluating already-scored leads');
    console.log('─'.repeat(80));

    for (const lead of alreadyScored) {
      // Read existing quality record
      const { rows: [qr] } = await client.query(`
        SELECT overall_quality_score, engagement_score, clarity_score,
               empathy_score, objection_handling_score, qualification_score, closing_score,
               assigned_disposition, expected_disposition, sentiment
        FROM call_quality_records
        WHERE id = $1
      `, [lead.existing_quality_record_id]);

      if (!qr) continue;

      const convQuality = computeConversationQuality({
        engagement: qr.engagement_score,
        clarity: qr.clarity_score,
        empathy: qr.empathy_score,
        objectionHandling: qr.objection_handling_score,
        qualification: qr.qualification_score,
        closing: qr.closing_score,
      });
      const qualified = convQuality >= 70;

      allResults.push({
        leadId: lead.lead_id,
        name: lead.contact_name || '?',
        campaign: lead.campaign_name || '?',
        overallScore: qr.overall_quality_score || 0,
        convQualityScore: convQuality,
        engagement: qr.engagement_score || 0,
        clarity: qr.clarity_score || 0,
        empathy: qr.empathy_score || 0,
        objectionHandling: qr.objection_handling_score || 0,
        qualification: qr.qualification_score || 0,
        closing: qr.closing_score || 0,
        disposition: qr.expected_disposition || qr.assigned_disposition || 'N/A',
        qualified: qualified,
        qaStatus: lead.qa_status,
      });
    }

    // ═══════════════ FINAL REPORT ═══════════════
    const qualifying = allResults.filter(r => r.qualified).sort((a, b) => b.convQualityScore - a.convQualityScore);
    const nonQualifying = allResults.filter(r => !r.qualified).sort((a, b) => b.convQualityScore - a.convQualityScore);

    console.log(`\n${'═'.repeat(80)}`);
    console.log('FINAL REPORT: Conversation Quality Qualification (>= 70)');
    console.log('═'.repeat(80));
    console.log(`  Total analyzed:     ${allResults.length}`);
    console.log(`  QUALIFY (>= 70):    ${qualifying.length}`);
    console.log(`  NOT QUALIFY (< 70): ${nonQualifying.length}`);
    console.log(`  Scoring failed:     ${failed}`);

    if (allResults.length > 0) {
      const scores = allResults.map(r => r.convQualityScore);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      console.log(`  Avg Conv Quality:   ${avg.toFixed(1)}`);
    }

    // Campaign breakdown
    const byCampaign: Record<string, { qualify: number; notQualify: number }> = {};
    for (const r of allResults) {
      const c = r.campaign.substring(0, 40);
      if (!byCampaign[c]) byCampaign[c] = { qualify: 0, notQualify: 0 };
      if (r.qualified) byCampaign[c].qualify++;
      else byCampaign[c].notQualify++;
    }
    console.log('\nBy Campaign:');
    for (const [camp, data] of Object.entries(byCampaign).sort((a, b) => (b[1].qualify + b[1].notQualify) - (a[1].qualify + a[1].notQualify))) {
      console.log(`  ${camp.padEnd(42)} Qualify: ${String(data.qualify).padStart(3)} | Not: ${String(data.notQualify).padStart(3)}`);
    }

    // Qualifying leads detail
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`QUALIFYING LEADS (Conv Quality >= 70) — ${qualifying.length} leads`);
    console.log('═'.repeat(80));
    for (let i = 0; i < qualifying.length; i++) {
      const r = qualifying[i];
      console.log(`  #${String(i+1).padStart(3)} | CQ:${String(r.convQualityScore).padStart(3)} | OA:${String(r.overallScore).padStart(3)} | ${r.name.padEnd(28)} | ${r.campaign.substring(0,28).padEnd(28)} | Eng:${r.engagement} Cla:${r.clarity} Emp:${r.empathy} OH:${r.objectionHandling} Q:${r.qualification} Cl:${r.closing} | ${r.disposition}`);
    }

    // Non-qualifying
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`NON-QUALIFYING LEADS (Conv Quality < 70) — ${nonQualifying.length} leads`);
    console.log('═'.repeat(80));
    for (let i = 0; i < nonQualifying.length; i++) {
      const r = nonQualifying[i];
      console.log(`  #${String(i+1).padStart(3)} | CQ:${String(r.convQualityScore).padStart(3)} | OA:${String(r.overallScore).padStart(3)} | ${r.name.padEnd(28)} | ${r.campaign.substring(0,28).padEnd(28)} | Eng:${r.engagement} Cla:${r.clarity} Emp:${r.empathy} OH:${r.objectionHandling} Q:${r.qualification} Cl:${r.closing} | ${r.disposition}`);
    }

    // Score distribution
    console.log(`\n${'═'.repeat(80)}`);
    console.log('CONVERSATION QUALITY SCORE DISTRIBUTION');
    console.log('═'.repeat(80));
    const dist = [
      { label: '90-100', min: 90, max: 100 },
      { label: '80-89 ', min: 80, max: 89  },
      { label: '70-79 ', min: 70, max: 79  },
      { label: '60-69 ', min: 60, max: 69  },
      { label: '50-59 ', min: 50, max: 59  },
      { label: '40-49 ', min: 40, max: 49  },
      { label: '30-39 ', min: 30, max: 39  },
      { label: '20-29 ', min: 20, max: 29  },
      { label: '0-19  ', min: 0,  max: 19  },
    ];
    for (const d of dist) {
      const count = allResults.filter(r => r.convQualityScore >= d.min && r.convQualityScore <= d.max).length;
      const bar = '█'.repeat(Math.min(count, 50));
      console.log(`  ${d.label} | ${String(count).padStart(3)} ${bar}`);
    }

    console.log(`\n${'═'.repeat(80)}`);
    console.log('ANALYSIS COMPLETE');
    console.log('═'.repeat(80));

  } finally {
    client.release();
    await pool.end();
  }
}

batchReanalyze().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
