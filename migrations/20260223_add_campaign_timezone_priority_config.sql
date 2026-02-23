-- Add timezone priority configuration to campaigns for timezone-aware prioritization.
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS timezone_priority_config jsonb;
