/**
 * Batch scorer - processes ALL unscored leads in batches of 100.
 * - 5 parallel workers per batch
 * - Skips already-scored leads
 * - Retry with backoff
 * - Saves to DB immediately per lead
 * - Runs continuously until all done
 */
import { pool } from '../server/db';
import { analyzeConversationQuality } from '../server/services/conversation-quality-analyzer';

const CONCURRENCY = 1;
const BATCH_SIZE = 50;
const MAX_RETRIES = 2;
const QUALIFY_THRESHOLD = 70;

// Prevent silent crashes
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

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
  lead_id: string; contact_name: string; campaign_name: string; campaign_id: string;
  transcript: string; call_session_id: string | null; telnyx_call_id: string | null;
  contact_id: string; ai_disposition: string | null; call_duration: number | null;
  contact_phone: string | null; dialed_number: string | null; qa_status: string;
}

interface Result {
  lead_id: string; name: string; campaign: string; overall: number;
  convQ: number; qualified: boolean; error?: string;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function withRetryDB(fn: () => Promise, label: string): Promise {
  for (let i = 0; i  {
  if (lead.call_session_id) return lead.call_session_id;

  return withRetryDB(async () => {
    const client = await pool.connect();
    try {
      if (lead.telnyx_call_id) {
        const existing = await client.query(
          `SELECT id FROM call_sessions WHERE telnyx_call_id = $1 LIMIT 1`,
          [lead.telnyx_call_id]
        );
        if (existing.rows.length > 0) return existing.rows[0].id;
      }
      const ins = await client.query(`
        INSERT INTO call_sessions (id, telnyx_call_id, campaign_id, contact_id, status, to_number_e164, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, 'completed', $4, NOW())
        RETURNING id
      `, [
        lead.telnyx_call_id || `batch-${lead.lead_id}`,
        lead.campaign_id, lead.contact_id,
        lead.contact_phone || lead.dialed_number || '+10000000000'
      ]);
      return ins.rows[0].id;
    } finally { client.release(); }
  }, 'ensureCallSession');
}

async function saveQualityRecord(csId: string, lead: LeadRow, result: any) {
  const dims = result.qualityDimensions;
  return withRetryDB(async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO call_quality_records (
        id, call_session_id, campaign_id, contact_id,
        overall_quality_score, clarity_score, engagement_score, empathy_score,
        objection_handling_score, qualification_score, closing_score,
        sentiment, engagement_level, qualification_met,
        issues, recommendations, breakdowns, prompt_updates, performance_gaps, next_best_actions,
        campaign_alignment_score, context_usage_score, talking_points_coverage_score, missed_talking_points,
        flow_compliance_score, missed_steps, flow_deviations,
        assigned_disposition, expected_disposition, disposition_accurate, disposition_notes,
        transcript_length, transcript_truncated, full_transcript,
        analysis_model, analysis_stage, interaction_type, analyzed_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3,
        $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, $26,
        $27, $28, $29, $30,
        $31, $32, $33,
        $34, $35, $36, NOW(), NOW(), NOW()
      )
    `, [
      csId, lead.campaign_id, lead.contact_id,
      result.overallScore,
      dims.clarity, dims.engagement, dims.empathy,
      dims.objectionHandling, dims.qualification, dims.closing,
      result.learningSignals?.sentiment || null,
      result.learningSignals?.engagementLevel || null,
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
      lead.transcript.length, false, lead.transcript.substring(0, 50000),
      result.metadata?.model || 'vertex-ai-gemini', 'post_call', 'live_call',
    ]);
  } finally { client.release(); }
  }, 'saveQualityRecord');
}

async function scoreOneLead(lead: LeadRow, index: number, batchOffset: number, grandTotal: number): Promise {
  const globalIdx = batchOffset + index + 1;
  const label = `[${globalIdx}/${grandTotal}] ${lead.contact_name}`;

  for (let attempt = 0; attempt = QUALIFY_THRESHOLD;

      const csId = await ensureCallSession(lead);
      await saveQualityRecord(csId, lead, result);

      // Update ai_score for ALL leads and push qualifying ones to QA
      await withRetryDB(async () => {
        const qc = await pool.connect();
        try {
          if (qualified) {
            await qc.query(`
              UPDATE leads 
              SET ai_score = $1,
                  ai_qualification_status = 'qualified',
                  qa_status = CASE WHEN qa_status NOT IN ('approved', 'published') THEN 'under_review' ELSE qa_status END,
                  updated_at = NOW()
              WHERE id = $2
            `, [convQ, lead.lead_id]);
          } else {
            await qc.query(`
              UPDATE leads 
              SET ai_score = $1,
                  updated_at = NOW()
              WHERE id = $2
            `, [convQ, lead.lead_id]);
          }
        } finally { qc.release(); }
      }, 'updateAiScore');

      const tag = qualified ? '✓ QUALIFIES → QA' : `below 70`;
      console.log(`${label} | O:${result.overallScore} CQ:${convQ} ${tag}`);
      return { lead_id: lead.lead_id, name: lead.contact_name, campaign: lead.campaign_name, overall: result.overallScore, convQ, qualified };
    } catch (err: any) {
      if (attempt  {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        l.id as lead_id,
        COALESCE(c.first_name || ' ' || c.last_name, 'Unknown') as contact_name,
        camp.name as campaign_name, camp.id as campaign_id,
        l.transcript, cs.id as call_session_id, l.telnyx_call_id,
        l.contact_id, cs.ai_disposition, l.call_duration,
        c.direct_phone as contact_phone, cs.to_number_e164 as dialed_number,
        l.qa_status
      FROM leads l
      JOIN contacts c ON l.contact_id = c.id
      JOIN campaigns camp ON l.campaign_id = camp.id
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
      WHERE l.deleted_at IS NULL
        AND cqr.id IS NULL
        AND l.transcript IS NOT NULL
        AND LENGTH(l.transcript) > 20
      ORDER BY l.created_at
      LIMIT ${BATCH_SIZE} OFFSET 0
    `);
    return rows;
  } finally { client.release(); }
}

async function main() {
  const startTime = Date.now();
  const allResults: Result[] = [];
  let batchNum = 0;

  // Get total count
  const countClient = await pool.connect();
  const { rows: [{ cnt }] } = await countClient.query(`
    SELECT COUNT(*) as cnt FROM leads l
    LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
    LEFT JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
    WHERE l.deleted_at IS NULL AND cqr.id IS NULL
      AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
  `);
  countClient.release();
  const grandTotal = parseInt(cnt);

  console.log('='.repeat(70));
  console.log(`BATCH SCORING: ${grandTotal} unscored leads | Batch size: ${BATCH_SIZE} | Workers: ${CONCURRENCY}`);
  console.log('='.repeat(70));

  while (true) {
    const batch = await fetchBatch(0); // Always offset 0 since scored ones drop out
    if (batch.length === 0) break;

    batchNum++;
    const remaining = grandTotal - allResults.length;
    console.log(`\n--- Batch ${batchNum}: ${batch.length} leads (${remaining} remaining) ---`);

    const batchResults: Result[] = [];
    let nextIndex = 0;

    async function worker() {
      while (nextIndex  worker());
    await Promise.all(workers);

    allResults.push(...batchResults);
    const batchQualify = batchResults.filter(r => r.qualified).length;
    const batchErrors = batchResults.filter(r => r.error).length;
    console.log(`  Batch ${batchNum} done: ${batchResults.length} scored, ${batchQualify} qualify, ${batchErrors} errors`);
  }

  // Final report
  const qualifying = allResults.filter(r => r.qualified && !r.error);
  const nonQualifying = allResults.filter(r => !r.qualified && !r.error);
  const errors = allResults.filter(r => r.error);
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(70));
  console.log(`FINAL RESULTS (${elapsed} min)`);
  console.log('='.repeat(70));
  console.log(`Total scored: ${allResults.length}`);
  console.log(`Qualifying (ConvQ >= 70): ${qualifying.length}`);
  console.log(`Non-qualifying: ${nonQualifying.length}`);
  console.log(`Errors: ${errors.length}`);

  if (qualifying.length > 0) {
    console.log('\n--- ALL QUALIFYING LEADS ---');
    qualifying.sort((a, b) => b.convQ - a.convQ);
    for (const r of qualifying) {
      console.log(`  CQ:${r.convQ} O:${r.overall} | ${r.name} | ${r.campaign}`);
    }
  }

  // Campaign breakdown
  const byCampaign: Record = {};
  for (const r of allResults) {
    if (!byCampaign[r.campaign]) byCampaign[r.campaign] = { total: 0, qualify: 0 };
    byCampaign[r.campaign].total++;
    if (r.qualified) byCampaign[r.campaign].qualify++;
  }
  console.log('\n--- BY CAMPAIGN ---');
  for (const [name, stats] of Object.entries(byCampaign)) {
    console.log(`  ${name}: ${stats.qualify}/${stats.total} qualify`);
  }

  if (errors.length > 0) {
    console.log(`\n--- ${errors.length} ERRORS ---`);
    for (const r of errors.slice(0, 20)) {
      console.log(`  ${r.name} | ${r.error?.substring(0, 80)}`);
    }
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });