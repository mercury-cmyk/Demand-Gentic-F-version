-- Migration: Add analysis status tracking to call_sessions
-- Purpose: Track post-call analysis lifecycle so failed analyses can be recovered
-- instead of silently disappearing

-- Create the analysis_status enum
DO $$ BEGIN
  CREATE TYPE analysis_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add analysis lifecycle columns to call_sessions
ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS analysis_status analysis_status DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS analysis_failed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS analysis_retry_count INTEGER DEFAULT 0;

-- Index for recovery sweep queries
CREATE INDEX IF NOT EXISTS call_sessions_analysis_status_idx
  ON call_sessions (analysis_status);

-- Backfill: Mark existing sessions that already have analysis as 'completed'
UPDATE call_sessions
  SET analysis_status = 'completed'
  WHERE ai_analysis IS NOT NULL
    AND analysis_status = 'pending';

-- Backfill: Mark sessions older than 24h with no analysis as 'failed'
-- so the recovery sweep can pick them up
UPDATE call_sessions
  SET analysis_status = 'failed',
      analysis_failed_at = NOW(),
      analysis_retry_count = 0
  WHERE ai_analysis IS NULL
    AND analysis_status = 'pending'
    AND created_at = 20;