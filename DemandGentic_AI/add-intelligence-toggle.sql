-- Migration: Add account intelligence toggle to campaigns
-- This allows campaigns to work without waiting for intelligence generation

-- Add new field to campaigns table
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS require_account_intelligence BOOLEAN DEFAULT false;

-- Add index for filtering campaigns by this setting
CREATE INDEX IF NOT EXISTS campaigns_require_account_intelligence_idx
ON campaigns(require_account_intelligence);

-- Comment to document the field
COMMENT ON COLUMN campaigns.require_account_intelligence IS
'When true, campaign calls will wait for/generate account intelligence. When false, calls proceed immediately with campaign context only. Allows campaigns to work without intelligence delays.';

-- Set existing Pivotal campaigns to require intelligence (since we're generating it)
UPDATE campaigns
SET require_account_intelligence = true
WHERE (name LIKE '%Pivotal B2B%' OR name LIKE '%Agentic DemandGen%')
  AND dial_mode = 'ai_agent';