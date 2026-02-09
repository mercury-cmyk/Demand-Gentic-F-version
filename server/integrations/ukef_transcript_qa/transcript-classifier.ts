/**
 * UKEF Transcript Quality Classifier
 *
 * Assesses transcript quality from existing data without modifying any state.
 * Pure analysis — reads transcript/recording meta and produces a quality assessment.
 *
 * Checks:
 * 1. Does the lead have a transcript at all?
 * 2. Is it structured (has utterances) or plain text?
 * 3. Does it have both sides (agent + prospect)?
 * 4. What's the word count, turn count, speaker balance?
 * 5. Does a recording exist for retranscription if needed?
 *
 * Safety: Read-only against lead data. Only writes to transcript_quality_assessments.
 */

import { db } from '../../db';
import { leads, dialerCallAttempts, campaigns } from '@shared/schema';
import { eq, and, sql, isNull, isNotNull, inArray } from 'drizzle-orm';
import {
  UKEF_CLIENT_ACCOUNT_ID,
  UKEF_CUTOFF_DATE,
  DEFAULT_PIPELINE_CONFIG,
  type TranscriptQualityStatus,
  type QualityMetrics,
  type TranscriptQualityAssessment,
  type PipelineConfig,
} from './types';

// ─── Structured Transcript Shape ──────────────────────────────────────────────

interface StructuredUtterance {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
}

interface StructuredTranscript {
  text: string;
  utterances: StructuredUtterance[];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Classify a single lead's transcript quality.
 * Returns a quality assessment object without persisting it.
 */
export function classifyTranscript(
  transcript: string | null,
  structuredTranscript: StructuredTranscript | null,
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): {
  status: TranscriptQualityStatus;
  hasBothSides: boolean;
  diarizationUsed: boolean;
  speakerLabels: string[];
  metrics: QualityMetrics;
} {
  // No transcript at all
  if (!transcript && !structuredTranscript?.text) {
    return {
      status: 'missing',
      hasBothSides: false,
      diarizationUsed: false,
      speakerLabels: [],
      metrics: emptyMetrics(),
    };
  }

  const text = structuredTranscript?.text || transcript || '';
  const utterances = structuredTranscript?.utterances || [];

  // Compute metrics
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const charCount = text.length;
  const turnCount = utterances.length || 1; // Plain text = 1 turn
  const speakers = new Set(utterances.map(u => u.speaker));
  const uniqueSpeakers = speakers.size || (text.length > 0 ? 1 : 0);
  const speakerLabels = Array.from(speakers);
  const diarizationUsed = utterances.length > 0 && uniqueSpeakers > 1;

  // Speaker balance: how evenly split is the conversation between speakers
  let speakerBalanceRatio = 0;
  if (utterances.length > 0 && uniqueSpeakers >= 2) {
    const speakerWordCounts: Record<string, number> = {};
    for (const u of utterances) {
      const wc = u.text.split(/\s+/).filter(Boolean).length;
      speakerWordCounts[u.speaker] = (speakerWordCounts[u.speaker] || 0) + wc;
    }
    const counts = Object.values(speakerWordCounts);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const min = Math.min(...counts);
      const max = Math.max(...counts);
      speakerBalanceRatio = total > 0 ? min / max : 0;
    }
  }

  // Duration from utterances (if available)
  let durationSeconds: number | null = null;
  if (utterances.length > 0) {
    const starts = utterances.map(u => u.start ?? 0);
    const ends = utterances.map(u => u.end ?? 0);
    const maxEnd = Math.max(...ends);
    if (maxEnd > 0) {
      durationSeconds = maxEnd;
    }
  }

  // Compute empty ratio: ratio of empty/trivial utterances
  const emptyRatio = utterances.length > 0
    ? utterances.filter(u => u.text.trim().length < 3).length / utterances.length
    : (text.trim().length < 10 ? 1 : 0);

  const metrics: QualityMetrics = {
    duration_seconds: durationSeconds,
    transcript_coverage_ratio: null, // Would need recording duration to compute
    empty_ratio: emptyRatio,
    avg_confidence: null, // Not stored in transcripts
    turn_count: turnCount,
    speaker_balance_ratio: speakerBalanceRatio,
    word_count: wordCount,
    char_count: charCount,
    unique_speakers: uniqueSpeakers,
  };

  // Classify status
  const hasBothSides = uniqueSpeakers >= config.minSpeakers;
  let status: TranscriptQualityStatus;

