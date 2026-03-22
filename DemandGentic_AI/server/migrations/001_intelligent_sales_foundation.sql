-- Migration: Intelligent Sales Operating System - Phase 1 Foundation
-- Created: 2025-11-10
-- Description: Adds scoring fields to pipeline_opportunities and creates core tables
--              for activity tracking, lead capture, and AI-powered deal intelligence.

-- ============================================================================
-- STEP 1: Create new enums for intelligent sales system
-- ============================================================================

CREATE TYPE IF NOT EXISTS deal_activity_type AS ENUM (
  'email_received',
  'email_sent',
  'meeting_scheduled',
  'meeting_completed',
  'call_completed',
  'note_added',
  'document_shared',
  'proposal_sent',
  'contract_sent',
  'stage_changed',
  'score_updated',
  'lead_captured'
);

CREATE TYPE IF NOT EXISTS deal_insight_type AS ENUM (
  'sentiment',
  'intent',
  'urgency',
  'next_action',
  'stage_recommendation',
  'risk_flag'
);

CREATE TYPE IF NOT EXISTS lead_form_type AS ENUM (
  'ebook_download',
  'whitepaper_download',
  'infographic_download',
  'case_study_download',
  'proposal_request',
  'demo_request',
  'contact_form',
  'linkedin_engagement',
  'webinar_registration'
);

CREATE TYPE IF NOT EXISTS stage_transition_reason AS ENUM (
  'manual',
  'ai_suggested',
  'ai_automatic',
  'workflow_rule',
  'system'
);

-- ============================================================================
-- STEP 2: Add scoring fields to pipeline_opportunities
-- ============================================================================

ALTER TABLE pipeline_opportunities 
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0;

ALTER TABLE pipeline_opportunities 
  ADD COLUMN IF NOT EXISTS fit_score INTEGER DEFAULT 0;

ALTER TABLE pipeline_opportunities 
  ADD COLUMN IF NOT EXISTS stage_probability INTEGER DEFAULT 0;

ALTER TABLE pipeline_opportunities 
  ADD COLUMN IF NOT EXISTS next_action_ai_suggestion TEXT;

ALTER TABLE pipeline_opportunities 
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- STEP 3: Add CHECK constraints for score validation (0-100 range)
-- ============================================================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_engagement_score_range'
  ) THEN
    ALTER TABLE pipeline_opportunities 
      ADD CONSTRAINT check_engagement_score_range 
      CHECK (engagement_score IS NULL OR (engagement_score >= 0 AND engagement_score = 0 AND fit_score = 0 AND stage_probability = 0 AND intent_score <= 100));
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Create deal_activities table (activity ledger)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_activities (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id VARCHAR(36) NOT NULL REFERENCES pipeline_opportunities(id) ON DELETE CASCADE,
  activity_type deal_activity_type NOT NULL,
  actor_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(320),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB,
  source_reference VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deal_activities_opportunity ON deal_activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_created ON deal_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_activities_type ON deal_activities(activity_type);

-- ============================================================================
-- STEP 5: Create lead_forms table (form definitions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_forms (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  form_type lead_form_type NOT NULL,
  pipeline_id VARCHAR(36) NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  initial_stage VARCHAR(120) NOT NULL,
  auto_assign_to_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  webhook_url VARCHAR(512),
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  asset_url VARCHAR(512),
  thank_you_message TEXT,
  form_config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_forms_pipeline ON lead_forms(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_lead_forms_active ON lead_forms(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- STEP 6: Create lead_form_submissions table (form submissions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_form_submissions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id VARCHAR(36) NOT NULL REFERENCES lead_forms(id) ON DELETE CASCADE,
  opportunity_id VARCHAR(36) REFERENCES pipeline_opportunities(id) ON DELETE SET NULL,
  submitter_email VARCHAR(320) NOT NULL,
  submitter_name VARCHAR(255),
  company_name VARCHAR(255),
  job_title VARCHAR(255),
  form_data JSONB NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  source_url VARCHAR(512),
  processed BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_form ON lead_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_processed ON lead_form_submissions(processed) WHERE NOT processed;
CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_email ON lead_form_submissions(submitter_email);

-- ============================================================================
-- Migration Complete
-- ============================================================================