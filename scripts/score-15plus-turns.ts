/**
 * Score 66 unscored leads with 15+ conversation turns.
 * Uses interest-based scoring (qualification_met, expected_disposition, interest score).
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

const INTEREST_DISPOSITIONS = [
  'success', 'qualified', 'qualified_lead', 'interested',
  'interest confirmed', 'lead generated', 'lead captured',
  'whitepaper consent', 'whitepaper sent', 'white paper consent',
  'white paper sent', 'meeting booked', 'demo scheduled',
  'send information', 'hot lead', 'referral',
];

function isInterestDispo(d: string | null): boolean {
  if (!d) return false;
  return INTEREST_DISPOSITIONS.some(p => d.toLowerCase().includes(p));
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function withRetryDB<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try { return await fn(); }
    catch (e: any) {
      if (i < 2 && (e.message?.includes('Connection terminated') || e.message?.includes('timeout'))) {
        console.log(`  DB retry ${i+1} for ${label}`);
        await sleep(1000 * (i + 1));
      } else throw e;
    }
  }
  throw new Error('unreachable');
}

interface Lead {
  id: string; contact_name: string; campaign_name: string; campaign_id: string;
  transcript: string; telnyx_call_id: string | null; contact_id: string;
  qa_status: string; call_duration: number | null; turns: number;
}

interface Result {
  name: string; turns: number; interestScore: number; qualified: boolean;
  qualMet: boolean; expectedDispo: string; error?: string;
}

async function scoreLead(lead: Lead, idx: number, total: number): Promise<Result> {
  const label = `[${idx}/${total}] ${lead.contact_name} (${lead.turns}t)`;
  try {
    const result = await analyzeConversationQuality({
      transcript: lead.transcript,
      interactionType: 'live_call',
      analysisStage: 'post_call',
      callDurationSeconds: lead.call_duration || undefined,
      campaignId: lead.campaign_id,
      campaignName: lead.campaign_name,
      contactName: lead.contact_name,
    });

    const dims = result.qualityDimensions;
    const interestScore = calcInterestScore(dims);
    const qualMet = result.qualificationAssessment?.metCriteria === true;
    const expectedDispo = result.dispositionReview?.expectedDisposition || '';
    const isInterest = isInterestDispo(expectedDispo);
    const positiveSentiment = result.learningSignals?.sentiment === 'positive';
    const highEngagement = ['high', 'medium'].includes(result.learningSignals?.engagementLevel || '');

    let qualified = false;
    if (qualMet) qualified = true;
    else if (isInterest && interestScore >= 60) qualified = true;
    else if (interestScore >= 70 && positiveSentiment && highEngagement) qualified = true;

    // Save call session if needed
    const csId = await withRetryDB(async () => {
      const c = await pool.connect();
      try {
        if (lead.telnyx_call_id) {
          const ex = await c.query(`SELECT id FROM call_sessions WHERE telnyx_call_id = $1 LIMIT 1`, [lead.telnyx_call_id]);
          if (ex.rows.length > 0) return ex.rows[0].id;
        }
        const ins = await c.query(`
          INSERT INTO call_sessions (id, telnyx_call_id, campaign_id, contact_id, status, to_number_e164, created_at)
          VALUES (gen_random_uuid(), $1, $2, $3, 'completed', '+10000000000', NOW()) RETURNING id
        `, [lead.telnyx_call_id || `batch15-${lead.id}`, lead.campaign_id, lead.contact_id]);
        return ins.rows[0].id;
      } finally { c.release(); }
    }, 'ensureCS');

    // Save quality record
    await withRetryDB(async () => {
      const c = await pool.connect();
      try {
        await c.query(`
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
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, NOW(), NOW(), NOW()
          )
        `, [
          csId, lead.campaign_id, lead.contact_id,
          result.overallScore, dims.clarity, dims.engagement, dims.empathy,
          dims.objectionHandling, dims.qualification, dims.closing,
          result.learningSignals?.sentiment || null, result.learningSignals?.engagementLevel || null,
          result.qualificationAssessment?.metCriteria || false,
          JSON.stringify(result.issues || []), JSON.stringify(result.recommendations || []),
          JSON.stringify(result.breakdowns || []), JSON.stringify(result.promptUpdates || []),
          JSON.stringify(result.performanceGaps || []), JSON.stringify(result.nextBestActions || []),
          result.campaignAlignment?.objectiveAdherence || null, result.campaignAlignment?.contextUsage || null,
          result.campaignAlignment?.talkingPointsCoverage || null, JSON.stringify(result.campaignAlignment?.missedTalkingPoints || []),
          result.flowCompliance?.score || null, JSON.stringify(result.flowCompliance?.missedSteps || []),
          JSON.stringify(result.flowCompliance?.deviations || []),
          result.dispositionReview?.assignedDisposition || null, result.dispositionReview?.expectedDisposition || null,
          result.dispositionReview?.isAccurate ?? null, JSON.stringify(result.dispositionReview?.notes || []),
          lead.transcript.length, false, lead.transcript.substring(0, 50000),
          result.metadata?.model || 'vertex-ai-gemini', 'post_call', 'live_call',
        ]);
      } finally { c.release(); }
    }, 'saveQR');

    // Update lead with interest score
    await withRetryDB(async () => {
      const c = await pool.connect();
      try {
        await c.query(`
          UPDATE leads SET ai_score = $1,
            ai_qualification_status = $2,
            qa_status = CASE WHEN $3 AND qa_status NOT IN ('approved','published') THEN 'under_review' ELSE qa_status END,
            updated_at = NOW()
          WHERE id = $4
        `, [interestScore, qualified ? 'qualified' : 'not_qualified', qualified, lead.id]);
      } finally { c.release(); }
    }, 'updateLead');

    const tag = qualified ? `✓ INTEREST (${qualMet ? 'qual_met' : isInterest ? 'dispo:' + expectedDispo : 'signals'})` : 'no interest';
    console.log(`${label} | IS:${interestScore} | dispo:${expectedDispo || 'n/a'} | qm:${qualMet} | ${tag}`);

    return { name: lead.contact_name, turns: lead.turns, interestScore, qualified, qualMet, expectedDispo, };
  } catch (err: any) {
    console.log(`${label} | FAILED: ${err.message?.substring(0, 80)}`);
    return { name: lead.contact_name, turns: lead.turns, interestScore: 0, qualified: false, qualMet: false, expectedDispo: '', error: err.message };
  }
}

async function main() {
  const start = Date.now();
  const client = await pool.connect();

  // Fetch all unscored leads with 15+ turns
  const { rows: allLeads } = await client.query(`
    SELECT l.id, l.contact_name, l.qa_status, l.call_duration, l.transcript,
      l.telnyx_call_id, l.contact_id, l.campaign_id, camp.name as campaign_name
    FROM leads l
    JOIN campaigns camp ON l.campaign_id = camp.id
    WHERE l.deleted_at IS NULL
      AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
      AND NOT EXISTS (
        SELECT 1 FROM call_sessions cs
        JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
        WHERE cs.telnyx_call_id = l.telnyx_call_id
      )
  `);
  client.release();

  // Filter to 15+ turns
  const leads: Lead[] = allLeads
    .map(r => ({ ...r, turns: countTurns(r.transcript) }))
    .filter(r => r.turns >= 15)
    .sort((a, b) => b.turns - a.turns);

  console.log('='.repeat(60));
  console.log(`SCORING ${leads.length} LEADS WITH 15+ TURNS | Workers: ${CONCURRENCY}`);
  console.log('='.repeat(60));

  const results: Result[] = [];
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < leads.length) {
      const i = nextIdx++;
      const r = await scoreLead(leads[i], i + 1, leads.length);
      results.push(r);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, leads.length) }, () => worker()));

  const qualifying = results.filter(r => r.qualified && !r.error);
  const errors = results.filter(r => r.error);
  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log(`DONE (${elapsed} min) — ${results.length} scored`);
  console.log(`Interest confirmed: ${qualifying.length}`);
  console.log(`No interest: ${results.length - qualifying.length - errors.length}`);
  console.log(`Errors: ${errors.length}`);

  if (qualifying.length > 0) {
    console.log('\n--- QUALIFYING (prospect expressed interest) ---');
    qualifying.sort((a, b) => b.interestScore - a.interestScore);
    for (const r of qualifying) {
      console.log(`  IS:${r.interestScore} | ${r.turns}t | ${r.name} | dispo:${r.expectedDispo} | qm:${r.qualMet}`);
    }
  }

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
