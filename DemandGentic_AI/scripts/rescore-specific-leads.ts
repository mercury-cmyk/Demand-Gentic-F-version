/**
 * Rescore specific leads - deletes existing quality records and re-analyzes
 * against campaign context and objectives.
 */
import { pool } from '../server/db';
import { analyzeConversationQuality } from '../server/services/conversation-quality-analyzer';

const CONCURRENCY = 1;
const MAX_RETRIES = 2;
const QUALIFY_THRESHOLD = 70;

// All 89 lead IDs to rescore
const LEAD_IDS = [
  '6e7c1116-e7b4-4203-96de-e1e3d3b9edc9',
  'd89621de-1025-4652-8606-6e2e4ed863a6',
  'b2c5daea-fa2b-4b92-a4df-5af1722f7c66',
  '03cd6689-f1ea-4eb1-9619-b10a09716fb5',
  'b10878ac-fa4b-40a9-b959-5f42e3cd0bca',
  '19e5bb3b-c1bb-426f-8ca0-8afb87627242',
  'c671fa78-9af4-4568-a74f-2af61bab936e',
  '9681627f-ede7-42e4-a359-56cfe9ca5401',
  'be801b2a-a092-4109-ac15-6a416407f647',
  'f14e1e57-0bd8-4af4-a7e6-143d7be3a865',
  'db211110-4940-4632-9ebf-b0b216d191ef',
  'e7c021a2-33c4-4ca5-955e-e64011a7110e',
  'eee6ebb6-5561-430f-ba3c-a86fe8bad3a1',
  '1487de78-205d-4cb1-a3e4-aa9fe9645b17',
  '2b9dc921-6e16-4950-9d97-60bfcf275258',
  'd68b2c02-b71d-4e6c-b79f-93b9536d67bf',
  '868bc306-a0dc-44b3-8a25-b96bd0e44b0e',
  '98807541-a7e2-4783-8ce4-286fe7fc39dd',
  'd64929b4-7093-40cf-b640-59bf7f6d3909',
  '75079670-27ae-4892-9eb7-c84fe7d7a319',
  'd87890da-8008-4de6-a895-d406bb0edff4',
  'b9880f01-a49e-46a6-9440-2b08e4a35a1e',
  'ed3721b7-b8e9-49de-8cc6-2aef1bffaa23',
  '4841e04b-41e1-454c-b006-6ed42d23d5a8',
  'bc35330c-e326-4c35-b68e-ea8a720e8755',
  '70667c18-f93c-4bbf-9300-ca2dec55ef70',
  'eefcd387-f6a0-48ed-8e2a-ede0f2e4e6a1',
  'e3dd2c20-b7c7-4efd-b48b-9bf76b2b7463',
  'd7bf9a08-211e-4c57-9896-fecf508f039e',
  '70b477d5-74a6-4973-b091-6205d671058b',
  '8e3ef2e1-abdc-4fae-b146-dba6c5f9f0ad',
  '5044f7fc-8d09-4103-aafd-815af9fd422d',
  '998c843f-3b35-4c90-b359-2d98959ca8ca',
  '308862ba-9fca-45b2-a52c-d92c61dc37ac',
  '545a055d-35ae-4537-8b87-bcbc082c655c',
  '6bb41ed6-39f6-432c-a0e5-a064c4d07589',
  '17d1d544-4cbf-41ec-ba50-99e54b1ec2d4',
  '506bd80e-b047-451e-88ee-8cdea6929c22',
  '328429fe-3013-4cf2-9a99-1f1d617924e6',
  'ed2e293d-2c56-4564-bfcc-4f3a4ec84cb5',
  'bb6a6700-8d69-4429-b8b6-c6c988fca5db',
  'cff36121-a7c4-439c-8ff6-9e0852014aa5',
  '38b2d028-341c-41c3-a79b-2ffd25e5c32d',
  'd2f6e1a3-4ee6-4183-a1a8-df7271dae340',
  '4556cdda-32c5-4e58-a4c3-db8fa77c42be',
  '39a18811-c6f9-4274-b20d-073dbf6db1a5',
  'fc154e9a-1d15-49b3-a80d-4ded8017c017',
  'c59837ba-8ce6-4d9c-9dd8-a06b99ba3f0a',
  'a51f8de8-1b94-46bd-b7b3-52938b866bf9',
  '80a9c3cd-fea0-4c00-b643-825fc9acddc3',
  '406bcad8-009d-4a73-bba8-c674cb9bdc5c',
  'c6f637ee-9d9c-4f78-9ef4-354b59824613',
  'd33cb5a3-0401-4ced-8066-352c65c9ac67',
  '2c4f2ffe-0855-40c0-a8be-5b0f9c7a94c3',
  '6f057366-1d16-4015-9c31-980c9886104f',
  '28217c12-a302-45f7-9644-6d8bcd3ca644',
  '69161f33-1b59-4d19-9a71-3eb5ebb0a697',
  'b8e2701e-9dac-40c2-bf8f-55669a9e8932',
  'c0581af4-1d6b-4dd8-84d4-aebff9fdfd47',
  '9dd03cac-e3df-4cbe-9c9a-242498dc6221',
  '4e3c1bcf-a144-4776-8f80-4a3feb1b15cf',
  '52e21aa9-0001-4696-b486-252607d79a66',
  'e6b36fd7-d2d5-4d89-b87b-966b68c24ef7',
  'f865c5ce-9958-4d1c-b924-3ebb9134400c',
  '18d7eefe-24e6-45cb-bc6a-ef993faa291c',
  '48525560-71b6-479b-a819-aeee6b856570',
  '26973f40-b6e6-49ca-b9b8-07aabd26138b',
  '2f7bf7c7-730a-45f8-9e15-e90c1b2226a4',
  '2041740b-e55e-4feb-afc6-6f1d2f2e77af',
  '38d475fc-caef-4998-b388-1918ff991108',
  '1567f7ff-874c-471c-8d12-5cb21b6e30b6',
  '711bf465-f3dd-43c2-9803-55c2c507a66c',
  '80a72c32-97ef-48d6-8212-e14c05886b07',
  '6514f716-50ff-4d03-aa13-88735d69444b',
  'af33180a-b731-461a-a737-1fc8f4a091a1',
  '8a4f7f19-d1a3-4bef-9b5a-3fae69453ca6',
  'b127929c-a158-4e21-a03d-492d411935c9',
  '497fd60a-1ad3-43ec-bd23-f1e765bfe117',
  'd15a66df-5ccf-479a-8be7-f1a5e5663cea',
  '556b2fb2-d823-42a5-ae16-1c5696d3208a',
  '449ee01d-c124-4628-b0c1-2addd0ff47ed',
  '4dab73de-da76-449e-a03d-1836c8017c98',
  '3fedef13-ab5c-4f47-87c9-74f147c9be9b',
  'a3bc6f99-2fc6-4c50-833b-895b8f1ccb5f',
  'bdd01021-e441-4bf9-ab37-c583e17659ef',
  '31c98820-08ac-4ca5-bb55-3fb1951869f7',
  '5e5501d6-2d3a-42ff-9d79-244a4510971f',
  '0ae48051-2170-497a-93a3-1ccfeaa2a522',
  'a6c4cf1a-0e43-4376-a5ee-8b3bd6b39853',
];

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
  contact_phone: string | null; dialed_number: string | null;
}

