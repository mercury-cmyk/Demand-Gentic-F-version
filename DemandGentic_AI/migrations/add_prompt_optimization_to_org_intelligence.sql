-- Migration: Add prompt optimization fields to account_intelligence
-- This allows storing organization behavioral settings in the database instead of env variables

ALTER TABLE org_intelligence_profiles
ADD COLUMN IF NOT EXISTS org_intelligence TEXT,
ADD COLUMN IF NOT EXISTS compliance_policy TEXT,
ADD COLUMN IF NOT EXISTS platform_policies TEXT,
ADD COLUMN IF NOT EXISTS agent_voice_defaults TEXT;

-- Add comment for documentation
COMMENT ON COLUMN org_intelligence_profiles.org_intelligence IS 'Brand identity, positioning, services, ICP - injected into AI prompts';
COMMENT ON COLUMN org_intelligence_profiles.compliance_policy IS 'Legal and ethical guidelines for AI agent behavior';
COMMENT ON COLUMN org_intelligence_profiles.platform_policies IS 'Tool permissions and automated change safety rules';
COMMENT ON COLUMN org_intelligence_profiles.agent_voice_defaults IS 'Voice conversation behavior defaults';