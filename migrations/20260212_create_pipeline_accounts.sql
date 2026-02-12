-- Migration: Create pipeline_accounts table
-- Date: 2026-02-12
-- Depends on: pipelines, pipeline_opportunities, accounts, users tables

-- Step 1: Create the pipeline_account_stage enum
DO $$ BEGIN
  CREATE TYPE pipeline_account_stage AS ENUM (
    'unassigned',
    'assigned',
    'outreach',
    'engaged',
    'qualifying',
    'qualified',
    'disqualified',
    'on_hold'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Create pipeline_accounts table
CREATE TABLE IF NOT EXISTS pipeline_accounts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36),
  pipeline_id VARCHAR(36) NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- AE Assignment
  assigned_ae_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  assigned_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,

  -- Buyer Journey Stage
  journey_stage pipeline_account_stage NOT NULL DEFAULT 'unassigned',
  stage_changed_at TIMESTAMPTZ,

  -- AI Scoring
  priority_score INTEGER DEFAULT 0,
  readiness_score INTEGER DEFAULT 0,
  ai_recommendation TEXT,
  ai_recommended_ae_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  ai_recommendation_reason TEXT,

  -- Qualification Notes
  qualification_notes TEXT,
  disqualification_reason TEXT,

  -- Tracking
  last_activity_at TIMESTAMPTZ,
  touchpoint_count INTEGER DEFAULT 0,

  -- Converted opportunity reference
  converted_opportunity_id VARCHAR(36) REFERENCES pipeline_opportunities(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS pipeline_accounts_pipeline_idx ON pipeline_accounts(pipeline_id);
CREATE INDEX IF NOT EXISTS pipeline_accounts_account_idx ON pipeline_accounts(account_id);
CREATE INDEX IF NOT EXISTS pipeline_accounts_ae_idx ON pipeline_accounts(assigned_ae_id);
CREATE INDEX IF NOT EXISTS pipeline_accounts_stage_idx ON pipeline_accounts(journey_stage);
CREATE INDEX IF NOT EXISTS pipeline_accounts_priority_idx ON pipeline_accounts(priority_score DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_accounts_unique_idx ON pipeline_accounts(pipeline_id, account_id);
