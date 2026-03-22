/**
 * Batch quality-score ALL leads in the QA pipeline (new + under_review)
 * that have transcripts but no quality scores.
 * 
 * Uses analyzeConversationQuality to score calls, stores in call_quality_records.
 * Processes in batches with rate limiting for API calls.
 */

import { pool } from '../server/db';
import { analyzeConversationQuality } from '../server/services/conversation-quality-analyzer';

const BATCH_DELAY_MS = 1500; // delay between API calls

async function batchScoreLeads() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('BATCH QUALITY SCORING: All QA Pipeline Leads');
    console.log('='.repeat(80));
    console.log(`Run at: ${new Date().toISOString()}\n`);

    // Find all leads in QA pipeline with transcripts but no quality score
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
        cs.contact_id AS session_contact_id
      FROM leads l
      LEFT JOIN campaigns c2 ON l.campaign_id = c2.id
      LEFT JOIN contacts ct ON l.contact_id = ct.id
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN LATERAL (
        SELECT cqr2.id FROM call_quality_records cqr2
        WHERE cqr2.call_session_id = cs.id
        LIMIT 1
      ) existing_cqr ON true
      WHERE l.qa_status IN ('new', 'under_review')
        AND l.deleted_at IS NULL
        AND (l.transcript IS NOT NULL AND length(l.transcript) > 20)
        AND existing_cqr.id IS NULL
      ORDER BY l.created_at DESC
    `);

    console.log(`Found ${leads.length} leads needing quality scores\n`);

    if (leads.length === 0) {
      console.log('All leads with transcripts already have quality scores.');
      return;
    }

    let scored = 0;
    let failed = 0;
    let skipped = 0;
    const results: { name: string; score: number | null; status: string }[] = [];

    for (let i = 0; i  Analysis failed: ${analysis.issues?.map((i: any) => i.description || i).join(', ')}`);
          results.push({ name: lead.contact_name, score: null, status: 'analysis_failed' });
          failed++;
          continue;
        }

        console.log(`  -> Score: ${analysis.overallScore} | Qual: ${analysis.qualityDimensions?.qualification} | Disp: ${analysis.dispositionReview?.expectedDisposition || 'N/A'}`);

        // Ensure we have a call_session_id for the quality record
        let sessionId = lead.call_session_id;
        if (!sessionId) {
          const { rows: [newSession] } = await client.query(`
            INSERT INTO call_sessions (
              campaign_id, contact_id, telnyx_call_id,
              ai_transcript, ai_disposition, 
              duration_sec, status, to_number_e164,
              created_at
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
            $1, $2, $3,
            $4, $5, $6, $7, $8, $9, $10,
            $11, $12,
            $13, $14,
            $15, $16, $17,
            $18, $19,
            $20, $21, $22,
            $23, $24, $25, $26,
            $27, $28, $29, $30,
            $31, $32,
            $33, $34, $35, NOW(),
            NOW(), NOW()
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
          'post_call',
          'live_call',
        ]);

        scored++;
        results.push({ name: lead.contact_name, score: analysis.overallScore, status: 'scored' });

      } catch (err: any) {
        console.error(`  -> Error: ${err.message}`);
        results.push({ name: lead.contact_name, score: null, status: 'error' });
        failed++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('BATCH SCORING COMPLETE');
    console.log('='.repeat(80));
    console.log(`  Total processed:    ${leads.length}`);
    console.log(`  Scored:             ${scored}`);
    console.log(`  Failed:             ${failed}`);
    console.log(`  Skipped:            ${skipped}`);

    // Score summary
    const scoredResults = results.filter(r => r.score !== null);
    if (scoredResults.length > 0) {
      const scores = scoredResults.map(r => r.score!);
      const qualifying = scores.filter(s => s >= 50).length;
      const nonQualifying = scores.filter(s => s  a + b, 0) / scores.length;
      console.log(`\n  Score >= 50 (QUALIFY):    ${qualifying}`);
      console.log(`  Score  r.score! >= 50).sort((a, b) => b.score! - a.score!)) {
        console.log(`    Score: ${String(r.score).padStart(3)} | ${r.name}`);
      }
    }

    console.log('='.repeat(80));

  } finally {
    client.release();
    await pool.end();
  }
}

batchScoreLeads().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});