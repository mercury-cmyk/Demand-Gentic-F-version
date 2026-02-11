-- AI-Powered Queue Intelligence columns
ALTER TABLE campaign_queue ADD COLUMN IF NOT EXISTS ai_priority_score INTEGER;
ALTER TABLE campaign_queue ADD COLUMN IF NOT EXISTS ai_scored_at TIMESTAMPTZ;
ALTER TABLE campaign_queue ADD COLUMN IF NOT EXISTS ai_score_breakdown JSONB;
