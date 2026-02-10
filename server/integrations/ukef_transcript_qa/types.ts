/**
 * UKEF Transcript Quality + Disposition Validation Pipeline — Type Definitions
 *
 * Types for the UKEF transcript quality assessment, retranscription,
 * and disposition validation pipeline.
 *
 * Client: Lightcast (UKEF) only
 * Feature flag: ukef_transcript_qa
 */

// Re-export shared UKEF constants from the reports module
export { UKEF_CLIENT_ACCOUNT_ID, UKEF_CLIENT_NAME, UKEF_CUTOFF_DATE, RECORDING_URL_EXPIRY_SECONDS } from '../ukef_reports/types';

// ─── Enums / Status ─────────────────────────────────────────────────────────

export type TranscriptQualityStatus = 'missing' | 'partial' | 'complete' | 'failed';
export type TranscriptSourceType = 'existing' | 'retranscribed';
export type DispositionValidationStatus = 'pending' | 'validated' | 'mismatch' | 'auto_corrected' | 'reviewed';

// ─── Quality Metrics ─────────────────────────────────────────────────────────

export interface QualityMetrics {
  duration_seconds: number | null;
  transcript_coverage_ratio: number | null; // 0-1
  empty_ratio: number;                       // 0-1
  avg_confidence: number | null;             // 0-1
  turn_count: number;
  speaker_balance_ratio: number;             // 0-1, 0.5 = balanced
  word_count: number;
  char_count: number;
  unique_speakers: number;
}

export interface EvidenceSnippet {
  quote: string;
  relevance: string;
}

// ─── Transcript Quality Assessment ──────────────────────────────────────────

export interface TranscriptQualityAssessment {
  id: string;
  leadId: string;
  campaignId: string | null;
  callAttemptId: string | null;
  transcriptStatus: TranscriptQualityStatus;
  transcriptSource: TranscriptSourceType;
  hasBothSides: boolean;
  diarizationUsed: boolean;
  speakerLabels: string[];
  qualityMetrics: QualityMetrics;
  lastTranscribedAt: Date | null;
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Disposition Review Task ────────────────────────────────────────────────

export interface DispositionReviewTask {
  id: string;
  leadId: string;
  campaignId: string | null;
  callAttemptId: string | null;
  existingDisposition: string | null;
  recommendedDisposition: string | null;
  validationStatus: DispositionValidationStatus;
  confidence: number | null;
  confidenceThreshold: number | null;
  evidenceSnippets: EvidenceSnippet[];
  rationale: string | null;
  analysisOutput: Record<string, unknown>;
  analysisModel: string | null;
  analysisProvider: string | null;
  autoCorrected: boolean;
  previousDisposition: string | null;
  correctedBy: string | null;
  correctedAt: Date | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── AI Disposition Analysis Result ─────────────────────────────────────────

export interface DispositionAnalysisResult {
  recommended_disposition: string;
  confidence: number;          // 0-1
  evidence_snippets: EvidenceSnippet[];
  rationale: string;
  call_summary: string;
  interest_indicators: string[];
  objection_indicators: string[];
  qualification_status: 'qualified' | 'not_qualified' | 'ambiguous';
}

// ─── Pipeline Configuration ─────────────────────────────────────────────────

export interface PipelineConfig {
  /** Confidence threshold above which auto-correction is allowed */
  autoCorrectThreshold: number;
  /** Minimum word count to consider a transcript "complete" */
  minWordCount: number;
  /** Minimum speaker count for "both sides" */
  minSpeakers: number;
  /** Maximum leads to process per pipeline run */
  batchSize: number;
  /** Whether auto-correction is enabled (audit mode = false) */
  autoCorrectEnabled: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  autoCorrectThreshold: 0.95,
  minWordCount: 30,
  minSpeakers: 2,
  batchSize: 50,
  autoCorrectEnabled: false, // Audit mode by default — safe
};

// ─── API Response Types ─────────────────────────────────────────────────────

export interface PipelineStatusResponse {
  lastRun: Date | null;
  totalAssessed: number;
  transcriptStats: {
    missing: number;
    partial: number;
    complete: number;
    failed: number;
  };
  dispositionStats: {
    pending: number;
    validated: number;
    mismatch: number;
    auto_corrected: number;
    reviewed: number;
  };
  retranscriptionQueue: number;
  reviewQueue: number;
}

export interface ReviewQueueItem {
  id: string;
  leadId: string;
  contactName: string | null;
  contactEmail: string | null;
  campaignName: string | null;
  existingDisposition: string | null;
  recommendedDisposition: string | null;
  confidence: number | null;
  rationale: string | null;
  evidenceSnippets: EvidenceSnippet[];
  transcriptPreview: string | null;
  validationStatus: DispositionValidationStatus;
  createdAt: Date;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PipelineRunResponse {
  success: boolean;
  assessed: number;
  retranscribed: number;
  validated: number;
  mismatches: number;
  errors: number;
  durationMs: number;
}

export interface ReviewActionResponse {
  success: boolean;
  taskId: string;
  action: 'accept' | 'reject' | 'override';
  newDisposition?: string;
}
