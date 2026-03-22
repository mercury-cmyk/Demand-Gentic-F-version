-- UKEF Transcript Quality + Disposition Validation Pipeline
-- Migration: Adds transcript_quality_assessments and disposition_review_tasks tables
-- Safe: All additive (CREATE IF NOT EXISTS). Does not modify existing tables.

-- ─── Enum: transcript_quality_status ─────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE transcript_quality_status AS ENUM (
        'missing',    -- No transcript at all
        'partial',    -- Transcript exists but incomplete (e.g., single speaker, low coverage)
        'complete',   -- Full transcript with both sides
        'failed'      -- Retranscription attempted but failed
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ─── Enum: transcript_source ────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE transcript_source_type AS ENUM (
        'existing',        -- Original transcript from live/background transcription
        'retranscribed'    -- Re-transcribed via UKEF QA pipeline
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ─── Enum: disposition_validation_status ────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE disposition_validation_status AS ENUM (
        'pending',       -- Not yet validated
        'validated',     -- Existing disposition matches recommended
        'mismatch',      -- Dispositions differ; review needed
        'auto_corrected', -- System auto-corrected with high confidence
        'reviewed'       -- Human reviewed and resolved
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ─── Table: transcript_quality_assessments ──────────────────────────────────
-- Stores transcript quality metadata for each lead. One row per lead.
-- Does NOT duplicate transcript text — references leads table.
CREATE TABLE IF NOT EXISTS transcript_quality_assessments (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,

    -- References
    lead_id VARCHAR(255) NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    campaign_id VARCHAR(255) REFERENCES campaigns(id),
    call_attempt_id VARCHAR(255),

    -- Quality status
    transcript_status transcript_quality_status NOT NULL DEFAULT 'missing',
    transcript_source transcript_source_type NOT NULL DEFAULT 'existing',
    has_both_sides BOOLEAN NOT NULL DEFAULT false,
    diarization_used BOOLEAN NOT NULL DEFAULT false,
    speaker_labels JSONB DEFAULT '[]'::jsonb,

    -- Quality metrics (computed from transcript analysis)
    quality_metrics JSONB DEFAULT '{}'::jsonb,
    -- Expected shape:
    -- {
    --   "duration_seconds": number | null,
    --   "transcript_coverage_ratio": number (0-1) | null,
    --   "empty_ratio": number (0-1),
    --   "avg_confidence": number (0-1) | null,
    --   "turn_count": number,
    --   "speaker_balance_ratio": number (0-1, 0.5 = balanced),
    --   "word_count": number,
    --   "char_count": number,
    --   "unique_speakers": number
    -- }

    -- Timestamps
    last_transcribed_at TIMESTAMP,
    last_validated_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),

    -- Ensure one assessment per lead
    CONSTRAINT uq_tqa_lead_id UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_tqa_lead_id ON transcript_quality_assessments(lead_id);
CREATE INDEX IF NOT EXISTS idx_tqa_campaign_id ON transcript_quality_assessments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tqa_status ON transcript_quality_assessments(transcript_status);
CREATE INDEX IF NOT EXISTS idx_tqa_has_both_sides ON transcript_quality_assessments(has_both_sides);

-- ─── Table: disposition_review_tasks ────────────────────────────────────────
-- Tracks disposition validation results and review queue items.
CREATE TABLE IF NOT EXISTS disposition_review_tasks (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,

    -- References
    lead_id VARCHAR(255) NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    campaign_id VARCHAR(255) REFERENCES campaigns(id),
    call_attempt_id VARCHAR(255),

    -- Disposition comparison
    existing_disposition VARCHAR(100),
    recommended_disposition VARCHAR(100),
    validation_status disposition_validation_status NOT NULL DEFAULT 'pending',
    confidence NUMERIC(5, 3),           -- 0.000 to 1.000
    confidence_threshold NUMERIC(5, 3), -- Threshold used for auto-correction

    -- Evidence / rationale
    evidence_snippets JSONB DEFAULT '[]'::jsonb,
    -- Expected shape: [{ "quote": "...", "relevance": "supports qualified" }]
    rationale TEXT,

    -- AI analysis output (full structured response)
    analysis_output JSONB DEFAULT '{}'::jsonb,
    analysis_model VARCHAR(100),
    analysis_provider VARCHAR(50),

    -- Audit trail
    auto_corrected BOOLEAN NOT NULL DEFAULT false,
    previous_disposition VARCHAR(100),
    corrected_by VARCHAR(100),    -- 'system' or user_id
    corrected_at TIMESTAMP,
    review_notes TEXT,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),

    -- One active review per lead (can have history via updated records)
    CONSTRAINT uq_drt_lead_id UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_drt_lead_id ON disposition_review_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_drt_campaign_id ON disposition_review_tasks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_drt_validation_status ON disposition_review_tasks(validation_status);
CREATE INDEX IF NOT EXISTS idx_drt_confidence ON disposition_review_tasks(confidence);

-- ─── Table: transcript_qa_audit_log ─────────────────────────────────────────
-- Immutable audit trail for all pipeline actions.
CREATE TABLE IF NOT EXISTS transcript_qa_audit_log (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    lead_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL, -- 'retranscribe', 'validate_disposition', 'auto_correct', 'manual_review', 'pipeline_run'
    old_value JSONB,
    new_value JSONB,
    performed_by VARCHAR(255) NOT NULL DEFAULT 'system',  -- 'system' or user_id
    model_version VARCHAR(100),
    provider VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tqa_audit_lead_id ON transcript_qa_audit_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_tqa_audit_action ON transcript_qa_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_tqa_audit_created ON transcript_qa_audit_log(created_at);