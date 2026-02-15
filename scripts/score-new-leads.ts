/**
 * Run quality analysis on leads with qaStatus='new' that have transcripts but no quality scores.
 * Uses analyzeConversationQuality to score the calls, then stores results in call_quality_records.
 */

import { pool } from '../server/db';
import { analyzeConversationQuality } from '../server/services/conversation-quality-analyzer';

async function scoreNewLeads() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('QUALITY ANALYSIS: Score "New" Leads with Transcripts');
    console.log('='.repeat(80));
    console.log(`Run at: ${new Date().toISOString()}\n`);

    // Find leads with qa_status='new', have transcript, but no quality record
    const { rows: leads } = await client.query(`
      SELECT 
        l.id AS lead_id,
        l.contact_name,
        l.account_name,
        l.campaign_id,
        l.contact_id,
        l.transcript,
        l.call_duration,
        l.telnyx_call_id,
        c2.name AS campaign_name,
        c2.campaign_objective,
        c2.campaign_context_brief,
        cs.id AS call_session_id,
        cs.ai_transcript AS session_transcript,
        cs.ai_disposition AS disposition,
        cs.contact_id AS session_contact_id,
        ct.direct_phone AS contact_phone,
        l.dialed_number
      FROM leads l
      LEFT JOIN campaigns c2 ON l.campaign_id = c2.id
      LEFT JOIN contacts ct ON l.contact_id = ct.id
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN call_quality_records cqr ON (cqr.call_session_id = cs.id OR cqr.contact_id = l.contact_id)
      WHERE l.qa_status = 'new'
        AND l.deleted_at IS NULL
        AND l.transcript IS NOT NULL
        AND length(l.transcript) > 20
        AND cqr.id IS NULL
      ORDER BY l.created_at DESC
    `);

    console.log(`Found ${leads.length} leads with transcripts but no quality scores\n`);

    if (leads.length === 0) {
      console.log('All leads with transcripts already have quality scores.');
      return;
    }

    let scored = 0;
    let failed = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const transcript = lead.transcript || lead.session_transcript;
      console.log(`\n[${i + 1}/${leads.length}] ${lead.contact_name || 'Unknown'} | ${lead.campaign_name || 'N/A'} | ${lead.call_duration || '?'}s`);
      console.log(`  Transcript: ${transcript.length} chars`);

      try {
        // Run quality analysis
        const analysis = await analyzeConversationQuality({
          transcript,
          interactionType: 'live_call',
          analysisStage: 'post_call',
          callDurationSeconds: lead.call_duration || undefined,
          disposition: lead.disposition || undefined,
          campaignId: lead.campaign_id || undefined,
          campaignName: lead.campaign_name || undefined,
          campaignObjective: lead.campaign_objective || undefined,
          contactName: lead.contact_name || undefined,
          accountName: lead.account_name || undefined,
        });

        if (analysis.status !== 'ok') {
          console.log(`  -> Analysis returned status: ${analysis.status}`);
          console.log(`  -> Issues: ${analysis.issues?.map((i: any) => i.description || i).join(', ')}`);
          failed++;
          continue;
        }

        console.log(`  -> Overall Score: ${analysis.overallScore}`);
        console.log(`  -> Engagement: ${analysis.qualityDimensions?.engagement} | Clarity: ${analysis.qualityDimensions?.clarity} | Empathy: ${analysis.qualityDimensions?.empathy}`);
        console.log(`  -> Qualification: ${analysis.qualityDimensions?.qualification} | Closing: ${analysis.qualityDimensions?.closing}`);
        console.log(`  -> Disposition: assigned=${analysis.dispositionReview?.assignedDisposition} expected=${analysis.dispositionReview?.expectedDisposition}`);

        // We need a call_session_id for the quality record. Create one if needed.
        let sessionId = lead.call_session_id;
        if (!sessionId) {
          // Create a minimal call_session so we can store the quality record
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
            lead.disposition,
            lead.call_duration,
            lead.contact_phone || lead.dialed_number || '+0000000000',
          ]);
          sessionId = newSession.id;
          console.log(`  -> Created call_session: ${sessionId}`);
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
          analysis.dispositionReview?.assignedDisposition || lead.disposition || null,
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
        console.log(`  -> Quality record saved!`);

      } catch (err: any) {
        console.error(`  -> Error: ${err.message}`);
        failed++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 2000));
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('QUALITY ANALYSIS COMPLETE');
    console.log('='.repeat(80));
    console.log(`  Total leads:    ${leads.length}`);
    console.log(`  Scored:         ${scored}`);
    console.log(`  Failed:         ${failed}`);
    console.log('='.repeat(80));

  } finally {
    client.release();
    await pool.end();
  }
}

scoreNewLeads().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