  if (wordCount < config.minWordCount) {
    status = 'partial';
  } else if (!hasBothSides && utterances.length === 0) {
    // Plain text without diarization — partial
    status = 'partial';
  } else if (hasBothSides && wordCount >= config.minWordCount) {
    status = 'complete';
  } else {
    status = 'partial';
  }

  return {
    status,
    hasBothSides,
    diarizationUsed,
    speakerLabels,
    metrics,
  };
}

/**
 * Batch-assess transcript quality for UKEF leads.
 * Fetches leads, classifies each, and upserts into transcript_quality_assessments.
 * Returns count of leads assessed.
 */
export async function assessTranscriptQuality(
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG
): Promise<{ assessed: number; retranscriptionNeeded: number }> {
  // Fetch UKEF leads that have recordings (potential for transcription)
  // Only process leads from UKEF campaigns
  const ukefLeads = await db.execute<{
    id: string;
    campaign_id: string | null;
    call_attempt_id: string | null;
    transcript: string | null;
    structured_transcript: any;
    recording_url: string | null;
    recording_s3_key: string | null;
    transcription_status: string | null;
  }>(sql`
    SELECT l.id, l.campaign_id, l.call_attempt_id,
           l.transcript, l.structured_transcript,
           l.recording_url, l.recording_s3_key,
           l.transcription_status
    FROM leads l
    JOIN campaigns c ON l.campaign_id = c.id
    WHERE c.client_account_id = ${UKEF_CLIENT_ACCOUNT_ID}
      AND l.delivered_at >= ${UKEF_CUTOFF_DATE}
      AND (l.recording_url IS NOT NULL OR l.recording_s3_key IS NOT NULL
           OR l.transcript IS NOT NULL)
    ORDER BY l.delivered_at DESC
    LIMIT ${config.batchSize}
  `);

  const rows = ukefLeads.rows || [];
  let assessed = 0;
  let retranscriptionNeeded = 0;

  for (const lead of rows) {
    let structuredTranscript: StructuredTranscript | null = null;
    if (lead.structured_transcript) {
      try {
        structuredTranscript = typeof lead.structured_transcript === 'string'
          ? JSON.parse(lead.structured_transcript)
          : lead.structured_transcript;
      } catch {
        structuredTranscript = null;
      }
    }

    const result = classifyTranscript(
      lead.transcript,
      structuredTranscript,
      config
    );

    // Upsert into transcript_quality_assessments
    await db.execute(sql`
      INSERT INTO transcript_quality_assessments
        (id, lead_id, campaign_id, call_attempt_id,
         transcript_status, transcript_source, has_both_sides,
         diarization_used, speaker_labels, quality_metrics,
         last_validated_at, created_at, updated_at)
      VALUES (
        gen_random_uuid()::text,
        ${lead.id},
        ${lead.campaign_id},
        ${lead.call_attempt_id},
        ${result.status}::transcript_quality_status,
        'existing'::transcript_source_type,
        ${result.hasBothSides},
        ${result.diarizationUsed},
        ${JSON.stringify(result.speakerLabels)}::jsonb,
        ${JSON.stringify(result.metrics)}::jsonb,
        now(),
        now(),
        now()
      )
      ON CONFLICT (lead_id)
      DO UPDATE SET
        transcript_status = EXCLUDED.transcript_status,
        has_both_sides = EXCLUDED.has_both_sides,
        diarization_used = EXCLUDED.diarization_used,
        speaker_labels = EXCLUDED.speaker_labels,
        quality_metrics = EXCLUDED.quality_metrics,
        last_validated_at = now(),
        updated_at = now()
    `);

    assessed++;

    // Check if retranscription is needed
    if (
      (result.status === 'missing' || result.status === 'partial') &&
      (lead.recording_url || lead.recording_s3_key)
    ) {
      retranscriptionNeeded++;
    }
  }

  console.log(`[UKEF-TQA] Assessed ${assessed} leads | ${retranscriptionNeeded} need retranscription`);
  return { assessed, retranscriptionNeeded };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyMetrics(): QualityMetrics {
  return {
    duration_seconds: null,
    transcript_coverage_ratio: null,
    empty_ratio: 1,
    avg_confidence: null,
    turn_count: 0,
    speaker_balance_ratio: 0,
    word_count: 0,
    char_count: 0,
    unique_speakers: 0,
  };
}
