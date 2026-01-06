-- Migration: Add prompt optimization fields to account_intelligence
-- This allows storing organization behavioral settings in the database instead of env variables

ALTER TABLE account_intelligence 
ADD COLUMN IF NOT EXISTS org_intelligence TEXT,
ADD COLUMN IF NOT EXISTS compliance_policy TEXT,
ADD COLUMN IF NOT EXISTS platform_policies TEXT,
ADD COLUMN IF NOT EXISTS agent_voice_defaults TEXT;

-- Add comment for documentation
COMMENT ON COLUMN account_intelligence.org_intelligence IS 'Brand identity, positioning, services, ICP - injected into AI prompts';
COMMENT ON COLUMN account_intelligence.compliance_policy IS 'Legal and ethical guidelines for AI agent behavior';
COMMENT ON COLUMN account_intelligence.platform_policies IS 'Tool permissions and automated change safety rules';
COMMENT ON COLUMN account_intelligence.agent_voice_defaults IS 'Voice conversation behavior defaults';
