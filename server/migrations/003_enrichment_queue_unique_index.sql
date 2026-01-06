-- Migration: Add unique partial index to prevent duplicate active enrichment jobs
-- Date: 2025-01-13
-- Purpose: Atomically prevent race conditions when queuing enrichment jobs

-- Create unique partial index on verification_enrichment_jobs
-- This ensures only ONE pending or processing job exists per campaign at a time
CREATE UNIQUE INDEX IF NOT EXISTS verification_enrichment_jobs_unique_active_campaign 
ON verification_enrichment_jobs (campaign_id) 
WHERE status IN ('pending', 'processing');

-- Add comment for documentation
COMMENT ON INDEX verification_enrichment_jobs_unique_active_campaign IS 
'Prevents duplicate pending/processing enrichment jobs per campaign. Race condition protection for concurrent API requests.';
