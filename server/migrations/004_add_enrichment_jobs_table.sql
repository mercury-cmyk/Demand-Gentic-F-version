-- Migration: Add Verification Enrichment Jobs Table
-- Purpose: Background job tracking for AI-powered company enrichment with account-level deduplication
-- Date: 2025-11-13

-- Create enrichment job status enum
CREATE TYPE enrichment_job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- Create verification enrichment jobs table
CREATE TABLE verification_enrichment_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id VARCHAR NOT NULL REFERENCES verification_campaigns(id) ON DELETE CASCADE,
  status enrichment_job_status NOT NULL DEFAULT 'pending',
  
  -- Contact and account counts
  total_contacts INTEGER NOT NULL DEFAULT 0,
  total_accounts INTEGER NOT NULL DEFAULT 0,
  processed_contacts INTEGER NOT NULL DEFAULT 0,
  processed_accounts INTEGER NOT NULL DEFAULT 0,
  
  -- Chunk tracking
  current_chunk INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER NOT NULL DEFAULT 25,
  
  -- Result counts
  success_count INTEGER NOT NULL DEFAULT 0,
  low_confidence_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  
  -- Error tracking
  errors JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  
  -- Job data
  contact_ids JSONB,
  account_ids JSONB,
  dedupe_snapshot JSONB,
  
  -- Flags and metadata
  force BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  
  -- Timestamps
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX verification_enrichment_jobs_campaign_idx ON verification_enrichment_jobs(campaign_id);
CREATE INDEX verification_enrichment_jobs_status_idx ON verification_enrichment_jobs(status);
CREATE INDEX verification_enrichment_jobs_created_at_idx ON verification_enrichment_jobs(created_at);

-- Create unique partial index to prevent duplicate active jobs per campaign
-- This ensures only one pending/processing job can exist per campaign at a time
CREATE UNIQUE INDEX verification_enrichment_jobs_unique_active_campaign 
  ON verification_enrichment_jobs(campaign_id) 
  WHERE status IN ('pending', 'processing');

-- Add comment to table
COMMENT ON TABLE verification_enrichment_jobs IS 'Background job tracking for AI-powered company enrichment with account-level deduplication and global rate limiting';
