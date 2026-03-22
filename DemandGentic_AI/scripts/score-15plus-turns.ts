/**
 * Score 66 unscored leads with 15+ conversation turns.
 * Uses interest-based scoring (qualification 40%, engagement 30%, closing 20%, empathy 10%).
 * 3 workers, auto-updates ai_score and pushes qualifying to QA.
 */
import { pool } from '../server/db';
import { analyzeConversationQuality } from '../server/services/conversation-quality-analyzer';

const CONCURRENCY = 3;
const QUALIFY_THRESHOLD = 70;

process.on('unhandledRejection', (err) => console.error('UNHANDLED:', err));
process.on('uncaughtException', (err) => console.error('UNCAUGHT:', err));

function countTurns(transcript: string): number {
  const t = transcript.trim();
  if (t.startsWith('[{')) {
    try { const arr = JSON.parse(t); if (Array.isArray(arr)) return arr.length; } catch {}
  }
  return t.split('\n').filter(l => l.trim().length > 0).length;
}

function calcInterestScore(dims: any): number {
  return Math.round(
    (dims.qualification || 0) * 0.40 +
    (dims.engagement || 0) * 0.30 +
    (dims.closing || 0) * 0.20 +
    (dims.empathy || 0) * 0.10
  );
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function withRetryDB(fn: () => Promise, label: string): Promise {
  for (let i = 0; i  {
  if (lead.call_session_id) return lead.call_session_id;
  return withRetryDB(async () => {
    const client = await pool.connect();
    try {
      if (lead.telnyx_call_id) {
        const existing = await client.query(`SELECT id FROM call_sessions WHERE telnyx_call_id = $1 LIMIT 1`, [lead.telnyx_call_id]);
        if (existing.rows.length > 0) return existing.rows[0].id;
      }
      const ins = await client.query(`
        INSERT INTO call_sessions (id, telnyx_call_id, campaign_id, contact_id, status, to_number_e164, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, 'completed', $4, NOW()) RETURNING id
      `, [lead.telnyx_call_id || `batch-${lead.lead_id}`, lead.campaign_id, lead.contact_id, lead.contact_phone || lead.dialed_number || '+10000000000']);
      return ins.rows[0].id;
    } finally { client.release(); }
  }, 'ensureCallSession');
}

async function saveQualityRecord(csId: string, lead: Lead, result: any) {
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

async function scoreOne(lead: Lead, idx: number, total: number) {
  const label = `[${idx+1}/${total}] ${lead.contact_name} (${lead.turns}t)`;
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
    const interestScore = calcInterestScore(dims);
    const qualMet = result.qualificationAssessment?.metCriteria === true;
    const qualified = qualMet || interestScore >= QUALIFY_THRESHOLD;

    const csId = await ensureCallSession(lead);
    await saveQualityRecord(csId, lead, result);

    await withRetryDB(async () => {
      const qc = await pool.connect();
      try {
        if (qualified) {
          await qc.query(`
            UPDATE leads SET ai_score = $1, ai_qualification_status = 'qualified',
              qa_status = CASE WHEN qa_status NOT IN ('approved','published') THEN 'under_review' ELSE qa_status END,
              updated_at = NOW() WHERE id = $2
          `, [interestScore, lead.lead_id]);
        } else {
          await qc.query(`UPDATE leads SET ai_score = $1, updated_at = NOW() WHERE id = $2`, [interestScore, lead.lead_id]);
        }
      } finally { qc.release(); }
    }, 'updateLead');

    const tag = qualified ? (qualMet ? '✓ INTEREST CONFIRMED' : '✓ HIGH INTEREST') : 'low interest';
    const dispo = result.dispositionReview?.expectedDisposition || '-';
    console.log(`${label} | IS:${interestScore} O:${result.overallScore} | ${dispo} | ${tag}`);
    return { name: lead.contact_name, interestScore, qualified, error: false };
  } catch (err: any) {
    console.log(`${label} | FAILED: ${err.message?.substring(0, 80)}`);
    return { name: lead.contact_name, interestScore: 0, qualified: false, error: true };
  }
}

async function main() {
  const start = Date.now();
  const client = await pool.connect();
  
  const { rows: allRows } = await client.query(`
    SELECT
      l.id as lead_id, COALESCE(c.first_name || ' ' || c.last_name, 'Unknown') as contact_name,
      camp.name as campaign_name, camp.id as campaign_id,
      l.transcript, cs.id as call_session_id, l.telnyx_call_id,
      l.contact_id, cs.ai_disposition, l.call_duration,
      c.direct_phone as contact_phone, cs.to_number_e164 as dialed_number, l.qa_status
    FROM leads l
    JOIN contacts c ON l.contact_id = c.id
    JOIN campaigns camp ON l.campaign_id = camp.id
    LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
    LEFT JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
    WHERE l.deleted_at IS NULL AND cqr.id IS NULL
      AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
    ORDER BY l.created_at
  `);
  client.release();

  const leads: Lead[] = [];
  for (const row of allRows) {
    const turns = countTurns(row.transcript);
    if (turns >= 15) leads.push({ ...row, turns });
  }

  console.log('='.repeat(60));
  console.log(`SCORING ${leads.length} LEADS WITH 15+ TURNS | Workers: ${CONCURRENCY}`);
  console.log('='.repeat(60));

  const results: any[] = [];
  let nextIdx = 0;

  async function worker() {
    while (nextIdx  worker()));

  const qualified = results.filter(r => r.qualified && !r.error);
  const errors = results.filter(r => r.error);
  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log(`DONE (${elapsed} min) | Scored: ${results.length} | Qualified: ${qualified.length} | Errors: ${errors.length}`);
  console.log('='.repeat(60));

  if (qualified.length > 0) {
    console.log('\nQualifying leads (prospect showed interest):');
    qualified.sort((a, b) => b.interestScore - a.interestScore);
    for (const r of qualified) console.log(`  IS:${r.interestScore} | ${r.name}`);
  }

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });