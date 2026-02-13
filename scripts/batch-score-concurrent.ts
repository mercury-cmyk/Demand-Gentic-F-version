/**
 * Concurrent batch scorer for QA leads.
 * - 5 parallel workers
 * - Skips already-scored leads
 * - Retry with exponential backoff
 * - Saves results to DB immediately per lead
 */
import { pool } from '../server/db';
import { analyzeConversationQuality } from '../server/services/conversation-quality-analyzer';

const CONCURRENCY = 5;
const MAX_RETRIES = 2;
const QUALIFY_THRESHOLD = 70;

// Weighted conversation quality score
function calcConvQ(dims: any): number {
  return Math.round(
    (dims.clarity || 0) * 0.25 +
    (dims.engagement || 0) * 0.20 +
    (dims.empathy || 0) * 0.15 +
    (dims.objectionHandling || 0) * 0.15 +
    (dims.qualification || 0) * 0.15 +
    (dims.closing || 0) * 0.10
  );
}

interface LeadRow {
  lead_id: string;
  contact_name: string;
  campaign_name: string;
  campaign_id: string;
  transcript: string;
  call_session_id: string | null;
  telnyx_call_id: string | null;
  contact_id: string;
  ai_disposition: string | null;
  call_duration: number | null;
  contact_phone: string | null;
  dialed_number: string | null;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function scoreOneLead(lead: LeadRow, index: number, total: number): Promise<{
  lead_id: string; name: string; campaign: string; overall: number; convQ: number; qualified: boolean; error?: string;
}> {
  const label = `[${index + 1}/${total}] ${lead.contact_name} | ${lead.campaign_name}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await analyzeConversationQuality({
        transcript: lead.transcript,
        interactionType: 'live_call',
        analysisStage: 'post_call',
        callDurationSeconds: lead.call_duration || undefined,
        disposition: lead.ai_disposition || undefined,
        campaignId: lead.campaign_id,
        campaignName: lead.campaign_name,
        contactName: lead.contact_name,
      });

      const dims = result.qualityDimensions;
      const convQ = calcConvQ(dims);
      const qualified = convQ >= QUALIFY_THRESHOLD;
      const tag = qualified ? '✓ QUALIFIES' : 'below 70';

      // Ensure call_session exists
      let csId = lead.call_session_id;
      if (!csId) {
        const client = await pool.connect();
        try {
          const ins = await client.query(`
            INSERT INTO call_sessions (id, telnyx_call_id, campaign_id, contact_id, status, to_number_e164, created_at)
            VALUES (gen_random_uuid(), $1, $2, $3, 'completed', $4, NOW())
            ON CONFLICT (telnyx_call_id) DO UPDATE SET campaign_id = EXCLUDED.campaign_id
            RETURNING id
          `, [
            lead.telnyx_call_id || `batch-${lead.lead_id}`,
            lead.campaign_id,
            lead.contact_id,
            lead.contact_phone || lead.dialed_number || '+10000000000'
          ]);
          csId = ins.rows[0].id;
        } finally { client.release(); }
      }

      // Save quality record
      const client = await pool.connect();
      try {
        await client.query(`
          INSERT INTO call_quality_records (
            id, call_session_id, campaign_id, contact_id,
            overall_quality_score, clarity_score, engagement_score, empathy_score,
            objection_handling_score, qualification_score, closing_score,
            sentiment, engagement_level, identity_confirmed, qualification_met,
            issues, recommendations, breakdowns, prompt_updates, performance_gaps, next_best_actions,
            campaign_alignment_score, context_usage_score, talking_points_coverage_score, missed_talking_points,
            flow_compliance_score, missed_steps, flow_deviations,
            assigned_disposition, expected_disposition, disposition_accurate, disposition_notes,
            transcript_length, transcript_truncated, full_transcript,
            analysis_model, analysis_stage, interaction_type, analyzed_at, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3,
            $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24,
            $25, $26, $27,
            $28, $29, $30, $31,
            $32, $33, $34,
            $35, $36, $37, NOW(), NOW(), NOW()
          )
        `, [
          csId, lead.campaign_id, lead.contact_id,
          result.overallScore,
          dims.clarity, dims.engagement, dims.empathy,
          dims.objectionHandling, dims.qualification, dims.closing,
          result.learningSignals?.sentiment || null,
          result.learningSignals?.engagementLevel || null,
          null, // identity_confirmed
          result.qualificationAssessment?.metCriteria || false,
          JSON.stringify(result.issues || []),
          JSON.stringify(result.recommendations || []),
          JSON.stringify(result.breakdowns || []),
          JSON.stringify(result.promptUpdates || []),
          JSON.stringify(result.performanceGaps || []),
          JSON.stringify(result.nextBestActions || []),
          result.campaignAlignment?.objectiveAdherence || null,
          result.campaignAlignment?.contextUsage || null,
          result.campaignAlignment?.talkingPointsCoverage || null,
          JSON.stringify(result.campaignAlignment?.missedTalkingPoints || []),
          result.flowCompliance?.score || null,
          JSON.stringify(result.flowCompliance?.missedSteps || []),
          JSON.stringify(result.flowCompliance?.deviations || []),
          result.dispositionReview?.assignedDisposition || lead.ai_disposition || null,
          result.dispositionReview?.expectedDisposition || null,
          result.dispositionReview?.isAccurate ?? null,
          JSON.stringify(result.dispositionReview?.notes || []),
          lead.transcript.length,
          false,
          lead.transcript.substring(0, 50000),
          result.metadata?.model || 'vertex-ai-gemini',
          'post_call',
          'live_call',
        ]);
      } finally { client.release(); }

      console.log(`${label} -> Overall:${result.overallScore} ConvQ:${convQ} ${tag}`);
      return { lead_id: lead.lead_id, name: lead.contact_name, campaign: lead.campaign_name, overall: result.overallScore, convQ, qualified };
    } catch (err: any) {
      if (attempt < MAX_RETRIES) {
        const wait = 2000 * (attempt + 1);
        console.log(`${label} RETRY ${attempt + 1} after ${wait}ms: ${err.message?.substring(0, 80)}`);
        await sleep(wait);
      } else {
        console.log(`${label} FAILED after ${MAX_RETRIES + 1} attempts: ${err.message?.substring(0, 100)}`);
        return { lead_id: lead.lead_id, name: lead.contact_name, campaign: lead.campaign_name, overall: 0, convQ: 0, qualified: false, error: err.message };
      }
    }
  }
  // Should never reach here
  return { lead_id: lead.lead_id, name: lead.contact_name, campaign: lead.campaign_name, overall: 0, convQ: 0, qualified: false, error: 'unknown' };
}

async function main() {
  const startTime = Date.now();
  const client = await pool.connect();

  // Get all unscored QA leads with transcripts
  const { rows: leads } = await client.query<LeadRow>(`
    SELECT
      l.id as lead_id,
      COALESCE(c.first_name || ' ' || c.last_name, 'Unknown') as contact_name,
      camp.name as campaign_name,
      camp.id as campaign_id,
      COALESCE(l.transcript, l.notes) as transcript,
      cs.id as call_session_id,
      l.telnyx_call_id,
      l.contact_id,
      cs.ai_disposition,
      l.call_duration,
      c.direct_phone as contact_phone,
      cs.to_number_e164 as dialed_number
    FROM leads l
    JOIN contacts c ON l.contact_id = c.id
    JOIN campaigns camp ON l.campaign_id = camp.id
    LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
    LEFT JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
    WHERE l.deleted_at IS NULL
      AND l.qa_status IN ('new', 'under_review')
      AND cqr.id IS NULL
      AND COALESCE(l.transcript, l.notes) IS NOT NULL
      AND LENGTH(COALESCE(l.transcript, l.notes)) > 20
    ORDER BY camp.name, l.created_at
  `);
  client.release();

  console.log('='.repeat(70));
  console.log(`CONCURRENT BATCH SCORING: ${leads.length} unscored leads (${CONCURRENCY} workers)`);
  console.log('='.repeat(70));

  if (leads.length === 0) {
    console.log('No unscored leads found. All done!');
    await pool.end();
    return;
  }

  // Process with concurrency pool
  const results: Awaited<ReturnType<typeof scoreOneLead>>[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < leads.length) {
      const idx = nextIndex++;
      const result = await scoreOneLead(leads[idx], idx, leads.length);
      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, leads.length) }, () => worker());
  await Promise.all(workers);

  // Report
  const qualifying = results.filter(r => r.qualified && !r.error);
  const nonQualifying = results.filter(r => !r.qualified && !r.error);
  const errors = results.filter(r => r.error);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(70));
  console.log(`RESULTS (${elapsed}s elapsed)`);
  console.log('='.repeat(70));
  console.log(`Total scored: ${results.length}`);
  console.log(`Qualifying (ConvQ >= 70): ${qualifying.length}`);
  console.log(`Non-qualifying: ${nonQualifying.length}`);
  console.log(`Errors: ${errors.length}`);

  if (qualifying.length > 0) {
    console.log('\n--- QUALIFYING LEADS ---');
    qualifying.sort((a, b) => b.convQ - a.convQ);
    for (const r of qualifying) {
      console.log(`  ConvQ:${r.convQ} Overall:${r.overall} | ${r.name} | ${r.campaign}`);
    }
  }

  if (errors.length > 0) {
    console.log('\n--- ERRORS ---');
    for (const r of errors) {
      console.log(`  ${r.name} | ${r.campaign} | ${r.error?.substring(0, 100)}`);
    }
  }

  // Campaign breakdown
  const byCampaign: Record<string, { total: number; qualify: number }> = {};
  for (const r of results) {
    if (!byCampaign[r.campaign]) byCampaign[r.campaign] = { total: 0, qualify: 0 };
    byCampaign[r.campaign].total++;
    if (r.qualified) byCampaign[r.campaign].qualify++;
  }
  console.log('\n--- BY CAMPAIGN ---');
  for (const [name, stats] of Object.entries(byCampaign)) {
    console.log(`  ${name}: ${stats.qualify}/${stats.total} qualify`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
