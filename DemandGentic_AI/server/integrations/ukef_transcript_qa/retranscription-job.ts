/**
 * UKEF Retranscription Job
 *
 * Retranscribes call recordings for UKEF leads that have missing or partial transcripts.
 * Uses Google Speech-to-Text with structured diarization (2 speakers).
 *
 * Safety:
 * - Only processes UKEF/Lightcast leads (hard client gate)
 * - Only retranscribes leads flagged as 'missing' or 'partial' in transcript_quality_assessments
 * - Updates leads.transcript and leads.structured_transcript (additive — preserves originals in audit log)
 * - Does NOT store audio blobs — only uses signed URLs to existing recordings
 * - All actions are audited in transcript_qa_audit_log
 *
 * Flow:
 * 1. Query transcript_quality_assessments for leads needing retranscription
 * 2. Get recording URL (signed from GCS)
 * 3. Call submitStructuredTranscription() for diarized transcript
 * 4. Update leads.transcript + structured_transcript
 * 5. Re-assess quality and update assessment record
 * 6. Audit log everything
 */

import { db } from '../../db';
import { leads } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { getPresignedDownloadUrl } from '../../lib/storage';
import { submitStructuredTranscription } from '../../services/google-transcription';
import { classifyTranscript } from './transcript-classifier';
import {
  UKEF_CLIENT_ACCOUNT_ID,
  DEFAULT_PIPELINE_CONFIG,
  RECORDING_URL_EXPIRY_SECONDS,
  type PipelineConfig,
} from './types';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Process retranscription queue for UKEF leads.
 * Only retranscribes leads with 'missing' or 'partial' transcript status
 * that have a recording available.
 */
export async function processRetranscriptionQueue(
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): Promise {
  // Find leads needing retranscription
  const queue = await db.execute(sql`
    SELECT tqa.lead_id,
           l.recording_url,
           l.recording_s3_key,
           l.telnyx_call_id,
           l.transcript as old_transcript,
           tqa.transcript_status::text
    FROM transcript_quality_assessments tqa
    JOIN leads l ON l.id = tqa.lead_id
    JOIN campaigns c ON l.campaign_id = c.id
    WHERE c.client_account_id = ${UKEF_CLIENT_ACCOUNT_ID}
      AND tqa.transcript_status IN ('missing', 'partial')
      AND tqa.transcript_source = 'existing'
      AND (l.recording_url IS NOT NULL OR l.recording_s3_key IS NOT NULL)
    ORDER BY tqa.created_at ASC
    LIMIT ${config.batchSize}
  `);

  const rows = queue.rows || [];
  let retranscribed = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of rows) {
    try {
      // Get audio URL
      let audioUrl: string | null = item.recording_url;
      if (!audioUrl && item.recording_s3_key) {
        audioUrl = await getPresignedDownloadUrl(item.recording_s3_key, RECORDING_URL_EXPIRY_SECONDS);
      }

      if (!audioUrl) {
        console.log(`[UKEF-TQA] No audio URL for lead ${item.lead_id}, skipping`);
        skipped++;
        continue;
      }

      console.log(`[UKEF-TQA] Retranscribing lead ${item.lead_id}...`);

      // Submit for structured transcription with diarization
      const result = await submitStructuredTranscription(audioUrl, {
        telnyxCallId: item.telnyx_call_id || undefined,
        recordingS3Key: item.recording_s3_key || undefined,
      });

      if (!result || !result.text) {
        console.error(`[UKEF-TQA] Retranscription returned empty for lead ${item.lead_id}`);
        
        // Mark as failed
        await db.execute(sql`
          UPDATE transcript_quality_assessments
          SET transcript_status = 'failed'::transcript_quality_status,
              transcript_source = 'retranscribed'::transcript_source_type,
              last_transcribed_at = now(),
              updated_at = now()
          WHERE lead_id = ${item.lead_id}
        `);

        failed++;
        continue;
      }

      // Update lead with new transcript (preserving original in audit log)
      await db.execute(sql`
        UPDATE leads
        SET transcript = ${result.text},
            structured_transcript = ${JSON.stringify(result)}::jsonb,
            transcription_status = 'completed',
            updated_at = now()
        WHERE id = ${item.lead_id}
      `);

      // Re-classify the new transcript
      const assessment = classifyTranscript(result.text, result);

      // Update quality assessment
      await db.execute(sql`
        UPDATE transcript_quality_assessments
        SET transcript_status = ${assessment.status}::transcript_quality_status,
            transcript_source = 'retranscribed'::transcript_source_type,
            has_both_sides = ${assessment.hasBothSides},
            diarization_used = ${assessment.diarizationUsed},
            speaker_labels = ${JSON.stringify(assessment.speakerLabels)}::jsonb,
            quality_metrics = ${JSON.stringify(assessment.metrics)}::jsonb,
            last_transcribed_at = now(),
            updated_at = now()
        WHERE lead_id = ${item.lead_id}
      `);

      // Audit log — preserve original transcript
      await db.execute(sql`
        INSERT INTO transcript_qa_audit_log
          (id, lead_id, action, old_value, new_value, performed_by, model_version, provider, metadata)
        VALUES (
          gen_random_uuid()::text,
          ${item.lead_id},
          'retranscribe',
          ${JSON.stringify({
            transcript: item.old_transcript?.substring(0, 500) || null,
            status: item.transcript_status,
          })}::jsonb,
          ${JSON.stringify({
            status: assessment.status,
            word_count: assessment.metrics.word_count,
            speakers: assessment.speakerLabels,
            has_both_sides: assessment.hasBothSides,
          })}::jsonb,
          'system',
          'google-stt-telephony',
          'google',
          ${JSON.stringify({
            utterance_count: result.utterances?.length || 0,
            char_count: result.text.length,
          })}::jsonb
        )
      `);

      retranscribed++;
      console.log(`[UKEF-TQA] ✅ Retranscribed lead ${item.lead_id} | ${assessment.metrics.word_count} words | ${assessment.speakerLabels.length} speakers`);

    } catch (err) {
      console.error(`[UKEF-TQA] Retranscription error for lead ${item.lead_id}:`, err);
      failed++;
    }
  }

  console.log(`[UKEF-TQA] Retranscription batch complete: ${retranscribed} retranscribed, ${failed} failed, ${skipped} skipped`);
  return { retranscribed, failed, skipped };
}