-- Add project attachment fields to campaigns
-- These are populated from linked client projects when auto-creating campaigns.

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS landing_page_url TEXT;

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS project_file_url TEXT;

COMMENT ON COLUMN campaigns.landing_page_url IS 'Client landing page URL (populated from linked project)';
COMMENT ON COLUMN campaigns.project_file_url IS 'Client uploaded project brief/assets URL (populated from linked project)';

