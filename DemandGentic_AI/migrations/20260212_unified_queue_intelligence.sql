-- Migration: Unified Queue Intelligence
-- Date: 2026-02-12
-- Purpose: Add AI priority scoring columns to agent_queue table so both
--          human (agent_queue) and AI (campaign_queue) agents share the
--          same intelligent queue scoring system.

-- Add intelligence scoring columns to agent_queue (mirrors campaign_queue columns)
ALTER TABLE agent_queue ADD COLUMN IF NOT EXISTS ai_priority_score INTEGER;
ALTER TABLE agent_queue ADD COLUMN IF NOT EXISTS ai_scored_at TIMESTAMP;
ALTER TABLE agent_queue ADD COLUMN IF NOT EXISTS ai_score_breakdown JSONB;

-- Index for intelligence-aware pull ordering
CREATE INDEX IF NOT EXISTS agent_queue_intelligence_pull_idx
  ON agent_queue (campaign_id, queue_state, ai_priority_score DESC NULLS LAST, priority DESC, created_at ASC)
  WHERE queue_state = 'queued';

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Unified Queue Intelligence migration complete. agent_queue now has ai_priority_score, ai_scored_at, ai_score_breakdown columns.';
END $$;