interface Result {
  lead_id: string; name: string; campaign: string;
  old_convq: number | null; new_convq: number; new_overall: number;
  qualified: boolean; error?: string;
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

async function scoreOneLead(lead: LeadRow, index: number, total: number, oldScore: number | null): Promise {
  const label = `[${index + 1}/${total}] ${lead.contact_name} | ${lead.campaign_name}`;

  for (let attempt = 0; attempt = QUALIFY_THRESHOLD;

      const csId = await ensureCallSession(lead);
      await saveQualityRecord(csId, lead, result);

      // Update lead scores
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
                  ai_qualification_status = 'not_qualified',
                  updated_at = NOW()
              WHERE id = $2
            `, [convQ, lead.lead_id]);
          }
        } finally { qc.release(); }
      }, 'updateAiScore');

      const tag = qualified ? 'QUALIFIES' : 'NOT QUALIFIED';
      const delta = oldScore != null ? ` (was ${oldScore}, delta ${convQ - oldScore > 0 ? '+' : ''}${convQ - oldScore})` : '';
      console.log(`${label} -> CQ:${convQ} O:${result.overallScore} CA:${result.campaignAlignment?.objectiveAdherence || '-'} CU:${result.campaignAlignment?.contextUsage || '-'} TP:${result.campaignAlignment?.talkingPointsCoverage || '-'} | ${tag}${delta}`);

      return { lead_id: lead.lead_id, name: lead.contact_name, campaign: lead.campaign_name, old_convq: oldScore, new_convq: convQ, new_overall: result.overallScore, qualified };
    } catch (err: any) {
      if (attempt  [r.id, r.ai_score]));
  console.log(`Found ${oldScores.length} leads in DB out of ${LEAD_IDS.length} requested`);

  // Step 2: Delete existing quality records for these leads
  console.log('\nDeleting existing quality records...');
  const { rowCount: deletedQR } = await client.query(`
    DELETE FROM call_quality_records
    WHERE call_session_id IN (
      SELECT cs.id FROM call_sessions cs
      JOIN leads l ON cs.telnyx_call_id = l.telnyx_call_id
      WHERE l.id = ANY($1)
    )
  `, [LEAD_IDS]);
  console.log(`Deleted ${deletedQR} existing quality records`);

  // Step 3: Fetch lead data for rescoring
  const { rows: leads } = await client.query(`
    SELECT
      l.id as lead_id,
      COALESCE(c.first_name || ' ' || c.last_name, 'Unknown') as contact_name,
      camp.name as campaign_name, camp.id as campaign_id,
      COALESCE(l.transcript, l.notes) as transcript,
      cs.id as call_session_id, l.telnyx_call_id,
      l.contact_id, cs.ai_disposition, l.call_duration,
      c.direct_phone as contact_phone, cs.to_number_e164 as dialed_number,
      l.ai_score as old_ai_score
    FROM leads l
    JOIN contacts c ON l.contact_id = c.id
    JOIN campaigns camp ON l.campaign_id = camp.id
    LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
    WHERE l.id = ANY($1)
      AND l.deleted_at IS NULL
      AND COALESCE(l.transcript, l.notes) IS NOT NULL
      AND LENGTH(COALESCE(l.transcript, l.notes)) > 20
    ORDER BY camp.name, l.created_at
  `, [LEAD_IDS]);
  client.release();

  console.log(`\nReady to rescore ${leads.length} leads with transcripts`);
  if (leads.length  worker());
  await Promise.all(workers);

  // Step 5: Report
  const qualifying = results.filter(r => r.qualified && !r.error);
  const nonQualifying = results.filter(r => !r.qualified && !r.error);
  const errors = results.filter(r => r.error);
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log(`RESCORE RESULTS (${elapsed} min)`);
  console.log('='.repeat(80));
  console.log(`Total rescored: ${results.length}`);
  console.log(`Qualifying (ConvQ >= 70): ${qualifying.length}`);
  console.log(`Not qualifying: ${nonQualifying.length}`);
  console.log(`Errors: ${errors.length}`);

  // Score changes
  const improved = results.filter(r => !r.error && r.old_convq != null && r.new_convq > r.old_convq);
  const declined = results.filter(r => !r.error && r.old_convq != null && r.new_convq  !r.error && r.old_convq != null && r.new_convq === r.old_convq);
  console.log(`\nScore changes: ${improved.length} improved, ${declined.length} declined, ${unchanged.length} unchanged`);

  if (qualifying.length > 0) {
    console.log('\n--- QUALIFYING LEADS (ConvQ >= 70) ---');
    qualifying.sort((a, b) => b.new_convq - a.new_convq);
    for (const r of qualifying) {
      const delta = r.old_convq != null ? ` (was ${r.old_convq})` : '';
      console.log(`  CQ:${r.new_convq} O:${r.new_overall} | ${r.name} | ${r.campaign}${delta}`);
    }
  }

  if (nonQualifying.length > 0) {
    console.log('\n--- NOT QUALIFYING (ConvQ  b.new_convq - a.new_convq);
    for (const r of nonQualifying) {
      const delta = r.old_convq != null ? ` (was ${r.old_convq})` : '';
      console.log(`  CQ:${r.new_convq} O:${r.new_overall} | ${r.name} | ${r.campaign}${delta}`);
    }
  }

  // Campaign breakdown
  const byCampaign: Record = {};
  for (const r of results.filter(r => !r.error)) {
    if (!byCampaign[r.campaign]) byCampaign[r.campaign] = { total: 0, qualify: 0, avgOld: 0, avgNew: 0, scores: [] };
    byCampaign[r.campaign].total++;
    if (r.qualified) byCampaign[r.campaign].qualify++;
    byCampaign[r.campaign].scores.push({ old: r.old_convq, new: r.new_convq });
  }
  console.log('\n--- BY CAMPAIGN ---');
  for (const [name, stats] of Object.entries(byCampaign)) {
    const avgNew = Math.round(stats.scores.reduce((s, v) => s + v.new, 0) / stats.scores.length);
    const oldsWithValues = stats.scores.filter(s => s.old != null);
    const avgOld = oldsWithValues.length > 0 ? Math.round(oldsWithValues.reduce((s, v) => s + (v.old || 0), 0) / oldsWithValues.length) : null;
    const avgStr = avgOld != null ? ` (avg was ${avgOld} -> ${avgNew})` : ` (avg ${avgNew})`;
    console.log(`  ${name}: ${stats.qualify}/${stats.total} qualify${avgStr}`);
  }

  if (errors.length > 0) {
    console.log(`\n--- ${errors.length} ERRORS ---`);
    for (const r of errors) {
      console.log(`  ${r.name} | ${r.error?.substring(0, 80)}`);
    }
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });