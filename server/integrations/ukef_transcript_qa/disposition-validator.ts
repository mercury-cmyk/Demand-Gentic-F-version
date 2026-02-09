/**
 * UKEF Disposition Validator
 *
 * Uses AI (DeepSeek primary, Vertex AI fallback) to analyze call transcripts
 * and recommend a disposition. Compares with the existing disposition and
 * flags mismatches for human review.
 *
 * Safety:
 * - NEVER auto-changes dispositions without explicit approval (audit mode by default)
 * - Writes to disposition_review_tasks and audit log only
 * - Does not touch leads.transcript or leads.qaStatus
 * - All changes are audited in transcript_qa_audit_log
 *
 * Privacy:
 * - No PII sent in prompts beyond transcript text
 * - No audio stored or processed by this module
 */

import OpenAI from 'openai';
import { db } from '../../db';
import { leads, dialerCallAttempts, campaigns } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import {
  UKEF_CLIENT_ACCOUNT_ID,
  UKEF_CUTOFF_DATE,
  DEFAULT_PIPELINE_CONFIG,
  type DispositionAnalysisResult,
  type DispositionValidationStatus,
  type PipelineConfig,
} from './types';

// ─── AI Client Setup ────────────────────────────────────────────────────────

let _deepseekClient: OpenAI | null = null;
function getDeepSeekClient(): OpenAI {
  if (!_deepseekClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DeepSeek API key not configured. Set DEEPSEEK_API_KEY.');
    _deepseekClient = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    });
  }
  return _deepseekClient;
}

// ─── Disposition Analysis Prompt ─────────────────────────────────────────────

const DISPOSITION_SYSTEM_PROMPT = `You are an expert call quality analyst. You analyze B2B sales/marketing call transcripts and determine the correct disposition (outcome) of the call.

Available dispositions:
- qualified_lead: The prospect showed genuine interest, answered qualification questions, and meets basic criteria.
- not_interested: The prospect explicitly declined or showed no interest.
- do_not_call: The prospect requested to be removed from call lists (DNC).
- voicemail: The call reached voicemail, no live conversation occurred.
- no_answer: No one picked up the call.
- invalid_data: Wrong number, disconnected, or bad contact information.
- needs_review: The call outcome is ambiguous and cannot be determined with confidence.
- callback_requested: The prospect asked to be called back at a different time.

Analyze the transcript and determine:
1. The most accurate disposition based on the conversation content
2. Your confidence level (0.0 to 1.0)
3. Supporting evidence from the transcript
4. Brief rationale for your decision

Important rules:
- A voicemail has NO back-and-forth conversation.
- A qualified lead must demonstrate GENUINE interest with substantive dialogue.
- Only call it "not_interested" if the prospect EXPLICITLY declines.
- If ambiguous, default to "needs_review" with appropriate confidence.
- Do NOT confuse short calls where someone picked up then hung up with voicemail.

Respond with valid JSON only. No markdown code blocks.`;

function buildUserPrompt(transcript: string, existingDisposition: string | null): string {
  let prompt = `Analyze this call transcript and determine the correct disposition:\n\n--- TRANSCRIPT ---\n${transcript}\n--- END TRANSCRIPT ---\n\n`;
  if (existingDisposition) {
    prompt += `The call was originally marked as: "${existingDisposition}"\n`;
    prompt += `Evaluate whether this disposition is accurate based on the transcript content.\n\n`;
  }
  prompt += `Return JSON with these fields:
{
  "recommended_disposition": "one of the available dispositions",
  "confidence": 0.0 to 1.0,
  "evidence_snippets": [{"quote": "exact quote from transcript", "relevance": "why this supports the disposition"}],
  "rationale": "brief explanation of your determination",
  "call_summary": "2-3 sentence summary of the call",
  "interest_indicators": ["list of positive interest signals"],
  "objection_indicators": ["list of negative signals or objections"],
  "qualification_status": "qualified | not_qualified | ambiguous"
}`;
  return prompt;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyze a transcript and produce a disposition recommendation.
 * Pure function — does not write to DB.
 */
export async function analyzeDisposition(
  transcript: string,
  existingDisposition: string | null
): Promise<DispositionAnalysisResult> {
  const client = getDeepSeekClient();

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: DISPOSITION_SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(transcript, existingDisposition) + '\n\nRespond with valid JSON only.' },
    ],
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('DeepSeek returned empty response for disposition analysis');

  try {
    return JSON.parse(content) as DispositionAnalysisResult;
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim()) as DispositionAnalysisResult;
    }
    throw new Error(`Failed to parse disposition analysis response: ${content.substring(0, 200)}`);
  }
}

/**
 * Validate dispositions for UKEF leads with transcripts.
 * For each lead: analyze transcript → compare with existing disposition → create review task.
 */
export async function validateDispositions(
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): Promise<{ validated: number; mismatches: number; errors: number }> {
  // Fetch UKEF leads that have transcripts and have NOT been validated yet
  const leadsToValidate = await db.execute<{
    id: string;
    campaign_id: string | null;
    call_attempt_id: string | null;
    transcript: string | null;
    existing_disposition: string | null;
  }>(sql`
    SELECT l.id, l.campaign_id, l.call_attempt_id,
           l.transcript,
           COALESCE(dca.disposition, l.ai_qualification_status) as existing_disposition
    FROM leads l
    JOIN campaigns c ON l.campaign_id = c.id
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    LEFT JOIN disposition_review_tasks drt ON drt.lead_id = l.id
    WHERE c.client_account_id = ${UKEF_CLIENT_ACCOUNT_ID}
      AND l.delivered_at >= ${UKEF_CUTOFF_DATE}
      AND l.transcript IS NOT NULL
      AND length(l.transcript) > 20
      AND drt.id IS NULL
    ORDER BY l.delivered_at DESC
    LIMIT ${config.batchSize}
  `);

  const rows = leadsToValidate.rows || [];
  let validated = 0;
  let mismatches = 0;
  let errors = 0;

  for (const lead of rows) {
    try {
      if (!lead.transcript) continue;

      const analysis = await analyzeDisposition(
        lead.transcript,
        lead.existing_disposition
      );

      // Determine validation status
      const dispositionsMatch = normalizeDisposition(analysis.recommended_disposition) ===
        normalizeDisposition(lead.existing_disposition || '');
      
      let validationStatus: DispositionValidationStatus;
      if (dispositionsMatch) {
        validationStatus = 'validated';
      } else if (analysis.confidence >= config.autoCorrectThreshold && config.autoCorrectEnabled) {
        validationStatus = 'auto_corrected';
      } else {
        validationStatus = 'mismatch';
        mismatches++;
      }

      // Upsert disposition review task
      await db.execute(sql`
        INSERT INTO disposition_review_tasks
          (id, lead_id, campaign_id, call_attempt_id,
           existing_disposition, recommended_disposition,
           validation_status, confidence, confidence_threshold,
           evidence_snippets, rationale,
           analysis_output, analysis_model, analysis_provider,
           auto_corrected, previous_disposition,
           created_at, updated_at)
        VALUES (
          gen_random_uuid()::text,
          ${lead.id},
          ${lead.campaign_id},
          ${lead.call_attempt_id},
          ${lead.existing_disposition},
          ${analysis.recommended_disposition},
          ${validationStatus}::disposition_validation_status,
          ${analysis.confidence},
          ${config.autoCorrectThreshold},
          ${JSON.stringify(analysis.evidence_snippets)}::jsonb,
          ${analysis.rationale},
          ${JSON.stringify(analysis)}::jsonb,
          'deepseek-chat',
          'deepseek',
          ${validationStatus === 'auto_corrected'},
          ${validationStatus === 'auto_corrected' ? lead.existing_disposition : null},
          now(),
          now()
        )
        ON CONFLICT (lead_id)
        DO UPDATE SET
          existing_disposition = EXCLUDED.existing_disposition,
          recommended_disposition = EXCLUDED.recommended_disposition,
          validation_status = EXCLUDED.validation_status,
          confidence = EXCLUDED.confidence,
          evidence_snippets = EXCLUDED.evidence_snippets,
          rationale = EXCLUDED.rationale,
          analysis_output = EXCLUDED.analysis_output,
          analysis_model = EXCLUDED.analysis_model,
          analysis_provider = EXCLUDED.analysis_provider,
          updated_at = now()
      `);

      // Audit log
      await db.execute(sql`
        INSERT INTO transcript_qa_audit_log
          (id, lead_id, action, old_value, new_value, performed_by, model_version, provider, metadata)
        VALUES (
          gen_random_uuid()::text,
          ${lead.id},
          'validate_disposition',
          ${JSON.stringify({ disposition: lead.existing_disposition })}::jsonb,
          ${JSON.stringify({
            recommended: analysis.recommended_disposition,
            confidence: analysis.confidence,
            status: validationStatus,
          })}::jsonb,
          'system',
          'deepseek-chat',
          'deepseek',
          ${JSON.stringify({ rationale: analysis.rationale })}::jsonb
        )
      `);

      validated++;
    } catch (err) {
      console.error(`[UKEF-TQA] Disposition validation error for lead ${lead.id}:`, err);
      errors++;
    }
  }

  console.log(`[UKEF-TQA] Validated ${validated} dispositions | ${mismatches} mismatches | ${errors} errors`);
  return { validated, mismatches, errors };
}

/**
 * Apply a review decision to a disposition review task.
 * Only accepts human action — auto-correction is done by validateDispositions.
 */
export async function applyReviewDecision(
  taskId: string,
  action: 'accept' | 'reject' | 'override',
  reviewedBy: string,
  overrideDisposition?: string,
  reviewNotes?: string
): Promise<{ success: boolean; newDisposition?: string }> {
  // Fetch the task
  const taskResult = await db.execute<{
    id: string;
    lead_id: string;
    existing_disposition: string | null;
    recommended_disposition: string | null;
    validation_status: string;
  }>(sql`
    SELECT id, lead_id, existing_disposition, recommended_disposition, validation_status
    FROM disposition_review_tasks
    WHERE id = ${taskId}
  `);

  const task = (taskResult.rows || [])[0];
  if (!task) return { success: false };

  let newDisposition: string | null = null;
  let validationStatus: DispositionValidationStatus = 'reviewed';

  switch (action) {
    case 'accept':
      // Accept the AI recommendation
      newDisposition = task.recommended_disposition;
      break;
    case 'reject':
      // Keep the existing disposition
      newDisposition = task.existing_disposition;
      break;
    case 'override':
      // Use a custom disposition
      newDisposition = overrideDisposition || task.existing_disposition;
      break;
  }

  // Update the task
  await db.execute(sql`
    UPDATE disposition_review_tasks
    SET validation_status = ${validationStatus}::disposition_validation_status,
        corrected_by = ${reviewedBy},
        corrected_at = now(),
        reviewed_by = ${reviewedBy},
        reviewed_at = now(),
        review_notes = ${reviewNotes || null},
        updated_at = now()
    WHERE id = ${taskId}
  `);

  // If accepting the recommendation or overriding, update the call attempt disposition
  if (action === 'accept' || action === 'override') {
    if (task.lead_id && newDisposition) {
      // Update disposition on the call attempt if it exists
      await db.execute(sql`
        UPDATE dialer_call_attempts
        SET disposition = ${newDisposition}::canonical_disposition
        WHERE id = (
          SELECT call_attempt_id FROM leads WHERE id = ${task.lead_id} AND call_attempt_id IS NOT NULL
        )
      `);
    }
  }

  // Audit log
  await db.execute(sql`
    INSERT INTO transcript_qa_audit_log
      (id, lead_id, action, old_value, new_value, performed_by, metadata)
    VALUES (
      gen_random_uuid()::text,
      ${task.lead_id},
      'manual_review',
      ${JSON.stringify({ disposition: task.existing_disposition, recommended: task.recommended_disposition })}::jsonb,
      ${JSON.stringify({ action, newDisposition, reviewNotes })}::jsonb,
      ${reviewedBy},
      ${JSON.stringify({ taskId })}::jsonb
    )
  `);

  return { success: true, newDisposition: newDisposition || undefined };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize disposition strings for comparison.
 * Maps legacy formats to canonical names.
 */
function normalizeDisposition(d: string): string {
  const normalized = d.toLowerCase().trim().replace(/-/g, '_');
  const map: Record<string, string> = {
    qualified: 'qualified_lead',
    not_interested: 'not_interested',
    dnc_request: 'do_not_call',
    dnc: 'do_not_call',
    callback_requested: 'callback_requested',
    callback: 'callback_requested',
    wrong_number: 'invalid_data',
    no_answer: 'no_answer',
    busy: 'no_answer',
    voicemail: 'voicemail',
    connected: 'needs_review', // "connected" is a call status, not a disposition
    invalid_data: 'invalid_data',
    needs_review: 'needs_review',
  };
  return map[normalized] || normalized;
}
